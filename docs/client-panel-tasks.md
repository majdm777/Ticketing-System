# Client Panel — Task Breakdown

Build the client (attendee) panel for the ticketing app: public event page,
seat map, booking request for the two attendee-facing cases (ONLINE_CODE and
PAY_AT_DOOR), and a booking status page. The admin panel is already done —
auth, venues, events, and booking confirm/cancel all exist — so the client
panel only needs the public-facing side. English UI, mobile-first.

Work is done **sequentially**: **Teammate A (you) completes all of their
tasks first**, then **Teammate B** takes over. Read
`docs/event-ticketing-flow.md` and `docs/event-ticketing-database-schema.md`
first — they are the source of truth for the domain and schema. Reuse
existing admin-side building blocks instead of duplicating them.

> IMPORTANT: this repo uses a modified Next.js version (see AGENTS.md). Before
> writing any code, read the relevant guides in `node_modules/next/dist/docs/`
> (dynamic routes, Server Actions, notFound, layouts) — APIs may differ from
> what you already know. Heed deprecation notices.

---

## Shared Conventions (both must follow)

1. **Seat locking**: every state transition on `EventSeat` / `Booking` is a
   single guarded `updateMany` (e.g. `WHERE status = 'AVAILABLE'`), never a
   `findUnique`/`findFirst` followed by a separate `update`. Pair related
   transitions (seat + booking) in one `prisma.$transaction`. Extend the
   existing helpers in `src/lib/seat-locking.ts` — do not rewrite them.
2. **Validation**: validate every mutation input with Zod before touching the
   database. Never trust client input.
3. **Errors**: catch errors and return typed results (e.g.
   `{ ok: true, ... } | { ok: false; error: string }`) to the UI. Never leak
   raw error objects or stack traces to the client.
4. **IDs**: never assign IDs manually — `cuid()` defaults handle it.
5. **Data**: `createdAt`/`updatedAt` are handled by the schema; do not set them
   manually.
6. **Env vars**: add new env var names to `.env.example` (names only, no real
   values). Parse and validate env vars before use — a missing/empty/non-numeric
   value must fall back to a safe default, never silently produce `NaN` or `0`.
   (`PENDING_DOOR_EXPIRY_HOURS` already exists in `src/lib/env.ts`, default 24.)
7. **UI**: English. Use Tailwind (already configured). No new UI library
   without asking.
8. **Mobile-first**: the app is used primarily on phones. Build mobile layouts
   first (~375–430px), then scale up with `sm:`/`md:`/`lg:` media queries. No
   hover-dependent functionality. Minimum 44×44px touch targets, 16px+ inputs
   (prevents iOS zoom), and native input types — use `type="tel"`,
   `inputMode="tel"`, `autoComplete` — so the right virtual keyboard appears.
   Full rules in AGENTS.md.
9. **Public access boundary**: the event slug is the entire access boundary —
   no auth on the client panel. A missing slug or a **never-published (DRAFT)**
   event must return an **identical 404** either way; never reveal that an
   unpublished event exists at a given slug. Events that **were** published and
   are now `CLOSED`/`CANCELED`/already started are **not** 404 — they render an
   "event has ended / been canceled" state (see Task B2).
10. **Elderly-friendly copy**: short sentences, plain wording, one clear next
    step per screen. The reference code must be shown large and unmissable so
    it can be read or copied by hand.
11. **Verification**: after your feature, run `npx tsc --noEmit` and
    `npm run lint` and confirm they pass.
12. **Shared seat map**: the venue seat map is a single shared component in
    `src/components/seat-map.tsx` used by both the admin venue builder and the
    event page. Never duplicate its rendering; make visual changes there so
    both panels stay in sync. See `docs/seat-map-fragment.md`.

### Agreed route contract (so both teammates link correctly)

- `/e/[slug]` — public event page: details + seat map + booking request (A)
- `/e/[slug]/booking/[bookingId]` — booking status page (B)

The success screen after a booking request (built by A) must link to the
status page route above; B owns the page it points at. Route shape is fixed —
do not change it once A commits.

---

## TEAMMATE A — Public Event Page + Seat Request Flow (goes first)

### Task A1: Public event data + event page

