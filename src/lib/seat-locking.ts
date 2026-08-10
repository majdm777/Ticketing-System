import { BookingStatus, CaseType, EventStatus, Prisma, SeatStatus } from '@prisma/client';

import { env } from './env';
import { prisma } from './prisma';
import { generateReferenceCode } from './tickets';

export class SeatUnavailableError extends Error {
  constructor(message = 'Seat is no longer available') {
    super(message);
    this.name = 'SeatUnavailableError';
  }
}

export class EventNotBookableError extends Error {
  constructor(message = 'This event is no longer accepting bookings') {
    super(message);
    this.name = 'EventNotBookableError';
  }
}

type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true } & T)
  | { ok: false; error: string };

// A public request must only ever succeed against a bookable event: PUBLISHED,
// not CLOSED or CANCELED, and not yet started. Checked inside the same
// transaction as the guarded seat lock (a Server Action can be invoked without
// the page ever rendering, so the mutation itself is the enforcement point,
// never the UI). The guarded updateMany below also re-checks the event in its
// WHERE clause, so the bookability guard and the seat lock are atomic even if
// the event state changes between the read and the update.
async function assertEventBookable(tx: Prisma.TransactionClient, eventId: string) {
  const event = await tx.event.findUnique({
    where: { id: eventId },
    select: { status: true, startsAt: true },
  });

  if (
    !event ||
    // Any status other than PUBLISHED is not bookable — this covers CLOSED,
    // CANCELED, and DRAFT alike.
    event.status !== EventStatus.PUBLISHED ||
    event.startsAt <= new Date()
  ) {
    throw new EventNotBookableError('This event is no longer accepting bookings.');
  }
}

async function uniqueReferenceCode(tx: Prisma.TransactionClient) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateReferenceCode();
    const clash = await tx.booking.findFirst({
      where: { referenceCode: candidate },
      select: { id: true },
    });

    if (!clash) {
      return candidate;
    }
  }

  throw new Error('Could not generate a unique reference code, please retry');
}

// Attendee request for one or more seats. All seats are locked and booked
// inside a single transaction, so either every selected seat is held or none
// are — a partial request (one seat already taken) rolls back entirely. Each
// seat becomes its own PENDING booking; ONLINE_CODE requests share ONE
// reference code across the group (the attendee uses it once as the payment
// note), while PAY_AT_DOOR requests get no code and hold longer
// (PENDING_DOOR_EXPIRY_HOURS). The event-bookability guard runs in the same
// transaction, so this is the enforcement point even if the page is never
// rendered.
export async function requestSeats(params: {
  eventId: string;
  eventSeatIds: string[];
  userName: string;
  userPhone: string;
  caseType: CaseType;
}): Promise<{
  referenceCode: string | null;
  bookings: Array<{ id: string; eventSeatId: string }>;
}> {
  const { eventId, eventSeatIds, userName, userPhone, caseType } = params;
  const online = caseType === CaseType.ONLINE_CODE;
  const expiryHours = online
    ? env.pendingOnlineExpiryHours
    : env.pendingDoorExpiryHours;
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    await assertEventBookable(tx, eventId);

    const now = new Date();
    // One code for the whole group. uniqueReferenceCode checks for clashes
    // before inserting, so two different groups never share a code even
    // though the column itself is no longer unique.
    const referenceCode = online ? await uniqueReferenceCode(tx) : null;

    const bookings = [];
    for (const eventSeatId of eventSeatIds) {
      const lockResult = await tx.eventSeat.updateMany({
        where: {
          id: eventSeatId,
          eventId,
          status: SeatStatus.AVAILABLE,
          event: {
            status: EventStatus.PUBLISHED,
            startsAt: { gt: now },
          },
        },
        data: {
          status: SeatStatus.PENDING,
          bookedByName: userName,
          bookedByPhone: userPhone,
          referenceCode,
          pendingSince: now,
          expiresAt,
        },
      });

      if (lockResult.count === 0) {
        throw new SeatUnavailableError();
      }

      const booking = await tx.booking.create({
        data: {
          eventId,
          eventSeatId,
          userName,
          userPhone,
          caseType,
          status: BookingStatus.PENDING,
          referenceCode,
          expiresAt,
        },
        select: { id: true, eventSeatId: true },
      });

      bookings.push(booking);
    }

    return { referenceCode, bookings };
  });
}

export async function confirmOnlineCodeBooking(params: {
  bookingId: string;
  adminName: string;
}) {
  return confirmBooking({ bookingId: params.bookingId, adminId: params.adminName });
}

export async function confirmBooking(params: {
  bookingId: string;
  adminId: string;
}): Promise<ActionResult<{ bookingId: string }>> {
  const { bookingId, adminId } = params;

  try {
    return await prisma.$transaction(async (tx) => {
      const bookingResult = await tx.booking.updateMany({
        where: { id: bookingId, status: BookingStatus.PENDING },
        data: {
          status: BookingStatus.CONFIRMED,
          confirmedByAdmin: adminId,
          confirmedAt: new Date(),
        },
      });

      if (bookingResult.count === 0) {
        return { ok: false, error: 'Booking was already handled or does not exist.' };
      }

      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: bookingId },
        select: { eventId: true, eventSeatId: true },
      });

      const seatResult = await tx.eventSeat.updateMany({
        where: {
          id: booking.eventSeatId,
          eventId: booking.eventId,
          status: SeatStatus.PENDING,
        },
        data: {
          status: SeatStatus.BOOKED,
          pendingSince: null,
          expiresAt: null,
        },
      });

      if (seatResult.count === 0) {
        throw new SeatUnavailableError('Seat is no longer pending');
      }

      return { ok: true, bookingId };
    });
  } catch (error) {
    if (error instanceof SeatUnavailableError) {
      return { ok: false, error: error.message };
    }

    return { ok: false, error: 'Could not confirm booking.' };
  }
}

