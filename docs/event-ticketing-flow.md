## Project Domain

Event Ticketing is a simple, elderly-friendly web app for booking seats to a
single event at a time. There are no user accounts — the event's unique link
is the only access control. Payment is always handled outside the app via a
third-party method (bank transfer, cash at the door); the app never
processes payments itself, only tracks seat state and matches a reference
code (or admin verification) to confirm a booking. One admin operates the
dashboard to confirm bookings and manage events.

---

## Core Business Flow

### Attendee (public, no account)

- What they are: anyone who receives the event's link — no login, no
  identifying record beyond a name and phone number given at booking time.
- What they can do:
  - View the event's details and seat map via its unique slug link
  - Request one or more seats under one of the supported booking cases
  - Receive a ticket over WhatsApp once their booking is confirmed
- Structural rules:
  - The event link (slug) is the entire access boundary — anyone with the
    link can see and request seats; there is nothing to authenticate.
  - No sensitive data is stored about an attendee beyond name and phone.

### Admin (single operator)

- What they are: the one person operating the dashboard for a given
  deployment of this app. Authenticated via a shared password, not a
  per-admin account system.
- What they can do:
  - Create venues and events
  - View pending bookings that need action
  - Confirm a "pay online with code" booking after matching the payment
  - Confirm a "pay at door" booking after verifying intent externally
  - Create a guest booking for a published, not-yet-started event
  - Cancel a published, not-yet-started event
  - Resend a ticket if delivery failed
- Dashboard scope and revenue: the admin dashboard (`/admin`) shows **only
  PUBLISHED events** and their summary stats (revenue, confirmed count, pending
  holds, occupancy) — DRAFT/CLOSED/CANCELED events are managed via
  `/admin/events` and never appear there. **Revenue counts only CONFIRMED
  ONLINE_CODE bookings** (the sum of their section prices): GUEST and
  PAY_AT_DOOR bookings are excluded, because the dashboard reports what was
  actually paid through the external payment note, not doorstep or admin-made
  bookings.
- Structural rules:
  - Single shared-password auth is intentional for this scope — there is
    no multi-admin permission system. If more admins are needed later,
    this becomes a distinct role hierarchy problem, not a config toggle.

### Venue → Event → Seat hierarchy

```
Venue
 └── VenueSection (pricing unit: one name + per-seat price in whole USD)
      └── VenueSeat (fixed layout, created once, reused across events)
           └── EventSeat (cloned per Event, this is what actually gets locked)
                └── Booking (the request/confirmation record for one hold)
```

- A `Venue`'s seat layout is authored once and reused as-is across every
  event held there — there is no per-event seat customization.
- The layout is organized into `VenueSection`s: each section has a unique
  name and a per-seat `price` in whole US dollars. Every `VenueSeat`
  belongs to exactly one section and shares its price.
- **Gap seats**: a `VenueSeat` may instead be a **gap** (`gap: true`,
  `sectionId` null) — a blocked-out position that keeps its `(row, number)`
  in the map's contiguous `1..N` numbering (so the layout and three-block
  split stay intact) but belongs to no section, is never selectable or
  bookable, and renders as an empty slot on every seat map. Gaps are
  authored once at venue creation and cloned into the event as
  `EventSeat`s with `status: GAP` — they participate in row sizing but are
  never targets of booking logic.
- Creating an `Event` clones every `VenueSeat` into a matching `EventSeat`,
  all starting `AVAILABLE`. This clone is what booking logic actually
  touches — the original `VenueSeat` layout is never modified by bookings.
- A `Booking` is created per seat-hold attempt. Because a hold can expire
  and the seat can be re-requested later, a single seat can accumulate
  multiple `Booking` rows over its lifetime — at most one of which is ever
  `PENDING` or `CONFIRMED` at a given moment, enforced by application logic
  reading `EventSeat.status`, not a database uniqueness constraint.

---

## Authentication

1. Attendee flow — no authentication:
   1. Attendee opens the event's link (`/e/<slug>`).
   2. The app looks up the event by slug.
   3. If the slug is unknown, or the event was never published (DRAFT), an
      identical 404 is returned either way — the app never reveals whether an
      unpublished event exists at a given slug.
   4. If the event is `PUBLISHED` and `startsAt` is still in the future, the
      seat map and event details are shown and seats can be requested.
   5. If the event was published but is now `CLOSED`, `CANCELED`, or has
      already started, a clear "this event has ended / been canceled" state is
      shown — details only, no selectable seats and no request form.
