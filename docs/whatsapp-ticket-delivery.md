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
- **`ticketPdfUrl` is a private canonical reference, not a delivery URL**: the
  stored value is a stable, opaque, unguessable, **non-expiring** internal
  object key for a **private** PDF object that is never directly fetchable.
  Short-lived **signed delivery URLs are minted fresh per send** —
  `mintDeliveryUrl` is the **only** path that reads or shares the PDF — with
  a TTL that covers the event date, so an admin resend always produces a live
  URL and an old one expiring never blocks delivery. See Task 2 for the
  contract.
- **PDF encodes the winner**: the PDF is generated **only after** the token is
  claimed and re-read, and encodes exactly that canonical token — a PDF is
  never built from a token that lost the race (that would yield a QR that
  fails verification).
- **Send is outside any transaction, but the dispatch is not**: the WhatsApp
  call cannot be made atomic with the database. The **intent** to send,
  however, is persisted inside the confirmation transaction via a durable
  outbox (`TicketSendJob`), so a crash between commit and dispatch never loses
  a send attempt. Sends themselves run outside transactions, are keyed by a
  **delivery-attempt ID** (reused across retries of one attempt, regenerated
  for each intentional resend — see Task 3), and delivery fields are updated
  with a guarded write afterwards (Task 4).
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
  `ticketPdfUrl` stores a **private canonical object reference**: a stable,
  opaque, unguessable, **non-expiring internal object key** (e.g. a random
  key like `tickets/<random-unguessable>.pdf`, or a blob path). The key must
  **not** contain `ticketToken` (the QR verification value) or any other
  signed secret — storage/CDN logs must never expose a value that could
  verify a ticket. The PDF object is stored **private** (no public read
  access): the reference is **never** a directly fetchable stable URL and
  **never** a short-lived signed URL stored in the DB. It is set once by the
  compare-and-set pattern (Task 1's shape) and reused unchanged by every
  resend.
- **Delivery URLs are minted per send**: each send derives a **fresh**
  signed/expiring delivery URL from the canonical reference
  (`mintDeliveryUrl(reference, ttl)` — e.g. a signed/one-time URL).
  `mintDeliveryUrl` is the **sole** mechanism for reading or sharing the PDF
  — the object has no public read, so per-send expiry cannot be bypassed
  through a directly fetchable URL. TTL default: **cover the event with a
  guaranteed positive floor** — `expiry = max(event.startsAt + 24h margin,
  now + 24h)`. The event-based target keeps the attendee's received link
  valid at least through the event, and the `now + 24h` floor guarantees the
  URL is **never already expired at mint time**, even when a confirmed
  booking is resent after the event has passed (line 150's naive
  `event.startsAt + 24h` alone would mint an already-dead URL in that case,
  breaking the resend promise of a live URL). Minting is gated by an **atomic status-conditional claim** (Task 4):
  `mintDeliveryUrl` is only ever called while the resend holds a
  compare-and-set claim requiring current status `CONFIRMED`, so a booking
  cancelled between a status read and minting cannot produce a URL. Revocation
  is inherent: delivery URLs are signed and time-bound, no new URL is minted
  once the booking is no longer `CONFIRMED`, and a previously sent URL remains
  usable only until its TTL — record that as an accepted trade-off (add
  explicit URL revocation only if a requirement demands it).
- **PDF from the winner, stored by compare-and-set**: generate the PDF only
  from the **re-read** canonical `ticketToken` (Task 1) — never from a token
  this caller generated but lost the claim for. Store the **reference** with
  the same guarded pattern
  (`booking.updateMany({ where: { id, ticketPdfUrl: null }, data: { ticketPdfUrl } })`):
  affected `1` → this PDF won; affected `0` → re-read and reuse the stored
  reference. This guarantees the stored PDF always encodes the canonical token
  and that resends reuse one reference.

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
- **Delivery-attempt identity, separate from resend identity**: a retry of
  one send attempt and an intentional resend must never share one key.
  Persist a **delivery-attempt ID** per attempt — carried on the auto-send
  `TicketSendJob` outbox row (Task 4) and recorded on the Booking
  (`ticketDeliveryAttemptId`, e.g.) by the resend claim: all retries of the
  **same** attempt reuse it; each **intentional resend** generates a **new**
  attempt ID. `sendTicket`
  takes the attempt ID — not the bare `bookingId` — so a retry is
  distinguishable from a deliberate second send, and the guarded write can
  stamp `ticketSentAt` for the right attempt. Callers check `ticketSentAt` is
  null before sending.
- **No provider-level cross-request send deduplication**: Twilio's Messages
  API has no standardized idempotency header for outbound sends, and Meta's
  `biz_opaque_callback_data` value is callback/reconciliation metadata, **not**
  a deduplication key — neither gives exactly-once sends. Do not claim
  otherwise. At-most-one is therefore **best-effort**: the attempt ID is the
  retry signal, and the guarded `ticketSentAt` write makes downstream
  processing idempotent (at-least-once duplication is absorbed by the guard).
  Strict exactly-once outbound send guarantees, if ever required, must be
  added at the provider-API level — not assumed here.
- **Guarded send-record writes**: after a successful provider response,
  record the send with a guarded update
  (`booking.updateMany({ where: { id, ticketSentAt: null }, data: { ticketSentAt, ticketNote: null } })`)
  — this stamps the send **and clears any stale failure note in the same
  write**. On failure, record `ticketNote` (trimmed, non-sensitive) with a
  write guarded the same way (`where: { id, ticketSentAt: null }`): if an
  earlier send already succeeded, the guarded update affects 0 rows, the
  prior `ticketSentAt` is preserved, and the failed resend does not re-surface
  a failure state. A concurrent sender that already recorded the send never
  has its state overwritten.
- **`ticketSentAt` means provider-accepted, not delivered**: the immediate
  provider response confirms only that the message was **accepted/queued**
  (Twilio `accepted` → `queued`; Meta returns a message id), never that it
  reached the attendee's phone. `ticketSentAt` records that **acceptance
  time** — it is a "sent to WhatsApp" timestamp, not a claim of final
  delivery, and the UI must say "sent"/"sent to WhatsApp", not "delivered".
- **Final delivery tracking (optional, only if required)**: to confirm actual
  on-device delivery, integrate provider **status callbacks** (Twilio
  `StatusCallback` / Meta webhook) that fire on `delivered`/`failed`. That
  requires new Booking columns to persist the provider **message ID** and
  **delivery status** (e.g. `ticketProviderMessageId`,
  `ticketDeliveryStatus`), a secured callback route (validate provider
  signatures, idempotent updates), and `ticketSentAt`/delivery updates only
  from the confirmed callback status. This is out of scope unless a
  requirement demands final-delivery confirmation.
- Env vars (names only → `.env.example`): the chosen provider's creds plus
  `APP_BASE_URL` (to mint the absolute signed delivery URLs from the canonical
  reference) and the two deadlines below. Parse via `src/lib/env.ts` with
  fail-closed behavior — a missing provider credential makes sends fail
  with a clear `ticketNote`, never a silent success.
  - **`SEND_TIMEOUT_MS`** — deadline for the **provider call alone**
    (`AbortSignal.timeout` or the provider client's equivalent). Exact
    default **`10000`**, allowed range **`1000`–`30000`**.
  - **`SEND_PIPELINE_DEADLINE_MS`** — deadline for the **whole send pipeline**
    (claim/send/record), independent of the provider-call timeout. Exact
    default **`12000`**, allowed range **`2000`–`60000`**, and must be
    **strictly greater than `SEND_TIMEOUT_MS`** so a single normal send fits
    inside it.
  - **Out-of-range values are rejected, not clamped**: env parsing throws
    (fail closed) if either deadline is outside its range or the pipeline
    deadline is ≤ the provider timeout — the app fails to boot rather than
    running with a timeout that could block a request or worker indefinitely.
- **Bounded provider call**: the transport must honor `SEND_TIMEOUT_MS` and
  reject on timeout; it must not hang the calling request (Task 4).

## Task 4: Auto-send on confirm + resend

- **Auto-send via a durable outbox**: `confirmBooking` does **not** invoke the
  send pipeline directly. Inside the same transaction that flips the booking
  to `CONFIRMED` (and each booking in a multi-seat group), it also inserts a
  **`TicketSendJob` outbox row** — `{ id, bookingId @unique, attemptId, status:
  PENDING }` — where `attemptId` is the new delivery-attempt ID (Task 3). The
  dispatch intent is now **atomic with the confirmation**: if the commit
  succeeds, the outbox row exists; a process crash after commit but before the
  pipeline starts cannot lose the send attempt — the row is simply still
  `PENDING` and is claimed by a later dispatcher run. The pipeline itself runs
  **after** the transaction commits and is fully outside the request's
  confirmation path — the confirmation is already committed and is never
  rolled back by a send failure.
  - **Dispatcher**: after commit, a dispatcher claims `PENDING` rows with a
    guarded compare-and-set write
    (`updateMany({ where: { id, status: PENDING }, data: { status: PROCESSING } })`
    — the same CAS shape as Tasks 1–3), then runs the send pipeline for the
    claimed `bookingId`. On success it marks the row `DONE`; on terminal
    failure it marks the row `FAILED` alongside the guarded `ticketNote` write
    (manual resend covers it). The in-request confirm path may run the
    dispatcher inline for immediacy; a worker/poll is the deployment that also
    recovers missed dispatches.
  - **Crash recovery**: a row stuck in `PROCESSING` (crash mid-pipeline) is
    reset to `PENDING` by a recovery sweep once its `updatedAt` passes a stale
    threshold, so it is retried instead of orphaned; a `PENDING` row never
    needs a crash to survive — the next dispatcher run claims it. Recovery is
    idempotent because the pipeline's own CAS writes (token, PDF reference,
    send-record) make a re-run converge instead of duplicate.
  - **Bounded execution**: the pipeline runs under a hard deadline
    (`SEND_PIPELINE_DEADLINE_MS` — a deadline on the pipeline as a whole, with
    an exact default, max, and boot-time rejection per the Task 3 env rules)
    plus an `AbortSignal.timeout` on the provider call itself
    (`SEND_TIMEOUT_MS`). The two are independent: the provider call is cut off
    at `SEND_TIMEOUT_MS` even when the pipeline has slack left, and the
    pipeline as a whole aborts at `SEND_PIPELINE_DEADLINE_MS` regardless of
    where it is. A hung provider must release the request quickly, never hold
    the admin action open.
  - **Catch everything**: timeouts, provider errors, and unexpected
    exceptions are all caught; none propagate to the admin request. Every
    failure persists `ticketNote` (trimmed, non-sensitive) via the guarded
    write, leaves `ticketSentAt` null, and marks the outbox row `FAILED`,
    which surfaces the "ticket not yet sent" state in the UI.
  - **Retry policy**: the outbox **is** the durable retry mechanism — the
    initial dispatch, and any automatic retry with backoff, is a `PENDING`
    (or `RETRY`-with-`nextAttemptAt`) row. In-request retries just re-open the
    timeout problem and are not used. Manual resend remains synchronous
    (below) and does not depend on the outbox.
- **Resend action**: a Server Action (guarded by the admin session, same
  pattern as `confirmBookingAction` in `src/lib/actions/bookings.ts`):
  - Zod-validates `bookingId`.
  - **Status-conditional claim — the `CONFIRMED` check is atomic with
    minting**: instead of a bare pre-read, the action claims the booking with
    a compare-and-set write that records the **new delivery-attempt ID** and
    requires current status `CONFIRMED` in the same where clause
    (`booking.updateMany({ where: { id, status: CONFIRMED }, data: { ticketDeliveryAttemptId } })`).
    Affected `1` → the claim is held; resend and cancellation now serialize on
    the booking row (whichever commits first wins), so cancellation cannot
    slip between the status check and URL minting. Affected `0` → the booking
    is no longer `CONFIRMED`; return a typed error **before** minting or
    sending anything.
  - Reuses `ticketToken`/`ticketPdfUrl` (the canonical reference) when
    present; claims-and-re-reads (never races) whatever is missing via the
    Task 1–2 compare-and-set steps, then — **only under the held claim** —
    mints a **fresh delivery URL** from the canonical reference and re-runs
    the same guarded send pipeline.
  - On success writes `ticketSentAt` (provider-accepted time — see Task 3)
    **and clears `ticketNote` to null** with a guarded update
    (`WHERE ticketSentAt = null AND status = CONFIRMED`); on failure writes
    `ticketNote` (trimmed, non-sensitive) guarded on `ticketSentAt = null`, so
    a failed resend preserves an earlier successful send timestamp and does
    not re-surface a failure state, and returns a typed `{ ok: false, error }`
    — a concurrent send cannot overwrite a sibling's send state, and a booking
    cancelled mid-flight does not record a successful send.
  - `revalidatePath('/admin/bookings')` (and `/admin`) so the state updates
    inline.
- **UI**: on the admin bookings page, show a **Send / Resend ticket** control
  on each `CONFIRMED` row — available whenever a send is possible: never sent
  (`ticketSentAt` null), failed (`ticketNote` set), **or the last delivery
  URL has expired** (resend must stay available after a prior delivery when
  the attendee's link is stale — it mints a fresh URL and new attempt ID).
  Label "Send" before the first send, "Resend" after. A small "sent at /
  failed: <note>" indicator accompanies it (wording must say **sent**, never
  "delivered" — `ticketSentAt` is provider-accepted time, per Task 3).
  Follow the existing `PendingBookingActions` `useActionState` component
  pattern; mobile-first (44px touch targets, etc.).

---

## Conventions that still apply

- **Seat locking**: do not alter the guarded `updateMany` transitions in
  `src/lib/seat-locking.ts`; the confirm path is untouched except for the
  in-transaction `TicketSendJob` insert and the post-commit dispatch hook.
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
      unique, `ticketPdfUrl` set, `ticketSentAt` set on provider acceptance
- [ ] The initial auto-send is dispatched through a **durable outbox**: the
      confirm transaction inserts a `TicketSendJob` (`PENDING`) row atomically
      with the `CONFIRMED` write, so a crash between commit and dispatch does
      not lose the send attempt — the row is claimed by a later dispatcher run
- [ ] Dispatcher claims are compare-and-set (`PENDING → PROCESSING`), rows
      stuck in `PROCESSING` past a stale threshold are recovered to `PENDING`,
      and recovery is idempotent with the pipeline's CAS writes (no duplicate
      token, PDF reference, or send-record)