export async function cancelBooking(params: {
  bookingId: string;
}): Promise<ActionResult<{ bookingId: string }>> {
  const { bookingId } = params;

  try {
    return await prisma.$transaction(async (tx) => {
      const bookingResult = await tx.booking.updateMany({
        where: { id: bookingId, status: BookingStatus.PENDING },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });

      if (bookingResult.count === 0) {
        return { ok: false, error: 'Booking was already handled or does not exist.' };
      }

      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: bookingId },
        select: { eventId: true, eventSeatId: true },
      });

      const seatResult = await tx.eventSeat.updateMany({
        where: {
          id: booking.eventSeatId,
          eventId: booking.eventId,
          status: SeatStatus.PENDING,
        },
        data: {
          status: SeatStatus.AVAILABLE,
          bookedByName: null,
          bookedByPhone: null,
          referenceCode: null,
          pendingSince: null,
          expiresAt: null,
        },
      });

      if (seatResult.count === 0) {
        throw new SeatUnavailableError('Seat is no longer pending');
      }

      return { ok: true, bookingId };
    });
  } catch (error) {
    if (error instanceof SeatUnavailableError) {
      return { ok: false, error: error.message };
    }

    return { ok: false, error: 'Could not cancel booking.' };
  }
}

export async function createGuestBooking(params: {
  eventId: string;
  venueSeatIds: string[];
  userName: string;
  userPhone: string;
  adminId: string;
}): Promise<ActionResult<{ bookingIds: string[] }>> {
  const { eventId, venueSeatIds, userName, userPhone, adminId } = params;

  try {
    return await prisma.$transaction(async (tx) => {
      const event = await tx.event.findUnique({
        where: { id: eventId },
        select: { status: true, startsAt: true },
      });
      if (
        !event ||
        event.status !== EventStatus.PUBLISHED ||
        event.startsAt <= new Date()
      ) {
        return {
          ok: false,
          error: 'Guest booking is only available for published events that have not started yet.',
        };
      }

      const seatResult = await tx.eventSeat.updateMany({
        where: {
          eventId,
          venueSeatId: { in: venueSeatIds },
          status: SeatStatus.AVAILABLE,
          event: {
            status: EventStatus.PUBLISHED,
            startsAt: { gt: new Date() },
          },
        },
        data: {
          status: SeatStatus.BOOKED,
          bookedByName: userName,
          bookedByPhone: userPhone,
          referenceCode: null,
          pendingSince: null,
          expiresAt: null,
        },
      });

      // Atomic claim: if every requested seat did not flip in this one
      // update, one of them was taken in the meantime. Throw so the
      // transaction rolls back the seats that did flip (returning here
      // would commit them).
      if (seatResult.count !== venueSeatIds.length) {
        throw new SeatUnavailableError(
          'One or more selected seats are no longer available.',
        );
      }

      const eventSeats = await tx.eventSeat.findMany({
        where: { eventId, venueSeatId: { in: venueSeatIds } },
        select: { id: true },
      });

      const createdBookings = await tx.booking.createManyAndReturn({
        data: eventSeats.map((eventSeat) => ({
          eventId,
          eventSeatId: eventSeat.id,
          userName,
          userPhone,
          caseType: CaseType.GUEST,
          status: BookingStatus.CONFIRMED,
          confirmedByAdmin: adminId,
          confirmedAt: new Date(),
        })),
        select: { id: true },
      });

      return { ok: true, bookingIds: createdBookings.map((b) => b.id) };
    });
  } catch (error) {
    if (error instanceof SeatUnavailableError) {
      return { ok: false, error: error.message };
    }

    // Unexpected — surface it in the server log so the failure is
    // distinguishable from the expected availability race above.
    console.error('Failed to create guest booking', error);
    return { ok: false, error: 'Could not create guest booking.' };
  }
}

// Expires every PENDING booking whose hold window has passed (and frees its
// seat back to AVAILABLE). Called lazily from the pages that show seat or
// booking state, so stale holds clear automatically on the next visit with no
// admin action and no background job. Pass `eventId` to limit the sweep to one
// event. All transitions stay guarded (status = PENDING) and run in one
// transaction, so a booking that was confirmed or cancelled in the meantime is
// never touched.
export async function expirePastDuePendingBookings(
  eventId?: string,
): Promise<number> {
  const where = {
    status: BookingStatus.PENDING,
    expiresAt: { lt: new Date() },
    ...(eventId ? { eventId } : {}),
  };

  // Cheap count first — the common case is nothing past due, and skipping the
  // transaction (and its snapshot) avoids an unnecessary round-trip.
  const pendingCount = await prisma.booking.count({ where });
  if (pendingCount === 0) {
    return 0;
  }

  return prisma.$transaction(async (tx) => {
    const pastDueBookings = await tx.booking.findMany({
      where,
      select: { id: true, eventSeatId: true },
    });

    const bookingIds = pastDueBookings.map((b) => b.id);
    const eventSeatIds = pastDueBookings.map((b) => b.eventSeatId);

    await tx.booking.updateMany({
      where: {
        id: { in: bookingIds },
        status: BookingStatus.PENDING,
      },
      data: { status: BookingStatus.EXPIRED },
    });

    await tx.eventSeat.updateMany({
      where: {
        id: { in: eventSeatIds },
        status: SeatStatus.PENDING,
        ...(eventId ? { eventId } : {}),
      },
      data: {
        status: SeatStatus.AVAILABLE,
        bookedByName: null,
        bookedByPhone: null,
        referenceCode: null,
        pendingSince: null,
        expiresAt: null,
      },
    });

    return bookingIds.length;
  });
}