- `src/lib/events.ts` — add a public read helper `getPublicEventBySlug(slug)`
  (or a new `src/lib/public-events.ts`) returning a discriminated union:
  - `{ outcome: 'not_found' }` for a missing OR never-published (DRAFT) event
    (identical 404 per Shared Convention #9).
  - `{ outcome: 'live', event }` for a `PUBLISHED` event whose `startsAt` is
    still in the future — event details plus its seat map:
    - `name`, `description`, `startsAt`, `venue` (name, address)
    - `sections` — name + price, formatted with `formatPrice` from
      `src/lib/currency.ts`
    - seats grouped by row: `row`, `number`, `sectionName`, and `status` —
      derived from `EventSeat` joined to `VenueSeat` → `VenueSection`
    - a section → color map using `buildSectionColorMap` from
      `src/lib/section-colors.ts`
  - `{ outcome: 'ended', event }` for a `CLOSED`/`CANCELED` event, or a
    `PUBLISHED` event whose `startsAt` has passed — event details only, no
    seats, no request form (the page shows the ended/canceled state).
- `src/app/e/[slug]/page.tsx` — render the public event page:
  - Event details: name, date/time via `formatDate` (`src/lib/format.ts`),
    venue name + address, description, and a section legend showing each
    section's color and price.
  - Seat map grouped by section/row, mirroring the layout approach already
    used in `src/lib/venues.ts` (`getVenueForEdit` builder data). Only
    `AVAILABLE` seats are tappable/selectable; `PENDING`, `BOOKED`, and
    `CANCELED` seats render as taken and are disabled.
  - When the helper returns `not_found`, call `notFound()` — no alternate
    "event not found" page with different content. When it returns `ended`,
    render a clear "this event has ended / been canceled" state with no
    selectable seats and no request form.

**Acceptance criteria**
- [ ] Unknown slug → 404; never-published (DRAFT) slug → identical 404
- [ ] CLOSED / CANCELED / finished (past `startsAt`) events → readable ended
      state, not 404, with no selectable seats
- [ ] Published event → details + seat map with prices and section colors
- [ ] Only `AVAILABLE` seats are selectable; taken seats are visually distinct
      and disabled
- [ ] Seat map renders correctly on a phone-width viewport (375–430px)
- [ ] `npx tsc --noEmit` and `npm run lint` pass
- [ ] Commit A1 before moving to A2

### Task A2: Booking request flow (ONLINE_CODE + PAY_AT_DOOR)

- `src/lib/seat-locking.ts` — add `requestSeatPayAtDoor`:
  - Same guarded `updateMany` shape as the existing `requestSeatOnlineCode`
    (`WHERE status = 'AVAILABLE'`), but `caseType: PAY_AT_DOOR`, **no reference
    code**, and `expiresAt = now + env.pendingDoorExpiryHours` (default 24h).
  - Both request functions must run inside one `prisma.$transaction` and
    reject requests for an event that is not bookable. The event must be
    `status = PUBLISHED` and **not** `CLOSED` or `CANCELED`, and its
    `startsAt` must still be in the future — checked within the same
    transaction as the guarded seat `updateMany`. A public Server Action can
    be invoked without the page ever rendering, so the mutation itself is the
    enforcement point, never the UI. (Same condition as the
    `{ outcome: 'live' }` contract from A1 / Task B2.)
- `src/lib/validation/bookings.ts` — add a Zod schema for the public request:
  `eventId`, `eventSeatId`, `userName`, `userPhone` (native phone shape),
  `caseType` restricted to `ONLINE_CODE | PAY_AT_DOOR` only — `GUEST` is
  admin-only and must never be accepted from the public.
- `src/lib/actions/bookings.ts` (or a new `src/lib/actions/requests.ts`) — a
  `requestSeatAction` Server Action: Zod-validate, call
  `requestSeatOnlineCode` or `requestSeatPayAtDoor`, return
  `{ ok: true, bookingId, referenceCode? }` or `{ ok: false, error }`. A
  failed guarded update (0 rows — seat taken between load and submit) returns a
  friendly typed error, not a throw.
- `/e/[slug]` page — the request flow:
  1. Attendee taps an `AVAILABLE` seat.
  2. Attendee picks a booking case: **Pay online with code** (ONLINE_CODE) or
     **Pay at the door** (PAY_AT_DOOR).
  3. Attendee enters name + phone (`type="tel"`, `inputMode="tel"`,
     `autoComplete`, 16px+, errors visible without scrolling).
  4. On success show a confirmation screen:
     - ONLINE_CODE — show the reference code large and unmissable, with
       "pay the organizer and use this code as the payment note" instructions,
       plus a "check my booking" link to
       `/e/[slug]/booking/[bookingId]` (the route B owns).
     - PAY_AT_DOOR — "we're holding your seat for you — pay at the door",
       plus the same status-page link.
  5. On failure (seat no longer available, event canceled/closed, event
     already started, validation error) show the error inline and re-render
     the seat map so the attendee can pick another seat.

**Acceptance criteria**
- [ ] ONLINE_CODE request: seat `AVAILABLE → PENDING`, booking created
      `PENDING` with a reference code shown to the attendee
- [ ] PAY_AT_DOOR request: seat `AVAILABLE → PENDING`, booking created
      `PENDING`, no reference code, expiry from `PENDING_DOOR_EXPIRY_HOURS`
- [ ] Two simultaneous requests for the same seat — exactly one succeeds, the
      other gets a typed "seat no longer available" error (guarded update)
- [ ] Public request with `caseType: GUEST` is rejected
- [ ] Requesting on a `CANCELED` event is rejected
- [ ] Requesting on a `CLOSED` event is rejected
- [ ] Requesting on an event whose `startsAt` has passed is rejected
- [ ] The event-state guard lives in the transaction (Server Action is
      callable without rendering `/e/[slug]`), so the above hold even when
      the page is bypassed
- [ ] Success screens link to `/e/[slug]/booking/[bookingId]`
- [ ] `npx tsc --noEmit` and `npm run lint` pass
- [ ] Commit A2 when done — A is finished

---

## TEAMMATE B — Booking Status Page + Finish (goes second)

### Task B1: Booking status page

- `src/app/e/[slug]/booking/[bookingId]/page.tsx` — render the status of one
  booking:
  - Look up the booking by `bookingId` AND verify it belongs to the event at
    `[slug]`; a mismatch or unknown id returns an identical `notFound()`. A
    never-published (DRAFT) event also returns `notFound()`, while
    `CLOSED`/`CANCELED`/finished events still render (attendees may be
    checking an ended event's booking) — same visibility contract as the
    event page (Shared Convention #9 / Task B2).
  - Elderly-friendly status screens with one clear next step each:
    - `PENDING` + ONLINE_CODE — show the reference code again, "we're waiting
      for your payment — once it's confirmed this page will update".
    - `PENDING` + PAY_AT_DOOR — "your seat is being held — pay at the door".
    - `CONFIRMED` — "your seat is confirmed" with event details, seat/section,
      and price. (Ticket delivery via WhatsApp is out of scope.)
    - `CANCELLED` / `EXPIRED` — the hold is gone; link back to
      `/e/[slug]` to request the seat again if it's still available.
  - Show event name, date/time, venue, seat row/number, section + price on
    every state.
- Add a small read helper (in `src/lib/events.ts` or a new
  `src/lib/public-bookings.ts`) that loads booking + event + seat + section
  data for this page — keep it a read-only query, no transitions.

**Acceptance criteria**
- [ ] A PENDING ONLINE_CODE booking shows its reference code and a clear
      "waiting for payment" state
- [ ] Confirming the booking in the admin panel flips this page to
      `CONFIRMED` on refresh
- [ ] CANCELLED/EXPIRED bookings show the "request again" path
- [ ] Wrong bookingId, or a booking from a different event's slug, → identical
      404
- [ ] `npx tsc --noEmit` and `npm run lint` pass
- [ ] Commit B1 before moving to B2

### Task B2: Edge cases + polish

- **Closed/canceled events on the public page**: when the event is `CLOSED`,
  `CANCELED`, or `startsAt` has passed, `/e/[slug]` shows a clear
  "this event has ended / been canceled" state — no selectable seats, no
  request form. This is delivered by the `{ outcome: 'ended' }` branch of
  `getPublicEventBySlug` built in A1; A's page must already render it. (A
  `CANCELED` event is not 404 — it was published and the attendee must see why
  they can't book.)
- **Re-check on submit**: if the seat the attendee picked is taken by the time
  they submit, the typed error from A2 must re-render the seat map with the
  seat now shown as taken.
- **Landing after payment** (verify the A→B contract): requesting a seat then
  visiting the status page link works end-to-end.
- **Final checks**: `npx prisma generate`, `npx tsc --noEmit`, `npm run lint`,
  `npm run build` all pass.

**Acceptance criteria**
- [ ] CLOSED/CANCELED/finished events show a readable state with seats disabled
- [ ] Expired/canceled event public pages never accept a booking request
- [ ] Request → status page flow works against seeded data
- [ ] `npm run build` passes
- [ ] Commit B2 — the panel is complete

---

## Definition of Done (whole panel)

- [ ] `npx prisma generate` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] Manual flow: create venue (with layout) → create + publish event →
      open `/e/<slug>` on a phone-width viewport → request a seat with code
      (reference code shown) → request another seat pay-at-door → confirm both
      in the admin panel → open both status pages and see `CONFIRMED` →
      verify seat states in the DB (`EventSeat.status` / `Booking.status`
      stayed consistent)
- [ ] Unpublished (DRAFT) or unknown slug returns the same 404; previously
      published events that are CLOSED/CANCELED/finished show the ended state
      instead of 404

### Out of scope (do NOT build here)

- WhatsApp ticket sending / resend (external integration)
- The scheduled expiry sweep job (separate task)
- The admin panel (already done)
- Any authentication or accounts for attendees
