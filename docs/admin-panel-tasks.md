# Admin Panel — Task Breakdown

Build the admin panel for the ticketing app: full scope (auth, venues, events,
bookings confirm/cancel, guest booking), all three booking cases
(ONLINE_CODE, PAY_AT_DOOR, GUEST), Server Actions + middleware, English UI.

Work is done **sequentially**: **Teammate A completes all of their tasks
first**, then **Teammate B** takes over. Read
`docs/event-ticketing-flow.md` and `docs/event-ticketing-database-schema.md`
first — they are the source of truth for the domain and schema.

> IMPORTANT: this repo uses a modified Next.js version (see AGENTS.md). Before
> writing any code, read the relevant guides in `node_modules/next/dist/docs/`
> (middleware, Server Actions, cookies, layouts) — APIs may differ from what you
> already know. Heed deprecation notices.

---

## Shared Conventions (both must follow)

1. **Seat locking**: every state transition on `EventSeat` / `Booking` is a
   single guarded `updateMany` (e.g. `WHERE status = 'PENDING'`), never a
   `findUnique`/`findFirst` followed by a separate `update`. Pair related
   transitions (seat + booking) in one `prisma.$transaction`.
2. **Validation**: validate every mutation input with Zod before touching the
   database.
3. **Errors**: catch errors and return typed results (e.g.
   `{ ok: true } | { ok: false; error: string }`) to the UI. Never leak raw
   error objects or stack traces to the client.
4. **Auth**: every admin page/action runs under `src/proxy.ts` or checks
   the session cookie. Mutations run server-side; never trust client input for
   authorization.
5. **IDs**: never assign IDs manually — `cuid()` defaults handle it.
6. **Data**: `createdAt`/`updatedAt` are handled by the schema; do not set them
   manually.
7. **Env vars**: add new env var names to `.env.example` (names only, no real
   values). Parse and validate env vars before use — a missing/empty/non-numeric
   value must fall back to a safe default, never silently produce `NaN` or `0`.
8. **UI**: English. Use Tailwind (already configured). No new UI library
   without asking.
9. **Mobile-first**: the app is used primarily on phones. Build mobile layouts
   first (~375–430px), then scale up with `sm:`/`md:`/`lg:` media queries. No
   top-horizontal nav — use a hamburger/drawer (or bottom nav) below the
   breakpoint. Minimum 44×44px touch targets, no hover-dependent
   functionality, 16px+ inputs (prevents iOS zoom), and native input
   types/`autocomplete`. Full rules in AGENTS.md.
10. **Reference codes** (for ONLINE_CODE): generate from a 31-char alphabet
    that excludes visually ambiguous chars (no `0`/`O`, `1`/`I`/`L`). Reserve
    the code as a row in the `ReferenceCode` table (UNIQUE on `code`) inside
    the same transaction that creates the bookings; a unique violation aborts
    that transaction and the request retries up to 5 times with a fresh code.
    `Booking.referenceCode` is not unique because one code is shared by all
    bookings in a group.
11. **Verification**: after your feature, run `npx tsc --noEmit` and
    `npm run lint` and confirm they pass.

### Agreed route contract (so both pages link correctly)

- `/admin` — dashboard (B)
- `/admin/login` — login (A)
- `/admin/venues` — venue list + create (B)
- `/admin/events` — event list + create + status (B)
- `/admin/bookings?eventId=...` — bookings list for an event (A)
- `/admin/bookings/new?eventId=...` — guest booking for an event (A)

---

## TEAMMATE A — Foundation + Booking Operations (goes first)

### Task A1: Shared foundation

- `.env.example` — add names: `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`,
  `TICKET_SECRET`, `PENDING_ONLINE_EXPIRY_HOURS`, `PENDING_DOOR_EXPIRY_HOURS`
- `src/lib/prisma.ts` — singleton `PrismaClient` (prevent multiple instances
  in dev)
- `src/lib/env.ts` — typed env access with safe defaults (expiry hours default
  `3` and `24`; parse numbers safely)