- [ ] `ticketSentAt` is recorded from the provider's **acceptance/queue**
      response (never labeled "delivered" in the UI); final delivery tracking
      is only added via status callbacks if a requirement demands it
- [ ] A ticket PDF contains event, date, venue, seat row/number, section +
      price, reference code (where present), and a QR encoding the signed
      token
- [ ] The ticket token verifies against `TICKET_SECRET` and fails against a
      different secret / tampered payload
- [ ] Two concurrent sends for the same booking converge on **one**
      `ticketToken` and **one** `ticketPdfUrl` (compare-and-set winner adopted
      by both); the stored PDF encodes the canonical token
- [ ] Retries of **one** send attempt reuse the same **delivery-attempt ID**;
      an intentional resend gets a **new** attempt ID; `ticketSentAt` is
      recorded exactly once (guarded write)
- [ ] At-most-one delivery is documented as **best-effort** — no Twilio/Meta
      cross-request send deduplication is claimed; downstream processing is
      idempotent via the guarded write
- [ ] `ticketPdfUrl` stores a stable **canonical reference** only — never a
      short-lived signed URL; delivery URLs are minted **fresh per send** with
      a TTL covering the event date
- [ ] `mintDeliveryUrl` never returns an **already-expired** URL: TTL is
      `max(event.startsAt + 24h margin, now + 24h)`, so a resend for a past
      event still gets a live URL from mint time
