# WhatsApp Ticket Delivery — Task Breakdown

Build ticket delivery over WhatsApp: once a booking is `CONFIRMED`, generate a
signed ticket token and a printable ticket PDF, deliver it to the attendee's
phone over WhatsApp, and let the admin **resend** it if delivery failed.
This is the "Receive a ticket over WhatsApp once their booking is confirmed"
flow (public) and the "Resend a ticket if delivery failed" admin flow from
`docs/event-ticketing-flow.md` — both are out of scope of the existing
product panels but are in scope for **this** task.

Read `docs/event-ticketing-flow.md` and `docs/event-ticketing-database-schema.md`
first — they are the source of truth for the domain and schema.

> IMPORTANT: this repo uses a modified Next.js version (see AGENTS.md). Before
> writing any code, read the relevant guides in `node_modules/next/dist/docs/`
> (route handlers, Server Actions, cookies, caching) — APIs may differ from
> what you already know. Heed deprecation notices.
> Also check whether the repo's modified Next.js restricts new dependencies
> before adding a PDF library (see Shared Conventions below).

---

## What already exists (do NOT rebuild)

- `Booking` model (`prisma/schema.prisma`) already reserves the ticket
  fields: `ticketToken String? @unique`, `ticketPdfUrl String?`,
  `ticketSentAt DateTime?`, `ticketNote String?`. They are unused today —
  this feature is the consumer they were reserved for.
- `TICKET_SECRET` is already an env var name (`.env.example`) and already
  parsed in `src/lib/env.ts` (`env.ticketSecret`) — currently unused by any
  code. The flow doc requires it to be a **distinct** signing secret from
  `ADMIN_SESSION_SECRET`; keep it that way.
- `src/lib/tickets.ts` — currently only `generateReferenceCode`. This is
  where ticket-token helpers belong.
- `confirmBooking` in `src/lib/seat-locking.ts` flips a booking
  `PENDING → CONFIRMED` (and its seat `PENDING → BOOKED`). The auto-send
  hooks in after this succeeds.
- Admin booking review — `src/app/admin/bookings/page.tsx` + the action
  layer in `src/lib/actions/bookings.ts`; this is where the resend UI and
  action plug in (follow the existing `PendingBookingActions` + `useActionState`
  pattern).
- `src/lib/currency.ts` (`formatUsd`) and `src/lib/format.ts` (`formatDate`)
  — reuse for ticket content.
- Privacy constraint from the flow doc: **no model stores more attendee data
  than `userName`/`userPhone`** — the reserved ticket fields are all this
  feature may touch; add no new attendee columns.

---

## Design overview

```text
confirmBooking (seat-locking.ts)
   └─> on success, call sendTicketsForBookings(bookingIds)   [auto-send]
         ├─ ensureTicketToken(booking)    -> signed token, stored in ticketToken
         ├─ buildTicketPdf(booking)       -> PDF, stored; ticketPdfUrl set
         └─ whatsapp.sendTicket({ phone, deliveryUrl, ... })
               -> ticketSentAt on success / ticketNote on failure
Admin "Resend" action -> sendTicketForBooking(bookingId)   [same pipeline]
```

- **Token first, always**: a signed `ticketToken` is generated once per
  confirmed booking. It is the verification value embedded in the ticket's QR
  code and is reserved for future ticket scanning (out of scope here, but the
  token must be generated now so a ticket never exists without one).
- **Claim, don't race**: the token and the PDF's **canonical reference** are
  each stored with a **compare-and-set** guarded update inside short
  transactions — never "read then write if null" (see Tasks 1–2). Two
  concurrent sends for the same booking must converge on **one** canonical
  token and **one** canonical PDF reference; the loser adopts the winner's
  stored values instead of writing its own.
- **`ticketPdfUrl` is a canonical reference, not a delivery URL**: the stored
  value is a stable, unguessable, **non-expiring** identifier of the PDF
  object (object key / blob path / stable CDN URL). Short-lived **signed
  delivery URLs are minted fresh per send** from this reference, with a TTL
  that covers the event date — so an admin resend always produces a live URL
  and an old one expiring never blocks delivery. See Task 2 for the contract.
- **PDF encodes the winner**: the PDF is generated **only after** the token is
  claimed and re-read, and encodes exactly that canonical token — a PDF is
  never built from a token that lost the race (that would yield a QR that
  fails verification).
