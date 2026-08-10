-- A public multi-seat request shares ONE reference code across the group's
-- bookings (the attendee uses it once as the payment note). Allow several
-- bookings to carry the same code; keep a plain index for admin lookups.
-- The code is still unique in practice per group (uniqueReferenceCode checks
-- for clashes before inserting), but uniqueness is no longer enforced here.

-- DropUnique
DROP INDEX "Booking_referenceCode_key";

-- CreateIndex
CREATE INDEX "Booking_referenceCode_idx" ON "Booking"("referenceCode");
