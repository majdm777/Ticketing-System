-- A public multi-seat request shares ONE reference code across the group's
-- bookings (the attendee uses it once as the payment note). Allow several
-- bookings to carry the same code; keep a plain index for admin lookups.
--
-- Cross-group uniqueness is enforced by the ReferenceCode table, not by
-- Booking.referenceCode: a code is reserved here (UNIQUE on `code`) inside the
-- same transaction that creates the bookings. Two concurrent requests can
-- never both win the same code — the loser hits a unique violation, that whole
-- request transaction rolls back, and the request retries with a fresh code.

-- Lock decision: the Booking table is small (dev/staging, no large production
-- dataset), so the index drop/recreate below uses the plain forms, which take
-- an ACCESS EXCLUSIVE lock for the duration. If this ever needs to run against
-- a large production Booking table, split it into a separately-applied,
-- non-transactional migration using DROP INDEX CONCURRENTLY / CREATE INDEX
-- CONCURRENTLY (Prisma Migrate wraps each migration in a transaction, which
-- CONCURRENTLY cannot run inside).

-- CreateTable
CREATE TABLE "ReferenceCode" (
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenceCode_pkey" PRIMARY KEY ("code")
);

-- DropUnique
DROP INDEX "Booking_referenceCode_key";

-- CreateIndex
CREATE INDEX "Booking_referenceCode_idx" ON "Booking"("referenceCode");