- `src/lib/auth.ts` — HMAC session cookie helpers
- `src/proxy.ts` — protect all `/admin/:path*` routes
- `src/app/admin/login/page.tsx` — shared-password login form
- `src/app/admin/layout.tsx` — admin shell + nav (links to dashboard, venues,
  events, bookings)

**Behavior**
1. Session cookie: sign `<adminName>.<expiresAt>.<hmacSignature>` with
   `ADMIN_SESSION_SECRET`; verify recomputes the HMAC and rejects if the
   signature doesn't match or `expiresAt` passed. Expiry: 12 hours. Cookie is
   `httpOnly`, `sameSite=lax`, `secure` in production only.
2. Login: Server Action that takes admin name + password, compares the password
   with `ADMIN_PASSWORD` using `crypto.timingSafeEqual` (constant time), sets
   the session cookie on success. Clear the cookie on logout.
3. Proxy: on `/admin/:path*`, read the cookie, verify it, redirect to
   `/admin/login` when missing/invalid/expired. Exempt the login page itself.
4. Layout: minimal nav shell — `/admin`, `/admin/venues`, `/admin/events`,
   `/admin/bookings`, plus a logout link.
5. `.env.example` — names only, with short comments.

**Acceptance criteria**
- [ ] Visiting `/admin/bookings` logged-out redirects to `/admin/login`
- [ ] Wrong password fails (no timing/error leak); right password reaches `/admin`
- [ ] Cookie is httpOnly, 12h expiry; logout clears it
- [ ] `npx tsc --noEmit` and `npm run lint` pass
- [ ] Commit A1 before moving to A2 (B builds on top of it)

### Task A2: Booking operations

- `src/lib/seat-locking.ts` — atomic seat + booking transitions
- `src/lib/validation/bookings.ts` — Zod schemas for booking actions
- `src/lib/actions/bookings.ts` — Server Actions (confirm/cancel/guest)
- `src/lib/booking-groups.ts` — request grouping key + seat label helpers
- `src/app/admin/bookings/page.tsx` — booking list per event
- `src/app/admin/bookings/pending-booking-actions.tsx` — per-seat Confirm/Cancel
- `src/app/admin/bookings/pending-request-actions.tsx` — request-level Confirm/Cancel
- `src/app/admin/bookings/request-row.tsx` — expandable request row (card/table)
- `src/app/admin/bookings/new/page.tsx` — create guest booking (seat map)

**Behavior**
1. `seat-locking.ts` — all transitions guarded `updateMany`, inside
   `prisma.$transaction` where more than one row changes:
   - `confirmBooking({ bookingId, adminId })` — booking `PENDING → CONFIRMED`
     (set `confirmedByAdmin`, `confirmedAt`) and seat `PENDING → BOOKED`, only
     if the booking is currently `PENDING`. Works for both ONLINE_CODE (admin
     has already matched the reference code to the payment externally) and
     PAY_AT_DOOR (no code involved).
   - `cancelBooking({ bookingId })` — booking `→ CANCELLED` (set `cancelledAt`)
     and seat `→ AVAILABLE`, resetting seat hold fields (`bookedByName`,
     `bookedByPhone`, `referenceCode`, `pendingSince`, `expiresAt`).
   - `confirmBookingGroup({ bookingId, adminId })` /
     `cancelBookingGroup({ bookingId })` — request-level variants: the passed
     `bookingId` is any member, the group is resolved by the request's shared
     key (see `requestGroupKey` in `src/lib/booking-groups.ts`), and every
     still-`PENDING` member is flipped in one transaction (bookings `→
     CONFIRMED` + seats `PENDING → BOOKED`, or `→ CANCELLED` + seats `→
     AVAILABLE`). All-or-nothing: if any seat is no longer `PENDING`, the whole
     request rolls back and an error is returned.
   - `createGuestBooking({ eventId, venueSeatIds, userName, userPhone,
     adminId })` — one seat each `AVAILABLE → BOOKED`, create a `Booking` per
     seat directly `CONFIRMED` with `caseType: GUEST`, `confirmedByAdmin`,
     `confirmedAt`. All seats share the same guest name/phone. The claim is
     atomic: one guarded `updateMany` over all `venueSeatIds`, and if the
     affected count doesn't equal the requested count, throw so the
     transaction rolls back the seats that did flip.
   - Each returns `{ ok: true, ... }` or `{ ok: false, error }`. A failed
     guarded update (0 rows affected — seat already taken / booking already
     handled) must return an error, not throw.
   - Generate ONLINE_CODE reference codes here per the alphabet rule in
     Shared Conventions #10.
