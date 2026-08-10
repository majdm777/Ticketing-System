# Scheduled Expiry Sweep — Task Breakdown

Build a scheduled (cron) job that runs the existing hold-expiry sweep on a
regular schedule. The **lazy** on-demand sweep
(`expirePastDuePendingBookings` in `src/lib/seat-locking.ts`) already exists
and runs from the pages that read seat/booking state (public event page,
admin bookings page). This task adds the **background** variant the flow docs
list as out of scope, so holds expire even when nobody visits those pages
(e.g. a low-traffic event with no page views for hours).

Read `docs/event-ticketing-flow.md` and `docs/event-ticketing-database-schema.md`
first — they are the source of truth for the domain and schema.

> IMPORTANT: this repo uses a modified Next.js version (see AGENTS.md). Before
> writing any code, read the relevant guides in `node_modules/next/dist/docs/`
> (route handlers, caching, deployment) — APIs may differ from what you already
> know. Heed deprecation notices.

---

## What already exists (do NOT rebuild)

- `expirePastDuePendingBookings(eventId?)` in `src/lib/seat-locking.ts`:
  expires every `PENDING` booking whose `expiresAt` has passed (booking
  `PENDING → EXPIRED`) and frees its seat back to `AVAILABLE` (clearing the
  hold fields). All transitions are guarded (`WHERE status = 'PENDING'`), run
  in one transaction, and have a cheap count-first fast path when nothing is
  past due. Called with an `eventId` to scope to one event, or with no
  argument to sweep the whole database.
- Existing call sites: `src/lib/public-events.ts` (per-event, on the public
  event page) and `src/app/admin/bookings/page.tsx` (per-event, on the admin
  bookings page). The dashboard and other admin pages do not call it today —
  the scheduled job covers those gaps.
- `src/lib/env.ts` — typed env access with safe defaults (the pattern to
  follow for new env vars).
- `.env.example` — names only, never real values.

---

## Behavior

### Task 1: Protected cron route handler

- `src/app/api/cron/expire-pending/route.ts` — a `POST` route handler that:
  1. Requires the scheduled caller to authenticate. Compare the
     `Authorization: Bearer <token>` header against `CRON_SECRET` with a
     **constant-time comparison** (`crypto.timingSafeEqual`, same pattern as
     `verifyPassword` in `src/lib/admin-session.ts`). Wrong or missing token
     → `401` with a generic body; never reveal whether the token was close.
     The endpoint must not be triggerable by the public — an unauthenticated
     caller could otherwise drive a DB sweep on demand.
  2. Calls `expirePastDuePendingBookings()` with **no** `eventId` (a global
     sweep — every past-due hold across all events).
  3. Returns `200` with a small JSON body, e.g.
     `{ ok: true, expired: <count> }`, where `<count>` is the number of
     bookings the sweep expired. Log the count server-side.
  4. Is **never cached**: `export const dynamic = 'force-dynamic'` (or the
     equivalent this Next.js version requires). A cached response would both
     skip the sweep and mask failures.
  5. Runs no revalidation: the pages that show seat/booking state are dynamic
     and call the sweep themselves on read, so the next visit reflects the
     frees automatically.

### Task 2: Scheduler wiring

One of the following (choose per deployment — the repo has no deployment
config today; `.github/workflows/ci.yml` is CI only). Document the chosen one
in the commit/PR.

- **Vercel Cron** (if/when deployed on Vercel): a `vercel.json` with
  `"crons"` — `{ "path": "/api/cron/expire-pending", "schedule": "0 * * * *",
  "method": "POST" }` (hourly). The cron header alone is **not** sufficient
  protection; still require `CRON_SECRET`.
- **GitHub Actions `schedule`** (deployment-agnostic, fits the repo's
  existing Actions usage): a workflow with
  `on: schedule: [{ cron: '0 * * * *' }]` (and a `workflow_dispatch` for
  manual runs) that calls the endpoint with `curl` and the `CRON_SECRET`
  secret. Note Actions scheduled runs can be delayed by minutes — acceptable
  here given the expiry windows are 3h/24h.
- **External scheduler** (cron-job.org, AWS EventBridge, ...): a `POST` to
  the endpoint with the `CRON_SECRET` bearer token.

Frequency: **hourly** is the recommended default (ONLINE_CODE holds expire
after 3h, PAY_AT_DOOR after 24h, so an hourly sweep frees a hold within at
most ~2h of its nominal expiry). Do not go more frequent than every 5
minutes; the sweep is cheap but pointless to hammer.

### Task 3: Config

- `.env.example` — add `CRON_SECRET=""` (names only, with a short comment).
- `src/lib/env.ts` — add `cronSecret: readString('CRON_SECRET')`. Follow the
  existing rule: a missing/empty value must fail closed (the route rejects
  every request) rather than silently allowing public access.

---

## Concurrency & idempotency

- The sweep is **idempotent**: transitions are guarded on `status =
  'PENDING'`, so a booking confirmed or cancelled between reads is never
  touched, and re-running the sweep is a no-op.
- **Overlapping runs are safe**: two sweeps running concurrently expire
  disjoint sets (each booking is flipped once; the loser's guarded update
  affects 0 rows). No lock or dedup is required.
- Keep the guarded-`updateMany` shape from `expirePastDuePendingBookings`;
  this job adds **no** new database mutation logic.

---

## Acceptance criteria

- [ ] `POST /api/cron/expire-pending` without a valid `CRON_SECRET` returns
      401 and expires nothing
- [ ] With a valid `CRON_SECRET`, past-due `PENDING` bookings become
      `EXPIRED` and their seats return to `AVAILABLE` (hold fields cleared),
      verifiable in the DB
- [ ] A confirmed/cancelled booking in the same window is never expired by
      the sweep
- [ ] A run with nothing past due is a no-op and returns `expired: 0` (cheap
      fast path)
- [ ] The route is never cached (dynamic)
- [ ] `.env.example` lists `CRON_SECRET`; `src/lib/env.ts` parses it with a
      fail-closed default
- [ ] Scheduler entry (vercel.json / workflow / external) committed with the
      endpoint
- [ ] `npx prisma generate`, `npx tsc --noEmit`, `npm run lint`, and
      `npm run build` all pass

---

## Out of scope (do NOT build here)

- Changing the expiry logic or windows themselves (owned by the lazy sweep)
- A queue/retry system for the cron job itself
- The WhatsApp ticket delivery feature (separate doc — `whatsapp-ticket-delivery.md`)
- Multi-admin / role hierarchy
