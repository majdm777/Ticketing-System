-- DropForeignKey
ALTER TABLE "EventSeat" DROP CONSTRAINT "EventSeat_eventId_fkey";

-- DropForeignKey
ALTER TABLE "EventSeat" DROP CONSTRAINT "EventSeat_venueSeatId_fkey";

-- DropIndex
DROP INDEX "Booking_eventId_eventSeatId_key";

-- AlterTable: add venueId as nullable first, then backfill.
ALTER TABLE "EventSeat" ADD COLUMN "venueId" TEXT;

-- Backfill venueId from the owning event's venue.
UPDATE "EventSeat" es
SET "venueId" = e."venueId"
FROM "Event" e
WHERE es."eventId" = e."id";

-- Preflight: every EventSeat must reference a VenueSeat from the same venue.
DO $$
DECLARE
  null_count   integer;
  mismatch_count integer;
BEGIN
  SELECT COUNT(*) INTO null_count FROM "EventSeat" WHERE "venueId" IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce venue ownership: % EventSeat row(s) have no venue after backfill. Ensure every EventSeat.eventId references an existing Event.',
      null_count;
  END IF;

  SELECT COUNT(*) INTO mismatch_count
  FROM "EventSeat" es
  JOIN "VenueSeat" vs ON vs.id = es."venueSeatId"
  WHERE es."venueId" <> vs."venueId";

  IF mismatch_count > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce venue ownership: % EventSeat row(s) pair an Event with a VenueSeat from a different venue. Fix or delete them before applying this migration.',
      mismatch_count;
  END IF;
END $$;

ALTER TABLE "EventSeat" ALTER COLUMN "venueId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Event_id_venueId_key" ON "Event"("id", "venueId");

-- CreateIndex
CREATE UNIQUE INDEX "VenueSeat_id_venueId_key" ON "VenueSeat"("id", "venueId");

-- AddForeignKey
ALTER TABLE "EventSeat" ADD CONSTRAINT "EventSeat_eventId_venueId_fkey" FOREIGN KEY ("eventId", "venueId") REFERENCES "Event"("id", "venueId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeat" ADD CONSTRAINT "EventSeat_venueSeatId_venueId_fkey" FOREIGN KEY ("venueSeatId", "venueId") REFERENCES "VenueSeat"("id", "venueId") ON DELETE RESTRICT ON UPDATE CASCADE;
