# WhatsApp Ticket Delivery — Task Breakdown (simplified, v2)

Build ticket delivery over WhatsApp: once a booking (or a multi-seat request)
is `CONFIRMED`, generate signed ticket token(s) and a printable ticket PDF,
send it to the attendee's phone over WhatsApp, let the admin **download** the
same PDF on demand, and let the admin **resend** it if delivery failed.

This is a deliberately **simplified** version of an earlier draft of this doc.
That earlier draft specified a durable outbox queue, compare-and-set claims
with fencing tokens, stale-claim worker recovery, and short-lived signed
delivery URLs with TTL-clamping/renewal — infrastructure appropriate for a
high-volume, multi-worker delivery system. This app is single-admin,
low-volume, and confirms bookings one at a time by hand — that complexity
solves reliability problems this app doesn't have.

**v2 changes from the original simplified draft:**
- QR code generation is in scope now (was already planned, confirmed here).
  Door **scanning/verification** is still explicitly deferred — see
  Out of scope.
- The admin can **download** the ticket PDF for a request after confirming,
  independent of sending — no longer just a "possible future follow-up."
- **Multi-seat requests get one PDF with one page per seat**, sent as a
  single WhatsApp message — not one PDF per seat, not one send per booking.
  This changes the pipeline from per-booking to per-request (see below).

**Note**: the database schema is still being finalized. This doc assumes the
schema decisions below; reconcile against `docs/event-ticketing-flow.md` and
`docs/event-ticketing-database-schema.md` before starting, since those remain
the source of truth if anything here turns out stale.

---

## What already exists (do NOT rebuild)

- `Booking` model reserves the ticket fields: `ticketToken String? @unique`,
  `ticketPdfUrl String?`, `ticketSentAt DateTime?`, `ticketNote String?`.
  Unused today — this feature is the consumer they were reserved for.
  (No new model needed — specifically, **no `TicketSendJob` table**.)
- `TICKET_SECRET` is already an env var name, parsed in the env-config
  module. Must remain a **distinct** signing secret from
  `ADMIN_SESSION_SECRET`.
- `src/lib/tickets.ts` — currently only `generateReferenceCode`. Ticket-token
  helpers belong here.
- `confirmBooking` flips a booking `PENDING → CONFIRMED` (seat `PENDING →
  BOOKED`). `confirmBookingGroup` confirms every booking sharing a
  **`referenceCode`** in one transaction — this is the existing tie between
  sibling bookings in a multi-seat request, and is what the send pipeline
  now groups by (see Design overview).
- Admin booking review page + its action layer — where Send/Resend/Download
  plug in, following the existing pattern there.
- Privacy constraint from the flow doc: **no model stores more attendee data
  than `userName`/`userPhone`** — the reserved ticket fields are all this
  feature may touch.

---

## Design overview

```text
confirmBooking / confirmBookingGroup succeeds
   └─> inline, same request: sendTicketsForRequest(referenceCode)
         ├─ load all bookings sharing that referenceCode (1 for a single
         |  seat, N for a multi-seat request)
         ├─ ensureTicketToken(booking)  -> one signed token PER BOOKING,
         |   generated once, stored once, reused on every resend/download
         ├─ buildTicketPdf(bookings[])  -> ONE PDF, one page per booking/seat,
         |   generated fresh, not stored
         └─ whatsapp.sendTicket({ phone, pdf, ... })  -> single message
               -> success: ticketSentAt set + ticketNote cleared on EVERY
                  booking in the group
               -> failure: ticketNote set on every booking in the group;
                  bookings stay CONFIRMED

Admin "Send" / "Resend" action -> sendTicketsForRequest(referenceCode)
Admin "Download" action        -> buildTicketPdf(bookings[]) only, no send;
                                  only enabled for a confirmed group, so every
                                  token is already persisted; never mutates state
```

- **Grouping key: `referenceCode`.** A request with 2 seats produces 2
  `Booking` rows sharing one `referenceCode`. The send/resend/download
  pipeline operates on the **whole group**, not a single booking — this
  replaces the earlier "each confirmed booking triggers its own send"
  behavior. A single-seat request is just a group of size 1, so the same
  code path handles both without a special case.
- **Token, once, ever — per booking.** Each booking in the group still gets
  its own signed `ticketToken` (one per seat, reserved for future
  per-seat scanning), generated the first time the group is confirmed and
  never regenerated after. The PDF embeds each seat's own QR code on its own
  page.
- **One PDF per request, one page per seat.** The PDF is regenerated fresh
  from durable data (bookings + tokens) on every send, resend, **or
  download** — nothing is stored, nothing expires, no delivery-URL TTL
  problem. `ticketPdfUrl` stays unused/null in this version.