2. Booking list page — read `?eventId=`, show that event's bookings with a
   status filter (all/pending/confirmed/cancelled/expired). The per-seat rows
   are collapsed into **one row per request** (grouping key in
   `src/lib/booking-groups.ts`: `referenceCode` for ONLINE_CODE, else
   `userName`/`userPhone`/`caseType`/`expiresAt` for PAY_AT_DOOR, and
   `userName`/`userPhone` for GUEST — every seat created for the same guest
   collapses into one row). Each request row shows `userName`, `userPhone`, `caseType`,
   the shared `referenceCode` (so the admin can match it against the external
   payment note), the request's **total cost** (Σ of the seats' section
   prices), and a status breakdown (e.g. "2 PENDING / 1 CONFIRMED") when mixed.
   Two levels of actions:
   - **Request level** — Confirm and Cancel buttons (`PendingRequestActions`)
     that act on the whole request at once. Always visible (no expansion
     needed for one-click accept).
   - **Per seat** — the request row is expandable (down-arrow button, touch
     target ≥ 44px, `aria-expanded`; mobile cards use a header toggle, desktop
     a summary `<tr>` + full-width detail `<tr>`) and lists each seat with its
     own Confirm/Cancel (`PendingBookingActions`), so the admin can accept
     seats individually.
   Confirmed rows show `referenceCode`, `confirmedByAdmin`, `confirmedAt`.
   Below the list, render the shared seat
   map in **read-only** mode (see `docs/seat-map-fragment.md`) showing the
   whole event's occupancy — BOOKED seats `#18181b`, PENDING holds `#f97316`,
   CANCELED/freed seats `#e4e4e7`, available seats in their section color —
   with a legend. When the list holds 10+ bookings, the list area (mobile
   cards and desktop table) gets `max-h-[560px] overflow-y-auto` so the map
   stays reachable without a huge page. Runs
   `expirePastDuePendingBookings(event.id)` first so past-due holds expire and
   free their seats before the map/state is read.
3. Guest booking page — read `?eventId=`, render the shared seat map (see
   `docs/seat-map-fragment.md`) from `EventSeat.venueSeat`. Select **one or
   more** `AVAILABLE` seats (up to 10) + enter name/phone submits the guest
   booking; each seat becomes its own `CONFIRMED` booking under that name.
   Already-taken seats are disabled; gap seats (`EventSeat.status = GAP`)
   render as empty slots and are never selectable.
4. Server Actions — call the `seat-locking` helpers, validate inputs with Zod,
   return typed results the pages can display.

**Acceptance criteria**
- [ ] Confirming a seeded PENDING booking: booking `CONFIRMED`, seat `BOOKED`,
      timestamps/admin set
- [ ] Cancelling flips the seat back to `AVAILABLE` and clears hold fields
- [ ] Two admins clicking Confirm on the same booking at once — exactly one
      wins, the other gets a typed error (guarded update)
- [ ] A multi-seat ONLINE_CODE request (one code) and a multi-seat PAY_AT_DOOR
      request each render as a single request row; two PAY_AT_DOOR requests by
      the same phone with different expiry windows stay separate rows
- [ ] Request-level Confirm confirms every PENDING seat/booking of the request
      in one click; if one seat was taken meanwhile, the whole request rolls
      back and an error is returned