2. Admin flow — shared password:
   1. Admin submits their name and the shared admin password to a login
      endpoint.
   2. The password is compared using a constant-time comparison (not a
      simple `===`), to avoid leaking timing information about a partial
      match.
   3. On success, a signed session cookie is set: `<adminName>.<expiresAt
      >.<hmacSignature>`, HTTP-only, 12-hour expiry.
   4. Every admin-only route reads this cookie, recomputes the HMAC over
      `<adminName>.<expiresAt>`, and rejects the request if the signature
      doesn't match or `expiresAt` has passed.
   5. Logout simply clears the cookie; there is no server-side session
      store to invalidate.

- Notes:
  - There is no separate `Session` table — the cookie itself is the full
    session state, self-verified via HMAC rather than looked up.
  - The signing secret (`ADMIN_SESSION_SECRET`) is distinct from the
    ticket-signing secret (`TICKET_SECRET`) — compromising one must not
    compromise the other.
  - Cookie is `httpOnly`, `sameSite: lax`, and `secure` in production only
    (not in local dev over plain HTTP).
  - This model supports exactly one shared admin identity in practice —
    the `adminName` field is a display label typed at login, not a
    verified per-user identity.

---

## Booking Module

- Key records involved: `EventSeat` (current lock state) and `Booking`
  (the historical request/confirmation record). These deliberately overlap
  in some fields (who booked it, when it expires) because they serve
  different jobs: `EventSeat` answers "can this seat be claimed right
  now," fast, with no join; `Booking` answers "what happened to this seat
  over time," as a permanent log even after the seat is later released and
  re-booked by someone else.
- Lifecycle, case 1 — pay online with code:
  1. Attendee requests one or more seats → each seat atomically transitions
     `AVAILABLE → PENDING`, a `Booking` is created `PENDING` per seat, and a
     single reference code is generated and shown to the attendee. In a
     multi-seat request the code is shared by all of the group's bookings —
     the attendee pays once for the whole group using that one code as the
     payment note.
  2. Attendee pays externally, using the code as a payment note.
  3. Admin matches the code to a payment and confirms the group's bookings
     (each seat `PENDING → BOOKED`, each booking `PENDING → CONFIRMED`).
  4. If unconfirmed for `PENDING_ONLINE_EXPIRY_HOURS` (default 3h), the hold
      expires: the booking goes `PENDING → EXPIRED` and the seat back to
      `AVAILABLE`, freeing it for a new request. Expiry is a **lazy sweep**
      (`expirePastDuePendingBookings`), not a background job — it runs from
      the pages that read seat or booking state (public event page, admin
      bookings page, admin dashboard) and expires every past-due PENDING hold
      in one guarded transaction (cheap count-first fast path when nothing is
      past due).
- Lifecycle, case 2 — pay at the door:
  - Same shape as case 1, but no reference code is generated (nothing to
    match against an external payment) and the expiry window is longer
    (`PENDING_DOOR_EXPIRY_HOURS`, default 24h), since no payment is due
    upfront. The admin confirms the booking after verifying intent
    externally (seat `PENDING → BOOKED`, booking `PENDING → CONFIRMED`);
    same lazy expiry sweep applies.
- Lifecycle, case 3 — admin-invited guest:
  - Created directly by the admin: the seat atomically transitions
    `AVAILABLE → BOOKED` and a `Booking` is created directly `CONFIRMED`,
    no `PENDING` state and no expiry — skips the request/confirm split
    entirely. An admin can guest-book several seats at once for the same
    guest (same name/phone): one `Booking` per seat, and the claim over the
    batch is atomic (any taken seat rolls the whole batch back).
