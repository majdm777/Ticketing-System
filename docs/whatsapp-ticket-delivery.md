# WhatsApp Ticket Delivery — Task Breakdown (simplified)

Build ticket delivery over WhatsApp: once a booking is `CONFIRMED`, generate a
signed ticket token and a printable ticket PDF, send it to the attendee's
phone over WhatsApp, and let the admin **resend** it if delivery failed.

This is a deliberately **simplified** version of an earlier draft of this doc.
The earlier draft specified a durable outbox queue, compare-and-set claims
with fencing tokens, stale-claim worker recovery, and short-lived signed
delivery URLs with TTL-clamping/renewal — infrastructure appropriate for a
high-volume, multi-worker delivery system. This app is single-admin,
low-volume, and confirms bookings one at a time by hand — that complexity
solves reliability problems this app doesn't have, and would need reworking
once the schema settles anyway. This doc replaces it with the smallest
pipeline that's still honest about failure.

**Note**: the database schema is still being finalized. This doc is a plan to
implement *after* the schema stabilizes, not a spec to start on immediately —
expect it to change alongside schema decisions still in progress.

Read `docs/event-ticketing-flow.md` and `docs/event-ticketing-database-schema.md`
first — they are the source of truth for the domain and schema. If either
doc doesn't yet reflect the current real schema, reconcile before starting.

---

## What already exists (do NOT rebuild)

- `Booking` model already reserves the ticket fields: `ticketToken String?
  @unique`, `ticketPdfUrl String?`, `ticketSentAt DateTime?`, `ticketNote
  String?`. Unused today — this feature is the consumer they were reserved
  for. (No new model is needed for this simplified version — specifically,
  **no `TicketSendJob` table**.)
- `TICKET_SECRET` is already an env var name, parsed in the env-config
  module. Must remain a **distinct** signing secret from
  `ADMIN_SESSION_SECRET`.
- `src/lib/tickets.ts` — currently only `generateReferenceCode`. Ticket-token
  helpers belong here.
- `confirmBooking` (in the seat-locking module) flips a booking `PENDING →
  CONFIRMED` (and its seat `PENDING → BOOKED`). The send happens right after
  this succeeds — see Design below. `confirmBookingGroup` confirms a whole
  multi-seat request by confirming each member booking through the same
  guarded path, so it stays per-booking at this layer: a group confirm is just
  N per-booking confirmations in one transaction, and each confirmed booking
  triggers its own ticket send exactly as a single confirm does.
- Admin booking review page + its action layer — this is where the
  send/resend UI and action plug in, following whatever pattern is already
  established there.
- Privacy constraint from the flow doc: **no model stores more attendee data
  than `userName`/`userPhone`** — the reserved ticket fields are all this
  feature may touch.

---

## Design overview

```text
confirmBooking succeeds
   └─> inline, same request: sendTicket(bookingId)
         ├─ ensureTicketToken(booking)  -> signed token, stored once
         ├─ buildTicketPdf(booking)     -> PDF generated fresh, not stored
         └─ whatsapp.sendTicket({ phone, pdf, ... })
               -> success: ticketSentAt set, ticketNote cleared
               -> failure: ticketNote records why; booking stays CONFIRMED

Admin "Send" / "Resend" action -> sendTicket(bookingId)   [same function]
```

- **Token, once, ever.** A signed `ticketToken` is generated the first time a
  booking is confirmed and never regenerated after — same token for the life
  of the booking, across every resend. Reserved now for future ticket
  scanning (out of scope here), but must exist on every confirmed booking so
  a ticket is never issued without one.
- **No stored PDF.** The PDF is regenerated fresh on every send/resend from
  already-durable data (the booking, event, seat, and the one persisted
  token) — there is nothing to store, nothing to expire, no delivery-URL TTL
  problem to solve. `ticketPdfUrl` is **not used** in this simplified
  version; leave it null. (If a real need for a stored/downloadable copy
  shows up later — e.g. "let the admin re-download without re-sending" — add
  that as its own small follow-up, not by resurrecting the delivery-URL
  design above.)