- [ ] Expanding a request row shows each seat with its own Confirm/Cancel;
      per-seat confirm updates the row's status breakdown and total
- [ ] Guest booking on an AVAILABLE seat succeeds and is `CONFIRMED` with
      `caseType: GUEST`; a seat already PENDING/BOOKED cannot be guest-booked
- [ ] Multi-seat guest booking (2–10 seats, one name/phone) creates one
      `CONFIRMED` booking per seat and flips each seat to `BOOKED`; if any
      seat in the batch is taken, the whole batch rolls back (no partial
      booking)
- [ ] Retained CANCELLED/EXPIRED booking history does not block a new booking
      for the same seat
- [ ] `npx tsc --noEmit` and `npm run lint` pass
- [ ] Commit A2 when done — A is finished

---

## TEAMMATE B — Venue & Event Management + Dashboard (goes second)

### Task B1: Venue & event management

- `src/lib/validation/venues.ts` — Zod schema for venue creation
- `src/lib/validation/events.ts` — Zod schema for event creation
- `src/lib/actions/venues.ts` — Server Action for venue creation
- `src/lib/actions/events.ts` — Server Actions for event create + status
- `src/app/admin/venues/page.tsx` — venue list + create (seat layout)
- `src/app/admin/events/page.tsx` — event list + create + status control

**Behavior**
1. Venue creation — form with venue name, address, and a seat-layout builder:
   add sections with a per-seat price in whole US dollars, each with rows and
   seats-per-row (e.g. section "Floor", $5, 3 rows, 8 seats/row). Creates the
   `Venue`, its `VenueSection`s, and all `VenueSeat` rows in one transaction.
   Seat uniqueness is `(venueId, row, number)` — a coordinate (row, number)
   cannot repeat anywhere in the venue, even across sections. A duplicate
   layout must return a typed error.
   **Gap seats**: selected seats can also be **Marked as gap** instead of
   assigned to a section — a gap keeps its `(row, number)` position (so the
   map layout and numbering stay intact) but is stored with `gap: true` and a
   null `sectionId`, is never cloned as an available event seat, and    can never
   be booked. Gap seats still count toward the row's contiguous `1..N`
   numbering; at least one non-gap seat is required.
   **Row numbering**: the builder's "Seat map" card has a **Row numbering**
   toggle (Odd / Even vs In order right-to-left). Both draw a contiguous
   `1..N` row as three blocks; Odd/Even numbers them center-out, In order
   numbers them sequentially mirrored right-to-left (seat 1 at the right edge,
   e.g. `15 14 13 | 12 11 10 9 8 7 6 5 4 | 3 2 1`). It is
   display-only metadata stored as `Venue.seatLayout` (`ODD_EVEN` default |
   `IN_ORDER`) and read live through the `Event → Venue` relation, so existing
   events pick up the venue's choice. Editable only from the builder (create,
   or edit before any event uses the venue).
2. Event creation — form: pick an existing venue, name, description,
   `startsAt`, initial status (DRAFT/PUBLISHED). Slug: auto-generate from the
   name (e.g. `jazz-under-the-stars`); ensure uniqueness (append a suffix on
   collision). **Auto-clone**: in the same transaction, clone every `VenueSeat`
   of the chosen venue into an `EventSeat` (status `AVAILABLE`, `venueId` set)
   — matching the flow doc's Venue → VenueSeat → EventSeat hierarchy.
3. Event list — show events with venue, date, status. Controls to change status
   (DRAFT → PUBLISHED, PUBLISHED → CLOSED / CANCELED) via a Server Action using
   a guarded transition. Canceling is only allowed for published events whose
   `startsAt` is still in the future — it flips the event to `CANCELED`, every
   seat to `CANCELED`, and PENDING/CONFIRMED bookings to `CANCELLED`.
   No booking logic here — that's A's slice.
