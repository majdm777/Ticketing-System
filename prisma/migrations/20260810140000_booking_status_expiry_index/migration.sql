-- The lazy expiry sweep (expirePastDuePendingBookings) finds all PENDING
-- bookings whose expiresAt is past; index the two filtered columns together
-- so that sweep (and the dashboard's per-event PENDING list, which reuses the
-- existing [eventId, status] index) stays index-backed.

-- Lock decision: the Booking table is small (dev/staging, no large production
-- dataset), so the plain CREATE INDEX form is used. If this ever needs to run
-- against a large production Booking table, apply it concurrently outside the
-- Prisma transaction wrapper.

-- CreateIndex
CREATE INDEX "Booking_status_expiresAt_idx" ON "Booking"("status", "expiresAt");