- **Send is inline, not queued.** The WhatsApp call happens synchronously as
  part of the same confirm request (or the same resend action) — no
  background worker, no outbox table, no claim states. The tradeoff being
  accepted: if the process crashes in the narrow window between "booking
  confirmed" and "WhatsApp call finishes," the booking ends up `CONFIRMED`
  with `ticketSentAt` still null — indistinguishable from "never attempted."
  This is acceptable because the admin UI already needs a Send/Resend
  affordance for ordinary failures (bad number, provider hiccup); a crash
  just lands in that same, already-handled state. No user-facing send is
  ever silently lost without a visible "needs sending" state to recover
  from.
- **Guard against double-send, simply.** Two admins (or two tabs) clicking
  Send/Resend on the same booking near-simultaneously is a real but very
  low-probability case at this app's scale (one admin, confirming bookings
  by hand). Guard it with a single conditional update after a successful
  provider response — `booking.updateMany({ where: { id, status:
  'CONFIRMED' }, data: { ticketSentAt: now, ticketNote: null } })` — no
  fencing tokens or claim states needed.
- **"Sent" means accepted by the provider, not "delivered."** `ticketSentAt`
  is stamped when the WhatsApp provider accepts the message, not when the
  attendee's phone receives it. The UI must say "sent," never "delivered" —
  this app has no visibility into actual delivery/read status and shouldn't
  claim it does.
- **Transport stays pluggable.** The WhatsApp provider call lives behind a
  small interface (`sendTicket({ phone, pdfBuffer, ... }) -> { ok, error? }`)
  so the provider (Meta Business Cloud API, Twilio, a gateway) can be swapped
  without touching the rest of the pipeline. This costs nothing extra to do
  now and avoids coupling the booking flow to one vendor's SDK.

---

## Task 1: Ticket token

Extend `src/lib/tickets.ts`:

- `generateTicketToken(bookingId)` → a signed, URL-safe token, following the
  same HMAC pattern as the admin session cookie but signed with
  `TICKET_SECRET` instead — e.g. `bookingId.<issuedAt>.<hmacSignature>`.
- A verify helper (mirrors the session-cookie verify function) so a future
  scanning feature can validate a token without duplicating the signing
  logic.
- Rules:
  - Sign with `env.ticketSecret`; **fail closed** if it's unset — throw
    before generating anything. A ticket without a valid signature is worse
    than no ticket.
  - Never log the full token.
  - **Claim once, guarded.** Store the token with a single conditional
    update: `booking.updateMany({ where: { id, ticketToken: null }, data: {
    ticketToken } })`. If this affects 0 rows, a token already exists —
    re-read `Booking.ticketToken` and use that value instead of the freshly
    generated one, so two near-simultaneous confirm/resend calls always
    converge on the same token rather than one silently overwriting the
    other.

## Task 2: Ticket PDF

- `src/lib/ticket-pdf.ts` → `buildTicketPdf(booking)` returns a PDF buffer.
  Nothing is persisted — this function is called fresh on every send.
- Content (all already available on `Booking` + relations): event name,
  date/time, venue name + address, seat row/number, section name + price
  (once section pricing is finalized in the schema), reference code (when
  present), and the ticket token rendered as a QR code.
- Library: `@react-pdf/renderer` for layout, `qrcode` to rasterize the QR.
  **Ask before adding either as a dependency** if there's any restriction on
  new packages in this repo. Single compact page, print- and phone-friendly.

## Task 3: Send pipeline + WhatsApp transport

- `src/lib/whatsapp.ts` → a small interface, e.g.:
  ```ts
  type SendTicketInput = { phone: string; pdfBuffer: Buffer; eventName: string; seatLabel: string };
  type SendResult = { ok: true } | { ok: false; error: string };
  function sendTicket(input: SendTicketInput): Promise<SendResult>;
  ```
  Implementation calls whichever provider is chosen (Twilio, Meta Cloud API,
  etc.) — confirm provider choice before implementing, since credentials and
  setup differ.
