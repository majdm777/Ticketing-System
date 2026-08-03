-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SeatStatus" AS ENUM ('AVAILABLE', 'PENDING', 'BOOKED');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('ONLINE_CODE', 'PAY_AT_DOOR', 'GUEST');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueSeat" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "row" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "section" TEXT,

    CONSTRAINT "VenueSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSeat" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "venueSeatId" TEXT NOT NULL,
    "status" "SeatStatus" NOT NULL DEFAULT 'AVAILABLE',
    "bookedByName" TEXT,
    "bookedByPhone" TEXT,
    "referenceCode" TEXT,
    "pendingSince" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventSeatId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userPhone" TEXT NOT NULL,
    "caseType" "CaseType" NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "referenceCode" TEXT,
    "confirmedByAdmin" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "ticketToken" TEXT,
    "ticketPdfUrl" TEXT,
    "ticketSentAt" TIMESTAMP(3),
    "ticketNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VenueSeat_venueId_row_number_section_key" ON "VenueSeat"("venueId", "row", "number", "section");

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE INDEX "EventSeat_status_expiresAt_idx" ON "EventSeat"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventSeat_eventId_venueSeatId_key" ON "EventSeat"("eventId", "venueSeatId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_eventSeatId_key" ON "Booking"("eventSeatId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_referenceCode_key" ON "Booking"("referenceCode");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_ticketToken_key" ON "Booking"("ticketToken");

-- CreateIndex
CREATE INDEX "Booking_eventId_status_idx" ON "Booking"("eventId", "status");

-- AddForeignKey
ALTER TABLE "VenueSeat" ADD CONSTRAINT "VenueSeat_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeat" ADD CONSTRAINT "EventSeat_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeat" ADD CONSTRAINT "EventSeat_venueSeatId_fkey" FOREIGN KEY ("venueSeatId") REFERENCES "VenueSeat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_eventSeatId_fkey" FOREIGN KEY ("eventSeatId") REFERENCES "EventSeat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