4. Venue list — each venue card shows a 3-column stat grid (Capacity /
   Sections / Events) from `_count` on `VenueSeat` (seats only) and `Event`,
   plus the **Guest booking** and **View bookings** links. Venue create form
   lives under `src/app/admin/venues/new/venue-builder.tsx`.
5. Server Actions — Zod-validate, run in transactions, return typed results.

**Acceptance criteria**
- [ ] Creating a venue with a layout creates all seats (count matches
      sections × rows × seats-per-row)
- [ ] Duplicate `(row, number)` within a venue is rejected with a
      typed error — a coordinate cannot repeat even across sections
- [ ] Creating an event auto-clones every venue seat into an `EventSeat` with
      the correct `venueId`, all `AVAILABLE`
- [ ] Event slug is unique; DRAFT/PUBLISHED/CLOSED/CANCELED transitions work
- [ ] The Row numbering toggle persists `Venue.seatLayout`; the venue builder
      preview, public event page, guest booking, and admin bookings seat map
      all honor it (Odd/Even = three blocks center-out, In order =
      right-to-left sequential in the same three blocks)
- [ ] `npx tsc --noEmit` and `npm run lint` pass
- [ ] Commit B1 before moving to B2

### Task B2: Dashboard

- `src/app/admin/page.tsx` — reads `getDashboardStats(eventIds)` from
  `src/lib/events.ts`

**Behavior**
1. Show **only PUBLISHED events** — DRAFT/CLOSED/CANCELED events never appear
   here (they are managed under `/admin/events`). If there are none, show a
   "No published events yet" empty state.
2. Top: four summary cards scoped to those published event ids
   (`getDashboardStats`):
   - **Revenue** — sum of the confirmed bookings' section prices, counting
     **ONLINE_CODE only** (GUEST and PAY_AT_DOOR bookings are excluded — the
     dashboard reports what was actually paid via the payment note, not
     doorstep/guest bookings)
   - **Confirmed** — number of CONFIRMED bookings
   - **Pending holds** — number of PENDING bookings
   - **Occupancy** — confirmed seats / bookable seats (gaps excluded)
   (Stats must be scoped to the published event ids — never a global query.
   With no published events, skip the aggregate query entirely.)
3. **Needs attention**: a queue of PENDING bookings across the published
   events (newest first, capped at 20), collapsed into **one row per request**
   (same grouping key as the bookings list — see Task A2 §2) showing the
   attendee, seat labels, the request's total cost, and inline request-level
   **Confirm** / **Cancel** actions (`PendingRequestActions`) that also
   `revalidatePath('/admin')` so the summary updates immediately. No per-seat
   expansion here — it stays at the request level.
4. **Events at a glance**: one card per published event showing venue, date,
   an occupancy bar (confirmed/bookable, gap-free), a pending-holds pill, and
   links to `/admin/bookings?eventId=...` and
   `/admin/bookings/new?eventId=...`.

**Acceptance criteria**
- [ ] Only PUBLISHED events and stats scoped to them show — DRAFT/CLOSED/
      CANCELED events are absent
- [ ] Revenue counts only CONFIRMED ONLINE_CODE bookings (GUEST and
      PAY_AT_DOOR excluded); occupancy excludes gap seats
- [ ] Confirming/cancelling from Needs attention updates the summary cards
      without a manual refresh
- [ ] Links reach A's pages with the event pre-selected
- [ ] Commit B2 — the panel is complete

---

## Definition of Done (whole panel)

- [ ] `npx prisma generate` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] Manual flow: login → create venue (with layout) → create event
      (auto-clone) → confirm the seeded PENDING booking → cancel a booking →
      create a guest booking from the seat map → verify seat states in the DB
      (`EventSeat.status` / `Booking.status` stayed consistent)

### Out of scope (do NOT build here)

- WhatsApp ticket sending / resend (external integration)
- A scheduled cron-style expiry sweep job (the **lazy** on-demand sweep —
  `expirePastDuePendingBookings` — is built as part of A2 and runs from the
  pages that read seat/booking state; a background job is still separate)
- Multi-admin / role hierarchy
