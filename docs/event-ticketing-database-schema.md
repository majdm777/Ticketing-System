we will be doing the models, tables and everything in this order:

0. enums
1. venue + venue_section + venue_seat
2. event + event_seat
3. booking

each numbered step above is its own isolated migration:

- one migration per step (related models grouped as shown; enums are step 0)
- each migration has its own seeder
- each migration has its own test
- each migration is its own PR

down are the tables with all the things — check them and make sure we work step by step as mentioned above
to have a clear vision.

The tables:

// ============================================================
// ENUMS (migration 0 — defined before any model)
// ============================================================

enum EventStatus {
DRAFT
PUBLISHED
CLOSED
CANCELED // admin cancels a published, not-yet-started event
}

enum SeatStatus {
AVAILABLE
PENDING
BOOKED
CANCELED // every seat of a CANCELED event
}

enum CaseType {
ONLINE_CODE
PAY_AT_DOOR
GUEST
}

enum BookingStatus {
PENDING
CONFIRMED
CANCELLED
EXPIRED
}

// ============================================================
// 1. VENUE
// ============================================================

model Venue {
id String @id @default(cuid())

name String
address String

createdAt DateTime @default(now())
updatedAt DateTime @updatedAt

sections VenueSection[]
seats VenueSeat[]
events Event[]
}

// ============================================================
// 2. VENUE_SECTION
// ============================================================

model VenueSection {
id String @id @default(cuid())

venueId String

name String // unique per venue
price Int // per-seat price, whole US dollars

createdAt DateTime @default(now())
updatedAt DateTime @updatedAt

venue Venue @relation(fields: [venueId], references: [id], onDelete: Cascade)

seats VenueSeat[]

@@unique([venueId, name])
@@unique([id, venueId])
}

// ============================================================
// 3. VENUE_SEAT
// ============================================================

model VenueSeat {
id String @id @default(cuid())

venueId String

row String
number String
sectionId String

createdAt DateTime @default(now())
updatedAt DateTime @updatedAt

venue Venue @relation(fields: [venueId], references: [id], onDelete: Cascade)
section VenueSection @relation(fields: [sectionId, venueId], references: [id, venueId])

eventSeats EventSeat[]

@@unique([venueId, row, number])
@@unique([id, venueId])
}

// ============================================================
// 4. EVENT
// ============================================================

model Event {
id String @id @default(cuid())

venueId String

name String
description String?
startsAt DateTime
status EventStatus @default(DRAFT)

slug String @unique

createdAt DateTime @default(now())
updatedAt DateTime @updatedAt

venue Venue @relation(fields: [venueId], references: [id])

seats EventSeat[]
bookings Booking[]

@@unique([id, venueId])
}

// ============================================================
// 5. EVENT_SEAT
// ============================================================

model EventSeat {
id String @id @default(cuid())

eventId String
venueSeatId String
venueId String

status SeatStatus @default(AVAILABLE)

bookedByName String?
bookedByPhone String?
referenceCode String?
pendingSince DateTime?
expiresAt DateTime?

createdAt DateTime @default(now())
updatedAt DateTime @updatedAt

event Event @relation(fields: [eventId, venueId], references: [id, venueId], onDelete: Cascade)
venueSeat VenueSeat @relation(fields: [venueSeatId, venueId], references: [id, venueId])

bookings Booking[]

@@unique([eventId, venueSeatId])
@@unique([eventId, id])
@@index([status, expiresAt])
}

// ============================================================
// 6. BOOKING
// ============================================================

model Booking {
id String @id @default(cuid())

eventId String
eventSeatId String

userName String
userPhone String

caseType CaseType
status BookingStatus @default(PENDING)

// only set for ONLINE_CODE bookings, matched by admin to a payment.
// Shared across the bookings of one multi-seat request (the attendee pays
// once per group with a single code), so it is not unique.
referenceCode String?

confirmedByAdmin String?
confirmedAt DateTime?
cancelledAt DateTime?
expiresAt DateTime?

ticketToken String? @unique // signed QR value, reserved for when ticket generation is built
ticketPdfUrl String?
ticketSentAt DateTime?
ticketNote String?

createdAt DateTime @default(now())
updatedAt DateTime @updatedAt

event Event @relation(fields: [eventId], references: [id])
eventSeat EventSeat @relation(fields: [eventId, eventSeatId], references: [eventId, id])

@@index([eventId, status]) // admin dashboard: "show all PENDING bookings for this event"
@@index([status, expiresAt]) // lazy expiry sweep: "find all PENDING bookings past expiresAt"
@@index([referenceCode]) // admin: match a payment note code to its group of bookings
}