- **Download is a first-class action, not just a resend side effect.** The
  admin can pull the same PDF at any time after confirmation without
  triggering a WhatsApp send — same `buildTicketPdf` call, different action,
  no state mutation, no `ticketSentAt` change. Download is only offered once
  the group is confirmed, which is exactly when all group tokens have been
  persisted, so `buildTicketPdf` can assume a non-null `ticketToken` on every
  booking and fails loudly (rather than omitting the QR) if one is missing.
- **Send is inline, not queued.** The WhatsApp call happens synchronously as
  part of the same confirm request (or the same resend action) — no
  background worker, no outbox table, no claim states. If the process
  crashes between "group confirmed" and "WhatsApp call finishes," the group
  ends up `CONFIRMED` with `ticketSentAt` still null on its bookings —
  indistinguishable from "never attempted," and recoverable via the same
  Resend action the UI already needs for ordinary failures.
- **Guard against double-send, simply.** Two admins (or two tabs) clicking
  Send/Resend on the same group near-simultaneously is rare at this app's
  scale. Guard with one conditional update per booking after a successful
  provider response — `booking.updateMany({ where: { id, status:
  'CONFIRMED' }, data: { ticketSentAt: now, ticketNote: null } })` for every
  booking in the group — no fencing tokens or claim states needed.
- **"Sent" means accepted by the provider, not "delivered."** `ticketSentAt`
  is stamped when the WhatsApp provider accepts the message, not when the
  attendee's phone receives it. The UI must say "sent," never "delivered."
- **Transport stays pluggable.** The WhatsApp provider call lives behind a
  small interface (`sendTicket({ phone, pdfBuffer, ... }) -> { ok, error? }`)
  so the provider can be swapped without touching the rest of the pipeline.

---

## Task 1: Ticket token

Extend `src/lib/tickets.ts`:

- `generateTicketToken(bookingId)` → a signed, URL-safe token, following the
  same HMAC pattern as the admin session cookie but signed with
  `TICKET_SECRET` — e.g. `bookingId.<issuedAt>.<hmacSignature>`.
- A verify helper (mirrors the session-cookie verify function) so a future
  scanning feature can validate a token without duplicating the signing
  logic.
- Rules:
  - Sign with `env.ticketSecret`; **fail closed** if unset — throw before
    generating anything. A ticket without a valid signature is worse than no
    ticket.
  - Never log the full token.
  - **Claim once, guarded, per booking.** Store the token with a single
    conditional update: `booking.updateMany({ where: { id, ticketToken: null
    }, data: { ticketToken } })`. If this affects 0 rows, a token already
    exists — re-read `Booking.ticketToken` and use that value, so
    near-simultaneous calls always converge on the same token per booking.
  - `ensureTicketToken(booking)` runs once **per booking** in the group —
    each seat keeps its own distinct token even though all seats ship in one
    PDF and one WhatsApp message.

## Task 2: Ticket PDF (multi-page)

- `src/lib/ticket-pdf.tsx` → `buildTicketPdf(bookings: Booking[])` returns a
  **single PDF buffer with one page per booking**, in a stable order (e.g.
  seat row/number ascending). Called with an array of length 1 for a
  single-seat request — no special-casing needed.
- Per-page content (all already available on `Booking` + relations): event
  name, date/time, venue name + address, seat row/number, section name +
  price (once section pricing is finalized in the schema), the shared
  `referenceCode`, and **that seat's own** ticket token rendered as a QR
  code.
- Library: `@react-pdf/renderer` for layout, `qrcode` to rasterize the QR —
  confirmed in scope now. **Still ask before adding either as a dependency**
  if there's any restriction on new packages in this repo. Single compact
  page per seat, print- and phone-friendly.
- Nothing is persisted — this function is called fresh on every send,
  resend, **and download**.

## Task 3: Send pipeline + WhatsApp transport

- `src/lib/whatsapp.ts` → small interface, e.g.:
  ```ts
  type SendTicketInput = { phone: string; pdfBuffer: Buffer; eventName: string; seatLabels: string[] };
  type SendResult = { ok: true } | { ok: false; error: string };
  function sendTicket(input: SendTicketInput): Promise<SendResult>;
  ```
  Implementation calls whichever provider is chosen (Twilio, Meta Cloud API,
  etc.) — confirm provider choice before implementing.
