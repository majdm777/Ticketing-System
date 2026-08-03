-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_eventSeatId_fkey";

-- DropIndex
DROP INDEX "Booking_eventSeatId_key";

-- AlterTable
DO $$
DECLARE
  null_count integer;
BEGIN
  SELECT COUNT(*) INTO null_count FROM "VenueSeat" WHERE "section" IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION
      'Cannot set "VenueSeat"."section" NOT NULL: % row(s) with NULL section found. Backfill a section value for each seat (e.g. UPDATE "VenueSeat" SET "section" = ''General'' WHERE "section" IS NULL) or delete those rows before applying this migration.',
      null_count;
  END IF;
END $$;

ALTER TABLE "VenueSeat" ALTER COLUMN "section" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Booking_eventId_eventSeatId_key" ON "Booking"("eventId", "eventSeatId");

-- CreateIndex
CREATE UNIQUE INDEX "EventSeat_eventId_id_key" ON "EventSeat"("eventId", "id");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_eventId_eventSeatId_fkey" FOREIGN KEY ("eventId", "eventSeatId") REFERENCES "EventSeat"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

