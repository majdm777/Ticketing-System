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
    that excludes visually ambiguous chars (no `0`/`O`, `1`/`I`/`L`). Check
    uniqueness against ALL bookings ever (not just active), with a bounded retry
    on collision.
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
- `src/app/admin/bookings/page.tsx` — booking list per event
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
   - `createGuestBooking({ eventId, venueSeatId, userName, userPhone,
     adminId })` — seat `AVAILABLE → BOOKED`, create a `Booking` directly
     `CONFIRMED` with `caseType: GUEST`, `confirmedByAdmin`, `confirmedAt`.
   - Each returns `{ ok: true, ... }` or `{ ok: false, error }`. A failed
     guarded update (0 rows affected — seat already taken / booking already
     handled) must return an error, not throw.
   - Generate ONLINE_CODE reference codes here per the alphabet rule in
     Shared Conventions #10.
2. Booking list page — read `?eventId=`, show that event's bookings with a
   status filter (all/pending/confirmed/cancelled/expired). For each PENDING
   booking show `userName`, `userPhone`, `caseType`, and its `referenceCode`
   (so the admin can match it against the external payment note). Buttons:
   **Confirm** and **Cancel**. Confirmed rows show `referenceCode`,
   `confirmedByAdmin`, `confirmedAt`.
3. Guest booking page — read `?eventId=`, render the seat map grouped by
   section/row (from `EventSeat.venueSeat`), showing each seat's status.
   Selecting an `AVAILABLE` seat + entering name/phone submits the guest
   booking. Already-taken seats are disabled.
4. Server Actions — call the `seat-locking` helpers, validate inputs with Zod,
   return typed results the pages can display.

**Acceptance criteria**
- [ ] Confirming a seeded PENDING booking: booking `CONFIRMED`, seat `BOOKED`,
      timestamps/admin set
- [ ] Cancelling flips the seat back to `AVAILABLE` and clears hold fields
- [ ] Two admins clicking Confirm on the same booking at once — exactly one
      wins, the other gets a typed error (guarded update)
- [ ] Guest booking on an AVAILABLE seat succeeds and is `CONFIRMED` with
      `caseType: GUEST`; a seat already PENDING/BOOKED cannot be guest-booked
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
4. Server Actions — Zod-validate, run in transactions, return typed results.

**Acceptance criteria**
- [ ] Creating a venue with a layout creates all seats (count matches
      sections × rows × seats-per-row)
- [ ] Duplicate `(row, number)` within a venue is rejected with a
      typed error — a coordinate cannot repeat even across sections
- [ ] Creating an event auto-clones every venue seat into an `EventSeat` with
      the correct `venueId`, all `AVAILABLE`
- [ ] Event slug is unique; DRAFT/PUBLISHED/CLOSED/CANCELED transitions work
- [ ] `npx tsc --noEmit` and `npm run lint` pass
- [ ] Commit B1 before moving to B2

### Task B2: Dashboard

- `src/app/admin/page.tsx`

**Behavior**
1. List all events with venue, date, and status.
2. Per event, show counts: total seats, available/pending/booked, and the
   number of bookings needing action (PENDING).
3. Link through to `/admin/bookings?eventId=...` and
   `/admin/bookings/new?eventId=...` (A's pages).

**Acceptance criteria**
- [ ] Counts are correct against the seeded data
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
- The scheduled expiry sweep job (separate task)
- Multi-admin / role hierarchy