- `src/lib/ticket-send.ts` → `sendTicketsForRequest(referenceCode)`:
  1. Re-read every booking sharing `referenceCode` and reduce it to the
     `CONFIRMED` subset. If the subset is empty, return a typed error, send
     nothing. (If some but not all are `CONFIRMED` — e.g. a partial
     cancellation — send only for the `CONFIRMED` subset and note the rest
     were skipped.)
  2. `ensureTicketToken` (Task 1) for each booking in the `CONFIRMED` subset.
  3. `buildTicketPdf` (Task 2) across that same `CONFIRMED` subset only — one
     multi-page PDF, one page per confirmed seat; cancelled bookings are never
     rendered. The subset is the single source of truth for token creation,
     PDF rendering, and seat-label generation.
  4. Call `whatsapp.sendTicket(...)` once for the subset, bounded by a single
     timeout (`SEND_TIMEOUT_MS` env var, sane default e.g. 15s) so a hung
     provider call can't hold the request open indefinitely.
  5. On success: guarded update on every booking in the subset —
     `ticketSentAt` set, `ticketNote` cleared, `WHERE id AND status =
     'CONFIRMED'` (so a booking cancelled mid-call doesn't record a phantom
     send).
  6. On failure or timeout: guarded update on every booking in the subset —
     `ticketNote` set to a short, non-sensitive failure reason. The
     confirmation itself is never rolled back.
- `src/lib/ticket-pdf.tsx`'s `buildTicketPdf` is also called directly (no
  send) by the admin's **Download** action — same grouping-by-`referenceCode`
  lookup, same `CONFIRMED`-only filtering and multi-page output, just streamed
  back instead of sent.
- Called automatically right after `confirmBooking` / `confirmBookingGroup`
  succeeds (same request, awaited — no background dispatch). Also callable
  directly from the admin's Resend action, identical function either way.
- Phone numbers are validated/normalized before any send attempt; an
  unnormalizable number fails closed with a typed error, no send attempted.

## Task 4: Admin UI

- On the admin bookings page, group rows by `referenceCode` for ticket
  purposes (a multi-seat request shows one set of ticket controls covering
  all its seats, not one per row).
- **Send / Resend** — available whenever any booking in the group has
  `ticketSentAt` null or `ticketNote` set. Label "Send" before the first
  attempt, "Resend" after. Show "sent at ⟨time⟩" or "failed: ⟨note⟩" next to
  it.
- **Download** — always available once the group is `CONFIRMED`, regardless
  of send status. Streams the same multi-page PDF `buildTicketPdf` produces,
  no state change.
- Follow whatever existing action/component pattern the bookings page
  already uses for other row-level actions.

---

## Conventions that still apply

- **Seat locking**: this feature does not touch seat-locking transitions at
  all — it only runs after `confirmBooking`/`confirmBookingGroup` has
  already succeeded.
- **Validation**: Zod on the resend/download action's input (a
  `referenceCode`, not a raw booking ID, since the action is group-scoped).
- **Errors**: typed results to the UI; never leak raw errors, stack traces,
  tokens, or phone numbers.
- **Secrets**: `TICKET_SECRET` and WhatsApp provider credentials are
  distinct env vars, names-only in `.env.example`, never committed.
- **UI**: English, mobile-first, no new UI library (PDF/QR libraries are not
  a UI library, but still confirm before adding any new dependency).
- **Verification**: `npx tsc --noEmit` and `npm run lint` after each task.

---

## Acceptance criteria

- [ ] Confirming a booking or a multi-seat request sends **one** WhatsApp
      message with **one** PDF containing one page per seat, in the same
      request as the confirm
- [ ] Each seat's `ticketToken` is generated once and reused on every
      resend/download — never regenerated for an already-confirmed booking
- [ ] Two near-simultaneous confirm/resend/download calls for the same
      group converge on the same tokens (guarded claim-or-adopt, Task 1)
- [ ] The PDF has one page per booking in the group, each with that seat's
      own QR code, and shows event, date, venue, seat row/number, section +
      price (where available), and the shared reference code
- [ ] Each page's token verifies against `TICKET_SECRET` and fails against a
      different secret or a tampered payload
- [ ] A failed send records `ticketNote` on every booking in the group, does
      not roll back the confirmation, and the bookings page shows a working
      Resend
- [ ] A successful (re)send sets `ticketSentAt` and clears any prior
      `ticketNote` on every booking in the group, guarded on `status =
      'CONFIRMED'`
- [ ] The admin can **download** the same multi-page PDF at any time after
      confirmation, independent of send/resend, with no state change
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

- Ticket **scanning/verification** at the door — tokens are generated and
  reserved for it, but no verify endpoint or UI (planned as the next doc
  after this one ships)
- A durable send queue, worker recovery, or fencing tokens — revisit only if
  real-world send reliability at higher volume turns out to actually need it
- Signed delivery URLs / hosted PDF links — the PDF is regenerated per
  send/download, never uploaded or given a public URL
- The scheduled expiry sweep (separate doc)
- Multi-admin / role hierarchy
- Attendee accounts or any new attendee data beyond `userName`/`userPhone`
