-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_eventSeatId_fkey";

-- DropIndex
DROP INDEX "Booking_eventSeatId_key";

-- AlterTable
ALTER TABLE "VenueSeat" ALTER COLUMN "section" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Booking_eventId_eventSeatId_key" ON "Booking"("eventId", "eventSeatId");

-- CreateIndex
CREATE UNIQUE INDEX "EventSeat_eventId_id_key" ON "EventSeat"("eventId", "id");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_eventId_eventSeatId_fkey" FOREIGN KEY ("eventId", "eventSeatId") REFERENCES "EventSeat"("eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