- **Send is outside any transaction**: the WhatsApp call cannot be made atomic
  with the database. Sends run outside transactions, are keyed by a stable
  per-booking **idempotency key** so retries never double-send (Task 3), and
  delivery fields are updated with a guarded write afterwards (Task 4).
- **Transport is pluggable**: the WhatsApp provider lives behind a small
  interface so it can be swapped (Meta Business Cloud API, Twilio, a gateway)
  without touching the ticket pipeline.

---

## Task 1: Ticket token

Extend `src/lib/tickets.ts`:

- `generateTicketToken(booking)` → a signed, URL-safe token, unique per
  booking, following the same HMAC pattern as the admin session cookie
  (`createSessionValue` in `src/lib/admin-session.ts`) but with
  **`TICKET_SECRET`** — e.g. `bookingId.<expiresAt or issuedAt>.<hmacSignature>`,
  base64url-encoded payload.
- A verify helper (mirror of `verifySessionValue`) so a future scanning
  feature can validate a token without sharing the secret.
- Rules:
  - Sign with `env.ticketSecret`; **fail closed** if it is unset (a ticket
    without a valid signature is worse than no ticket) — throw before any
    send.
  - Never log the full token.
  - **Claim the token with compare-and-set**: in a short transaction, store it
    with a guarded conditional update
    (`booking.updateMany({ where: { id, ticketToken: null }, data: { ticketToken } })`).
    Affected count `1` → this caller's token won and is canonical; affected
    count `0` → a concurrent caller already claimed one — **re-read**
    `Booking.ticketToken` and adopt that value (discard the generated one).
    This selects exactly one winner across any number of concurrent callers
    and never trips the `@unique` constraint. Do **not** couple this write to
    `ticketSentAt` — the send is not part of this transaction (see Tasks 3–4).

## Task 2: Ticket PDF

- `src/lib/ticket-pdf.ts` → `buildTicketPdf(booking)` returns the PDF file
  (buffer/stream) and the **canonical reference** to store in `ticketPdfUrl`.
- Content (all fields already on `Booking` + relations): event name, date/time
  via `formatDate`, venue name + address, seat row/number, section name +
  price via `formatUsd`, `referenceCode` (when present), and the ticket
  `ticketToken` rendered as a **QR code**.
- Library decision — **ask before adding a dependency** (no new libraries
  without asking, per both task docs): recommended
  `@react-pdf/renderer` (server-renderable React, matches the stack) plus
  `qrcode` to rasterize the QR into the PDF. Alternatives are `pdfkit` /
  `jspdf`. Keep the output a single compact page, print- and phone-friendly.