- [ ] The PDF object is **private**: its key is opaque and never contains
      `ticketToken`, it has no public read path, and `mintDeliveryUrl` is the
      sole mechanism that returns a readable URL
- [ ] A resend after an earlier delivery URL expired still succeeds (a new URL
      is minted from the canonical reference and a **new delivery-attempt ID**
      is created); resend stays available after a prior delivery whose URL has
      expired; no delivery URL is minted for a booking that is no longer
      `CONFIRMED`
- [ ] The `CONFIRMED` check is **atomic with URL minting**: resend claims the
      booking via compare-and-set (`where: { id, status: CONFIRMED }`) before
      minting, so a cancellation committing between validation and minting
      cannot produce a delivery URL (claim returns 0 rows → typed error, no
      mint, no send)
- [ ] Resend reuses the existing token + canonical PDF reference; it does not
      regenerate the ticket
- [ ] Resend on a non-`CONFIRMED` booking returns a typed error before any
      mint or send
- [ ] A successful (re)send stamps `ticketSentAt` **and clears any prior
      `ticketNote`** guarded on `status = CONFIRMED`; a booking cancelled
      mid-flight does not record a successful send, and a failed resend after
      an earlier successful delivery preserves the earlier `ticketSentAt` and
      records no failure state
- [ ] A failed delivery records `ticketNote` (non-sensitive), does not
      roll back the confirmation, and the bookings page shows the failure
      state with a working Resend
- [ ] A hung/slow provider call is cut off at `SEND_TIMEOUT_MS`; the pipeline
      as a whole aborts at `SEND_PIPELINE_DEADLINE_MS` even if the provider
      call has not returned; either way the admin request is released and
      `ticketNote` records the failure — the confirmation stays committed
- [ ] `SEND_TIMEOUT_MS` and `SEND_PIPELINE_DEADLINE_MS` have exact defaults
      and maxima, and out-of-range values (or a pipeline deadline ≤ the
      provider timeout) fail closed at boot — rejected, not clamped
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
