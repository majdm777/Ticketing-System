import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from './env';

export type SendTicketInput = {
  phone: string;
  pdfBuffer: Buffer;
  eventName: string;
  seatLabels: string[];
};

export type SendTicketResult = { ok: true } | { ok: false; error: string };

const TEMPLATE_LANGUAGE = 'en';

const MOCK_OUTBOX = join(tmpdir(), 'whatsapp-mock-outbox.jsonl');

// Meta Cloud API error bodies are `{ error: { message, code, error_subcode } }`.
// The message is provider-authored and free of our secrets, so it is safe to
// surface (truncated) to the admin — it is never a token, phone number, or
// stack trace.
type MetaErrorBody = { error?: { message?: string } };

function extractMetaError(body: unknown): string {
  if (body && typeof body === 'object') {
    const message = (body as MetaErrorBody).error?.message?.trim();
    if (message) {
      return message.length > 160 ? `${message.slice(0, 157)}...` : message;
    }
  }
  return 'WhatsApp provider error.';
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'tickets';
}

async function uploadMedia(
  signal: AbortSignal,
  pdfBuffer: Buffer,
  token: string,
  phoneNumberId: string,
): Promise<string> {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'application/pdf');
  form.append(
    'file',
    new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' }),
    'tickets.pdf',
  );

  const response = await fetch(
    `https://graph.facebook.com/${env.whatsappApiVersion}/${phoneNumberId}/media`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal,
    },
  );
  const body = await response.json().catch(() => null);

  if (!response.ok || !body || typeof (body as { id?: unknown }).id !== 'string') {
    throw new Error(extractMetaError(body));
  }

  return (body as { id: string }).id;
}

type MessagePayload = {
  messaging_product: 'whatsapp';
  to: string;
  type: 'document' | 'template';
  document?: { id: string; caption: string; filename: string };
  template?: {
    name: string;
    language: { code: string };
    components: Array<{
      type: string;
      parameters: Array<{ type: string; document?: { id: string; filename: string } }>;
    }>;
  };
};

function documentPayload(
  phone: string,
  mediaId: string,
  eventName: string,
  seatLabels: string[],
): MessagePayload {
  const filename = `${slugify(eventName)}-tickets.pdf`;
  const caption =
    seatLabels.length === 1
      ? `Your ticket for ${eventName} (${seatLabels[0]})`
      : `Your ${seatLabels.length} tickets for ${eventName}`;
  return {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'document',
    document: { id: mediaId, caption, filename },
  };
}

function templatePayload(
  phone: string,
  mediaId: string,
  eventName: string,
): MessagePayload {
  const filename = `${slugify(eventName)}-tickets.pdf`;
  return {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: env.whatsappTemplateName!,
      language: { code: TEMPLATE_LANGUAGE },
      components: [
        {
          type: 'header',
          parameters: [
            { type: 'document', document: { id: mediaId, filename } },
          ],
        },
      ],
    },
  };
}

async function sendMessage(
  signal: AbortSignal,
  phone: string,
  mediaId: string,
  eventName: string,
  seatLabels: string[],
  token: string,
  phoneNumberId: string,
) {
  const payload = env.whatsappTemplateName
    ? templatePayload(phone, mediaId, eventName)
    : documentPayload(phone, mediaId, eventName, seatLabels);

  const response = await fetch(
    `https://graph.facebook.com/${env.whatsappApiVersion}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    },
  );
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractMetaError(body));
  }
}

// Uploads the ticket PDF and sends it as a WhatsApp document message. Fails
// closed: if the provider credentials are not configured it reports failure
// without attempting a send — a ticket must never silently go un-sent while
// looking successful. Both HTTP calls share one timeout so a hung provider
// cannot hold the admin request open past SEND_TIMEOUT_MS.
//
// With WHATSAPP_MOCK_MODE=true the provider is not contacted: the payload that
// would have been sent is appended (JSONL) to $TMPDIR/whatsapp-mock-outbox.jsonl
// and mirrored to the server log. WHATSAPP_MOCK_FAIL=true additionally simulates
// a provider rejection so the admin failure path can be exercised locally.
export async function sendTicket(input: SendTicketInput): Promise<SendTicketResult> {
  if (env.whatsappMockMode) {
    return mockSendTicket(input, env.whatsappMockFail);
  }

  const { whatsappAccessToken, whatsappPhoneNumberId, sendTimeoutMs } = env;

  if (!whatsappAccessToken || !whatsappPhoneNumberId) {
    return { ok: false, error: 'WhatsApp is not configured.' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), sendTimeoutMs);

  try {
    const mediaId = await uploadMedia(
      controller.signal,
      input.pdfBuffer,
      whatsappAccessToken,
      whatsappPhoneNumberId,
    );
    await sendMessage(
      controller.signal,
      input.phone,
      mediaId,
      input.eventName,
      input.seatLabels,
      whatsappAccessToken,
      whatsappPhoneNumberId,
    );
    return { ok: true };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, error: 'WhatsApp send timed out.' };
    }
    if (error instanceof Error && error.message) {
      return { ok: false, error: error.message.slice(0, 200) };
    }
    return { ok: false, error: 'WhatsApp send failed.' };
  } finally {
    clearTimeout(timeout);
  }
}

// Local stand-in for the Meta Cloud API (WHATSAPP_MOCK_MODE=true). Reuses the
// real payload builders so the document-vs-template shape is exercised, but no
// network request is made and no credentials are required.
function mockSendTicket(input: SendTicketInput, fail: boolean): SendTicketResult {
  const payload = env.whatsappTemplateName
    ? templatePayload(input.phone, 'mock-media-id', input.eventName)
    : documentPayload(input.phone, 'mock-media-id', input.eventName, input.seatLabels);

  const record = {
    at: new Date().toISOString(),
    phone: payload.to,
    eventName: input.eventName,
    seatLabels: input.seatLabels,
    type: payload.type,
    filename: payload.document?.filename ?? payload.template?.components?.[0]?.parameters?.[0]?.document?.filename,
    caption: payload.document?.caption,
    fail: fail || undefined,
  };

  appendFileSync(MOCK_OUTBOX, `${JSON.stringify(record)}\n`);
  console.log(`[whatsapp-mock] ${fail ? 'rejected' : 'sent'} ${JSON.stringify(record)}`);

  if (fail) {
    return { ok: false, error: '#131030 (mock) Recipient phone number not in allowed list' };
  }
  return { ok: true };
}