- Admin view of requests: bookings are stored one row per seat, so the admin
  pages collapse a request back into one row. The grouping key is the
  request's shared identity — `referenceCode` for ONLINE_CODE requests, or the
  `userName`/`userPhone`/`caseType`/`expiresAt` tuple stamped by `requestSeats`
  for PAY_AT_DOOR (GUEST bookings, created `CONFIRMED`, stay one row per seat).
  Each request row shows its seats, the total cost the attendee owes (Σ of the
  seats' section prices), and one Confirm/Cancel that acts on the **whole
  request** in a single guarded transaction (`confirmBookingGroup` /
  `cancelBookingGroup` — any seat that was taken in the meantime rolls back the
  whole request). The row is expandable to show each seat with its own
  per-booking Confirm/Cancel, so the admin can accept the entire request with
  one click or accept seats individually. The dashboard's "Needs attention"
  list uses the same grouping at the request level (no per-seat expansion).

- Locking rule that applies to all three cases: every state transition is a
  single conditional `updateMany` guarded on the row's current status
  (e.g. `WHERE status = 'AVAILABLE'`), never a separate read followed by a
  write. This is what prevents two simultaneous requests for the same seat
  from both succeeding.
- Bookability guard for public requests (cases 1 and 2): a request is rejected
  if, at request time, the event is not `PUBLISHED`, or is `CLOSED`/`CANCELED`,
  or its `startsAt` has already passed. This is enforced inside the same
  transaction as the seat lock (the public Server Action can be invoked
  without the page rendering, so the mutation — not the UI — is the guard).
- Reference codes: generated as 8 characters from a 31-character alphabet that
  excludes visually-ambiguous characters (no `0`/`O`, `1`/`I`/`L`), since
  attendees may read or copy them by hand. One code is generated per request
  group (single seat or many) and shared by all of that group's bookings.
  Uniqueness between groups is enforced by the `ReferenceCode` table: the code
  is reserved as a row with a UNIQUE constraint inside the same transaction
  that creates the bookings, so two concurrent requests can never both win the
  same code — the loser's insert raises a unique violation, that whole request
  transaction rolls back (reservation included), and the request retries up to
  5 times with a fresh code. `Booking.referenceCode` itself stays non-unique
  because one code legitimately appears on several bookings; reservation rows
  persist after a booking is confirmed or expires, so a code is never reused.
  The 8-character length (~850B keyspace) keeps the reservation table growing
  without needing pruning — rows are never deleted because a code still
  referenced by a confirmed booking must stay reserved for payment matching.
- Event cancellation: only a `PUBLISHED` event whose `startsAt` is still in
  the future can be canceled. In one transaction the event goes
  `PUBLISHED → CANCELED`, every `EventSeat` goes `→ CANCELED` with its hold
  fields cleared (`bookedByName`, `bookedByPhone`, `referenceCode`,
  `pendingSince`, `expiresAt`), and all `PENDING`/`CONFIRMED` bookings go
  `→ CANCELLED`. Canceled events reject further guest bookings.

---

## Database Design

### Main Entities

- Venue
- VenueSection
- VenueSeat
- Event
- EventSeat
- Booking

### Enums

#### EventStatus

- DRAFT
- PUBLISHED
- CLOSED
- CANCELED

#### SeatStatus

- AVAILABLE
- PENDING
- BOOKED
- GAP
- CANCELED

#### CaseType
- ONLINE_CODE
- PAY_AT_DOOR
- GUEST

#### BookingStatus
- PENDING
- CONFIRMED
- CANCELLED
- EXPIRED

---

## Development Rules

- ID strategy: `cuid()` on every model — random, unique, URL-safe, no
  manual ID assignment.
- Every model has `createdAt` and `updatedAt`; there are currently no
  immutable/log-only models in this scope (an audit-log-style model would
  follow if/when ticket scanning is reintroduced).
- No model stores more attendee data than `userName`/`userPhone` — this is
  a hard constraint, not a default to be casually extended.
- State transitions on `EventSeat` and `Booking` must always be a single
  guarded `updateMany` (conditional on current status), never a
  `findUnique`/`findFirst` followed by a separate `update` — this is the
  specific bug class this codebase exists to avoid, and is enforced via
  CodeRabbit path instructions on `src/lib/seat-locking.ts`.
- Secrets (ticket signing, admin session signing, admin password) are
  distinct environment variables — never reused across purposes, and never
  committed; `.env.example` documents names only, never real values.
- Business-rule uniqueness (e.g. "a seat can have at most one active
  booking") is enforced in application logic against `EventSeat.status`,
  not via a database column-level `@unique` constraint, since the valid
  historical case of multiple past `Booking` rows per seat (expired,
  re-requested, eventually confirmed) makes a hard column constraint
  incorrect here.
- Environment-driven configuration values (e.g. expiry hours) must be
  parsed and validated before use — a missing, empty, or non-numeric env
  var must fall back to a safe default, never silently produce `NaN` or
  `0`.