model ReferenceCode {
code String @id // UNIQUE — reserved inside the request transaction before any
                // booking references it, so two concurrent requests can never
                // win the same code (the loser aborts and retries with a fresh
                // one). Rows persist, so a code is never reused.

                // Growth policy: codes are 8 chars from a 31-char alphabet
                // (~850B keyspace); the table grows without pruning because
                // rows are never deleted (see src/lib/tickets.ts and the model
                // comment in prisma/schema.prisma).

createdAt DateTime @default(now())
}

---

## Migration history (squashed)

`prisma/migrations/` currently holds a **single** migration, `0_init`, which
creates the whole schema in one step. It replaces the earlier 11-migration
chain (init, booking integrity, venue ownership, venue sections, canceled
statuses, USD prices, unique seat coordinates, seat gaps, shared reference
codes, booking expiry index). The resulting schemas are identical: `0_init`
was generated from the current `prisma/schema.prisma` and verified with
`prisma migrate diff` (no drift).

**`0_init` recreates schema structure only — it does not replay the historical
data backfills or custom data migrations from the removed chain.** The
`prisma migrate diff` check above proves schema equivalence, not data
equivalence. Anything those migrations wrote is not restored:

- the `VenueSection` backfill for venues created before sections existed
  (placeholder price `100` had to be fixed by hand);
- the LBP→USD section-price conversion;
- the `ReferenceCode` reservation backfill for codes already issued.

A recreated environment (fresh database, or `migrate reset`) therefore starts
empty. Rebuild the data it needs from the seed (see `prisma/seed.ts` and the
`prisma.seed` command in `package.json`) or from a backup, then confirm
section prices, since the old chain's placeholder values are not reapplied.

### New databases

No special handling — `0_init` applies cleanly on an empty database:

    prisma migrate deploy    # or `prisma migrate dev` in development

After applying, run the seed to populate development data:

    ALLOW_DESTRUCTIVE_SEED=true node prisma/seed.ts

### Existing databases that already applied the old chain

A database that ran the old chain keeps all 11 rows in `_prisma_migrations`
(after baselining, plus the `0_init` row) and its schema is unchanged, so
nothing needs to re-run. Bring it onto the squashed history without touching
data:

1. **Audit** which environments still carry the old chain
   (`SELECT migration_name FROM _prisma_migrations;` should list the 11 old
   names, not `0_init`).
2. **Back up** the database first (e.g. `pg_dump`).
3. **Baseline** — mark `0_init` as already applied. Its SQL equals the old
   chain's net result, so nothing actually runs:

       prisma migrate resolve --applied 0_init

   This only inserts the `0_init` row. The 11 old rows stay put — that is the
   documented outcome of the squash workflow, and rows must **not** be deleted
   from `_prisma_migrations` by hand: Prisma has no supported cleanup command
   for it and manual deletes can desynchronize the history.

4. **Verify** — schema and data are untouched. Confirmed on a disposable copy
   of the old chain using Prisma 6.19.3:

       prisma migrate status   # "Database schema is up to date!" (exit 0)
       prisma migrate deploy   # "No pending migrations to apply." (exit 0)
       prisma migrate diff \
         --from-url "$DATABASE_URL" \
         --to-schema-datamodel prisma/schema.prisma   # "No difference detected."

   `migrate status` and `migrate deploy` exit 0 and stay silent about the
   leftover rows, and `deploy` still applies future migrations normally
   (tested with a throwaway post-chain migration) — so a CI job running
   `migrate status`/`deploy` on such a database passes. Only `migrate dev`
   flags the old rows. Comparing a live database against the schema
   (`--from-url` + `--to-schema-datamodel`) needs no shadow database; a shadow
   database is only required when diffing against a migrations directory
   (`--from-migrations`/`--to-migrations`).
5. **Rollback** — the baseline is a single `_prisma_migrations` insert and
   changes no schema or data. To undo it, restore the backup from step 2
   **together with** the matching pre-squash migration directory
   (`git checkout 5f20037^ -- prisma/migrations`) so the database's migration
   history and the checked-out files stay aligned. Restoring the database
   alone is not a valid rollback: it drops the `0_init` row while the checkout
   still contains `0_init`'s `CREATE TABLE` statements, so a later
   `prisma migrate deploy` would try to create tables that already exist. And
   `prisma migrate resolve --rolled-back 0_init` does not work either — it
   errors with P3012 because `0_init` was applied, not failed.

> `prisma migrate dev` is the exception: on a database that still carries the
> old rows it reports them as "applied to the database but missing from the
> local migrations directory" and proposes a reset. That is expected — the
> interactive dev workflow is reset-based; use `deploy`-style workflows on that
> database, or reset it. And do **not** apply `0_init`'s SQL to such a database
> without baselining it first: its `CREATE TABLE` statements fail because the
> tables already exist. If the environment has no data worth keeping,
> `prisma migrate reset --force` is the simplest path in every case.
