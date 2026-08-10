# WhatsApp Ticket Delivery — Task Breakdown

Build ticket delivery over WhatsApp: once a booking is `CONFIRMED`, generate a
signed ticket token and a printable ticket PDF, deliver it to the attendee's
phone over WhatsApp, and let the admin **resend** it if delivery failed.
This is the "Receive a ticket over WhatsApp once their booking is confirmed"
flow (public) and the "Resend a ticket if delivery failed" admin flow from
`docs/event-ticketing-flow.md`, both currently out of scope.

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

```
confirmBooking (seat-locking.ts)
   └─> on success, call sendTicketsForBookings(bookingIds)   [auto-send]
         ├─ ensureTicketToken(booking)    -> signed token, stored in ticketToken
         ├─ buildTicketPdf(booking)       -> PDF, stored; ticketPdfUrl set
         └─ whatsapp.sendTicket({ phone, pdfUrl, ... })
               -> ticketSentAt on success / ticketNote on failure
Admin "Resend" action -> sendTicketForBooking(bookingId)   [same pipeline]
```

- **Token first, always**: a signed `ticketToken` is generated once per
  confirmed booking (idempotent — reuse if already set). It is the
  verification value embedded in the ticket's QR code and is reserved for
  future ticket scanning (out of scope here, but the token must be
  generated now so a ticket never exists without one).
- **PDF once**: `ticketPdfUrl` is stored after first generation and reused on
  resend — resending must not regenerate (same ticket, same token).
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
  - Store the token in `Booking.ticketToken` (unique) in the same flow that
    sends; keep generation idempotent (read-modify only if null, guarded so
    two concurrent sends don't race a unique violation — wrap the
    token+`ticketSentAt` writes in one transaction).

## Task 2: Ticket PDF

- `src/lib/ticket-pdf.ts` → `buildTicketPdf(booking)` returns the PDF file
  (buffer/stream) and the URL to store in `ticketPdfUrl`.
- Content (all fields already on `Booking` + relations): event name, date/time
  via `formatDate`, venue name + address, seat row/number, section name +
  price via `formatUsd`, `referenceCode` (when present), and the ticket
  `ticketToken` rendered as a **QR code**.
- Library decision — **ask before adding a dependency** (no new libraries
  without asking, per both task docs): recommended
  `@react-pdf/renderer` (server-renderable React, matches the stack) plus
  `qrcode` to rasterize the QR into the PDF. Alternatives are `pdfkit` /
  `jspdf`. Keep the output a single compact page, print- and phone-friendly.
- Storage decision — ask if unresolved: store the PDF where the WhatsApp
  provider can fetch it (a public/unauthenticated URL means it is
  guessable; prefer an unguessable token in the path, or a signed/one-time
  URL if the platform supports it). The URL is what goes into
  `ticketPdfUrl`.

## Task 3: WhatsApp transport

- `src/lib/whatsapp.ts` exporting a small interface, e.g.
  `sendTicket({ toPhone, pdfUrl, eventName }) => Promise<void>` (throws a
  typed error the caller maps to `ticketNote`), with **one implementation**
  selected at build time:
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
- Env vars (names only → `.env.example`): the chosen provider's creds plus
  `APP_BASE_URL` (to build the absolute `ticketPdfUrl` if the provider fetches
  it). Parse via `src/lib/env.ts` with fail-closed behavior — a missing
  provider credential makes sends fail with a clear `ticketNote`, never a
  silent success.

## Task 4: Auto-send on confirm + resend

- **Auto-send**: after `confirmBooking` succeeds, invoke the send pipeline
  for that booking (and for each booking in a multi-seat group when the admin
  confirms them). Run it after the confirm transaction commits, best-effort:
  a failed send must **not** roll back the confirmation — it records
  `ticketNote` and surfaces a "ticket not yet delivered" state instead.
- **Resend action**: a Server Action (guarded by the admin session, same
  pattern as `confirmBookingAction` in `src/lib/actions/bookings.ts`):
  - Zod-validates `bookingId`.
  - Only `CONFIRMED` bookings can be (re)sent; anything else returns a typed
    error.
  - Reuses `ticketToken`/`ticketPdfUrl` when present; generates/regenerates
    only what is missing.
  - On success sets `ticketSentAt`; on failure sets `ticketNote` (trimmed,
    non-sensitive error) and returns a typed `{ ok: false, error }`.
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
- [ ] Two concurrent sends for the same booking cannot produce duplicate or
      conflicting `ticketToken` rows (guarded/idempotent)
- [ ] Resend reuses the existing token + PDF URL; it does not regenerate the
      ticket
- [ ] Resend on a non-`CONFIRMED` booking returns a typed error
- [ ] A failed delivery records `ticketNote` (non-sensitive), does not
      roll back the confirmation, and the bookings page shows the failure
      state with a working Resend
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
