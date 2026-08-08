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
@@index([status, expiresAt]) // used by the lazy expiry sweep: "find all PENDING seats past expiresAt"
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

referenceCode String? @unique // only set for ONLINE_CODE bookings, matched by admin to a payment

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
}
