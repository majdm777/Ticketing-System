import crypto from 'crypto';

import { env } from './env';
import { prisma } from './prisma';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateReferenceCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

// Ticket tokens are signed with a secret that is deliberately distinct from
// the admin session secret (docs/event-ticketing-flow.md): compromising the
// session secret must not let an attacker mint valid tickets. A ticket without
// a valid signature is worse than no ticket, so an unset secret fails closed —
// it throws rather than issuing unsigned tokens.
function ticketSecret() {
  if (!env.ticketSecret) {
    throw new Error('TICKET_SECRET is not configured');
  }

  return env.ticketSecret;
}

function signTicketPayload(payload: string) {
  return crypto.createHmac('sha256', ticketSecret()).update(payload).digest('hex');
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export type TicketToken = {
  bookingId: string;
  issuedAt: number;
};

export function generateTicketToken(bookingId: string, now = Date.now()) {
  const payload = `${bookingId}.${now}`;
  return `${payload}.${signTicketPayload(payload)}`;
}

export function verifyTicketToken(value?: string): TicketToken | null {
  if (!value) {
    return null;
  }

  const parts = value.split('.');
  if (parts.length < 3) {
    return null;
  }

  const signature = parts.pop();
  const issuedAtRaw = parts.pop();
  const bookingId = parts.join('.');

  if (!signature || !issuedAtRaw) {
    return null;
  }

  const issuedAt = Number(issuedAtRaw);

  if (!bookingId || !Number.isFinite(issuedAt)) {
    return null;
  }

  const payload = `${bookingId}.${issuedAt}`;
  if (!safeEqual(signature, signTicketPayload(payload))) {
    return null;
  }

  return { bookingId, issuedAt };
}

// Claims a booking's ticket token exactly once, or adopts the token another
// caller already claimed. The guarded updateMany (WHERE ticketToken IS NULL)
// is what makes the claim atomic: two near-simultaneous calls generate two
// different tokens, exactly one update affects a row, and the loser's update
// affects 0 rows so it re-reads and returns the winner's stored token. Every
// caller therefore converges on one token per booking. Never log the token.
export async function ensureTicketToken(bookingId: string): Promise<string> {
  const token = generateTicketToken(bookingId);
  const claimed = await prisma.booking.updateMany({
    where: { id: bookingId, ticketToken: null },
    data: { ticketToken: token },
  });

  if (claimed.count === 1) {
    return token;
  }

  const existing = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { ticketToken: true },
  });

  if (!existing.ticketToken) {
    throw new Error('Could not claim a ticket token');
  }

  return existing.ticketToken;
}