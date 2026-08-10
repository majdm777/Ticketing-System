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

type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true } & T)
  | { ok: false; error: string };

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

function isUniqueReferenceCodeError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002' &&
    'meta' in error &&
    Array.isArray((error as { meta?: { target?: unknown } }).meta?.target) &&
    ((error as { meta?: { target?: unknown[] } }).meta?.target ?? []).includes('referenceCode')
  );
}

export async function requestSeatOnlineCode(params: {
  eventId: string;
  eventSeatId: string;
  userName: string;
  userPhone: string;
}) {
  const { eventId, eventSeatId, userName, userPhone } = params;
  const expiresAt = new Date(Date.now() + env.pendingOnlineExpiryHours * 60 * 60 * 1000);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const referenceCode = await uniqueReferenceCode(tx);
        const lockResult = await tx.eventSeat.updateMany({
          where: {
            id: eventSeatId,
            eventId,
            status: SeatStatus.AVAILABLE,
          },
          data: {
            status: SeatStatus.PENDING,
            bookedByName: userName,
            bookedByPhone: userPhone,
            referenceCode,
            pendingSince: new Date(),
            expiresAt,
          },
        });

        if (lockResult.count === 0) {
          throw new SeatUnavailableError();
        }

        return tx.booking.create({
          data: {
            eventId,
            eventSeatId,
            userName,
            userPhone,
            caseType: CaseType.ONLINE_CODE,
            status: BookingStatus.PENDING,
            referenceCode,
            expiresAt,
          },
        });
      });
    } catch (error) {
      if (!isUniqueReferenceCodeError(error) || attempt === 4) {
        throw error;
      }
    }
  }
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