- **Storage / URL contract — resolve before implementation**:
  `ticketPdfUrl` stores a **canonical object reference**: a stable,
  unguessable, **non-expiring** identifier of the stored PDF object (e.g. an
  object key like `tickets/<bookingId>-<ticketToken>.pdf`, a blob path, or a
  stable CDN URL). It is **never** a short-lived signed URL. It is set once by
  the compare-and-set pattern (Task 1's shape) and reused unchanged by every
  resend.
- **Delivery URLs are minted per send**: each send derives a **fresh**
  signed/expiring delivery URL from the canonical reference
  (`mintDeliveryUrl(reference, ttl)` — e.g. a signed/one-time URL). TTL
  default: cover the event (`event.startsAt + 24h` margin), so the
  attendee's received link stays valid at least through the event and an
  admin resend always gets a live URL. Revocation is inherent: delivery URLs
  are signed and time-bound, no new URL is minted once the booking is no
  longer `CONFIRMED`, and a previously sent URL remains usable only until its
  TTL — record that as an accepted trade-off (add explicit URL revocation
  only if a requirement demands it).
- **PDF from the winner, stored by compare-and-set**: generate the PDF only
  from the **re-read** canonical `ticketToken` (Task 1) — never from a token
  this caller generated but lost the claim for. Store the URL with the same
  guarded pattern
  (`booking.updateMany({ where: { id, ticketPdfUrl: null }, data: { ticketPdfUrl } })`):
  affected `1` → this PDF won; affected `0` → re-read and reuse the stored
  URL. This guarantees the stored PDF always encodes the canonical token and
  that resends reuse one URL.

## Task 3: WhatsApp transport

- `src/lib/whatsapp.ts` exporting a small interface, e.g.
  `sendTicket({ toPhone, deliveryUrl, eventName, idempotencyKey }) =>
  Promise<void>` — `deliveryUrl` is the **freshly minted** per-send URL from
  Task 2, never the stored canonical `ticketPdfUrl` (throws a typed error the
  caller maps to `ticketNote`), with **one implementation** selected at build
  time:
  - **Meta WhatsApp Business Cloud API** — needs `WHATSAPP_TOKEN`,
    `WHATSAPP_PHONE_ID`, and an **approved message template** with variables
    for event name + ticket link/PDF (business-initiated messages must use
    templates; the ticket body is a template, not a free-text message).
  - **Twilio WhatsApp API** — needs `TWILIO_ACCOUNT_SID`,
    `TWILIO_AUTH_TOKEN`, `WHATSAPP_FROM`; same template/URL requirements on
    business-initiated sends.
- **E.164**: normalize `userPhone` (strip spaces/dashes, country prefix) or
  reject sending if it cannot be normalized to a valid WhatsApp number —
  WhatsApp requires international format. Never send to a phone the attendee
  did not provide.
- **Stable per-booking idempotency key**: `sendTicket` takes a stable key
  derived from the booking (e.g. `ticket-<bookingId>`), passed unchanged on
  every attempt, so a retry of the same send cannot deliver a duplicate
  message (Twilio: stable message/client identifier; Meta: stable
  `biz_opaque_callback_data` plus webhook dedupe on the returned message id).
  Callers check `ticketSentAt` is null before sending.
- **Guarded delivery writes**: after a successful provider response, record
  delivery with a guarded update
  (`booking.updateMany({ where: { id, ticketSentAt: null }, data: { ticketSentAt, ticketNote: null } })`)
  — this stamps delivery **and clears any stale failure note in the same
  write**. On failure, record `ticketNote` (trimmed, non-sensitive) with a
  write guarded the same way (`where: { id, ticketSentAt: null }`): if an
  earlier delivery already succeeded, the guarded update affects 0 rows, the
  prior `ticketSentAt` is preserved, and the failed resend does not re-surface
  a non-delivery state. A concurrent sender that already recorded delivery
  never has its state overwritten.
- Env vars (names only → `.env.example`): the chosen provider's creds plus
  `APP_BASE_URL` (to mint the absolute signed delivery URLs from the canonical
  reference) and `SEND_TIMEOUT_MS` (default ~10s). Parse via `src/lib/env.ts`
  with fail-closed behavior — a missing provider credential makes sends fail
  with a clear `ticketNote`, never a silent success.
- **Bounded provider call**: the transport must honor the send timeout
  (`AbortSignal.timeout`, or the provider client's equivalent) and reject on
  timeout; it must not hang the calling request (Task 4).

## Task 4: Auto-send on confirm + resend

- **Auto-send**: after `confirmBooking` succeeds, invoke the send pipeline
  for that booking (and for each booking in a multi-seat group when the admin
  confirms them). The pipeline runs **after** the confirm transaction commits
  and is fully outside the request's confirmation path — the confirmation is
  already committed and is never rolled back by a send failure.
  - **Bounded execution**: the pipeline runs under a hard timeout — a
    deadline on the pipeline as a whole plus an `AbortSignal.timeout` on the
    provider call itself (e.g. `SEND_TIMEOUT_MS`, default ~10s, env-parsed
    per the fail-closed env rules). A hung provider must release the request
    quickly, never hold the admin action open.
  - **Catch everything**: timeouts, provider errors, and unexpected
    exceptions are all caught; none propagate to the admin request. Every
    failure persists `ticketNote` (trimmed, non-sensitive) via the guarded
    write and leaves `ticketSentAt` null, which surfaces the "ticket not yet
    delivered" state in the UI.
  - **Durable retry**: if automatic retrying of failed sends is required,
    route sends through a **durable post-commit job** (queue/worker) instead
    of in-request retries — in-request retries just re-open the timeout
    problem. The in-request pipeline is fire-once + manual resend; the job is
    an alternative deployment of the same pipeline.
- **Resend action**: a Server Action (guarded by the admin session, same
  pattern as `confirmBookingAction` in `src/lib/actions/bookings.ts`):
  - Zod-validates `bookingId`.
  - Only `CONFIRMED` bookings can be (re)sent; anything else returns a typed
    error.
  - Reuses `ticketToken`/`ticketPdfUrl` (the canonical reference) when
    present; claims-and-re-reads (never races) whatever is missing via the
    Task 1–2 compare-and-set steps, then mints a **fresh delivery URL** from
    the canonical reference and re-runs the same guarded send pipeline.
  - On success writes `ticketSentAt` **and clears `ticketNote` to null** with
    a guarded update (`WHERE ticketSentAt = null`); on failure writes
    `ticketNote` (trimmed, non-sensitive) guarded on `ticketSentAt = null`,
    so a failed resend preserves an earlier successful `ticketSentAt` and
    does not re-surface a non-delivery state, and returns a typed
    `{ ok: false, error }` — a concurrent send cannot overwrite a sibling's
    delivery state.
  - `revalidatePath('/admin/bookings')` (and `/admin`) so the state updates
    inline.
- **UI**: on the admin bookings page, show a **Send / Resend ticket** control
  on each `CONFIRMED` row — enabled when `ticketSentAt` is null or
  `ticketNote` is set, and a small "delivered at / failed: <note>" indicator.
  Follow the existing `PendingBookingActions` `useActionState` component
  pattern; mobile-first (44px touch targets, etc.).

---

## Conventions that still apply

- **Seat locking**: do not alter the guarded `updateMany` transitions in
  `src/lib/seat-locking.ts`; the confirm path is untouched except for the
  post-commit send hook.
- **Validation**: Zod for every mutation input (resend action).
- **Errors**: typed results to the UI; never leak raw errors, stack traces,
  tokens, or phone numbers.
- **Secrets**: `TICKET_SECRET` and the WhatsApp provider creds are distinct
  env vars, names-only in `.env.example`, never committed.
- **UI**: English, mobile-first, no new UI library (PDF/QR libs are not UI —
  still ask first per the "no new libraries" convention).
- **Verification**: `npx tsc --noEmit` and `npm run lint` after each task.

---

## Acceptance criteria

- [ ] Confirming a booking auto-sends its ticket: `ticketToken` set and
      unique, `ticketPdfUrl` set, `ticketSentAt` set on successful delivery
- [ ] A ticket PDF contains event, date, venue, seat row/number, section +
      price, reference code (where present), and a QR encoding the signed
      token
- [ ] The ticket token verifies against `TICKET_SECRET` and fails against a
      different secret / tampered payload
- [ ] Two concurrent sends for the same booking converge on **one**
      `ticketToken` and **one** `ticketPdfUrl` (compare-and-set winner adopted
      by both); the stored PDF encodes the canonical token
- [ ] Concurrent/retried sends deliver at most **one** WhatsApp message per
      booking (stable idempotency key) and record `ticketSentAt` exactly once
      (guarded write)
- [ ] `ticketPdfUrl` stores a stable **canonical reference** only — never a
      short-lived signed URL; delivery URLs are minted **fresh per send** with
      a TTL covering the event date
- [ ] A resend after an earlier delivery URL expired still succeeds (a new URL
      is minted from the canonical reference); no delivery URL is minted for a
      booking that is no longer `CONFIRMED`
- [ ] Resend reuses the existing token + canonical PDF reference; it does not
      regenerate the ticket
- [ ] Resend on a non-`CONFIRMED` booking returns a typed error
- [ ] A failed delivery records `ticketNote` (non-sensitive), does not
      roll back the confirmation, and the bookings page shows the failure
      state with a working Resend
- [ ] A hung/slow provider call is cut off by the bounded timeout
      (`SEND_TIMEOUT_MS`), releases the admin request, and records
      `ticketNote` — the confirmation stays committed
- [ ] A successful (re)send stamps `ticketSentAt` **and clears any prior
      `ticketNote`**; a failed resend after an earlier successful delivery
      preserves the earlier `ticketSentAt` and records no failure state
- [ ] Unnormalizable phone numbers are rejected before any send
- [ ] Missing provider credentials or `TICKET_SECRET` fail closed — a send
      reports the failure, never a false success
- [ ] `.env.example` lists the new var names only
- [ ] `npx prisma generate`, `npx tsc --noEmit`, `npm run lint`, and
      `npm run build` all pass

---

## Out of scope (do NOT build here)

- Ticket **scanning/verification** at the door — the token is generated and
  reserved for it, but no verify endpoint or UI
- The scheduled expiry sweep (separate doc — `cron-expiry-sweep.md`)
- Multi-admin / role hierarchy
- Attendee accounts or any new attendee data beyond `userName`/`userPhone`