- `src/lib/ticket-send.ts` → `sendTicketForBooking(bookingId)`:
  1. Re-read the booking; if `status !== 'CONFIRMED'`, return a typed error,
     send nothing.
  2. `ensureTicketToken` (Task 1) — get or claim the canonical token.
  3. `buildTicketPdf` (Task 2) using that token.
  4. Call `whatsapp.sendTicket(...)`, bounded by a single timeout (a
     `SEND_TIMEOUT_MS` env var with a sane default, e.g. 15s) so a hung
     provider call can't hold the request open indefinitely.
  5. On success: guarded update — `ticketSentAt` set, `ticketNote` cleared,
     `WHERE id AND status = 'CONFIRMED'` (so a booking cancelled mid-call
     doesn't record a phantom successful send).
  6. On failure or timeout: guarded update — `ticketNote` set to a short,
     non-sensitive failure reason. The confirmation itself is never rolled
     back.
- Called automatically right after `confirmBooking` succeeds (same request,
  awaited — no background dispatch). Also callable directly from the admin's
  Resend action, identical function either way.
- Phone numbers are validated/normalized before any send attempt; an
  unnormalizable number fails closed with a typed error, no send attempted.

## Task 4: Admin UI

- On the admin bookings page, a **Send / Resend** control on each `CONFIRMED`
  row — available whenever `ticketSentAt` is null or `ticketNote` is set
  (i.e. never sent, or last attempt failed). Label "Send" before the first
  attempt, "Resend" after. Show a small "sent at ⟨time⟩" or "failed:
  ⟨note⟩" indicator next to it.
- Follow whatever existing action/component pattern the bookings page
  already uses for other row-level actions.

---

## Conventions that still apply

- **Seat locking**: this feature does not touch seat-locking transitions at
  all — it only runs after `confirmBooking` has already succeeded.
- **Validation**: Zod on the resend action's input (just a booking ID).
- **Errors**: typed results to the UI; never leak raw errors, stack traces,
  tokens, or phone numbers.
- **Secrets**: `TICKET_SECRET` and WhatsApp provider credentials are
  distinct env vars, names-only in `.env.example`, never committed.
- **UI**: English, mobile-first, no new UI library (PDF/QR libraries are not
  a UI library, but still confirm before adding any new dependency).
- **Verification**: `npx tsc --noEmit` and `npm run lint` after each task.

---

## Acceptance criteria

- [ ] Confirming a booking sends its ticket in the same request:
      `ticketToken` set, `ticketSentAt` set on provider acceptance
- [ ] The ticket token is generated once and reused on every resend — never
      regenerated for an already-confirmed booking
- [ ] Two near-simultaneous confirm/resend calls for the same booking
      converge on one token (guarded claim-or-adopt, Task 1)
- [ ] The PDF contains event, date, venue, seat row/number, section + price
      (where available), reference code (where present), and a QR encoding
      the signed token
- [ ] The token verifies against `TICKET_SECRET` and fails against a
      different secret or a tampered payload
- [ ] A failed send records `ticketNote` (non-sensitive), does not roll back
      the confirmation, and the bookings page shows a working Resend
- [ ] A successful (re)send sets `ticketSentAt` and clears any prior
      `ticketNote`, guarded on `status = 'CONFIRMED'`
- [ ] A hung provider call is cut off at `SEND_TIMEOUT_MS`; the admin request
      is still released promptly either way
- [ ] Unnormalizable phone numbers are rejected before any send
- [ ] Missing `TICKET_SECRET` or provider credentials fail closed — a send
      reports failure, never a false success
- [ ] UI never says "delivered," only "sent"
- [ ] `.env.example` lists the new var names only
- [ ] `npx prisma generate`, `npx tsc --noEmit`, `npm run lint`, and
      `npm run build` all pass

---

## Out of scope (do NOT build here)

- Ticket **scanning/verification** at the door — the token is generated and
  reserved for it, but no verify endpoint or UI
- A durable send queue, worker recovery, or fencing tokens — revisit only if
  real-world send reliability at higher volume turns out to actually need it
- Stored/downloadable PDF copies or signed delivery URLs — the PDF is
  regenerated per send; add persistent storage later only if a concrete need
  for it shows up (e.g. "let the admin re-download without re-sending")
- The scheduled expiry sweep (separate doc)
- Multi-admin / role hierarchy
- Attendee accounts or any new attendee data beyond `userName`/`userPhone`