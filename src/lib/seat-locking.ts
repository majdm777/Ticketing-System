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
  venueSeatId: string;
  userName: string;
  userPhone: string;
  adminId: string;
}): Promise<ActionResult<{ bookingId: string }>> {
  const { eventId, venueSeatId, userName, userPhone, adminId } = params;

  try {
    return await prisma.$transaction(async (tx) => {
      const event = await tx.event.findUnique({
        where: { id: eventId },
        select: { status: true },
      });
      if (!event || event.status === EventStatus.CANCELED) {
        return { ok: false, error: 'Guest booking is unavailable for canceled events.' };
      }

      const seatResult = await tx.eventSeat.updateMany({
        where: {
          eventId,
          venueSeatId,
          status: SeatStatus.AVAILABLE,
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

      if (seatResult.count === 0) {
        return { ok: false, error: 'Seat is no longer available.' };
      }

      const eventSeat = await tx.eventSeat.findUniqueOrThrow({
        where: { eventId_venueSeatId: { eventId, venueSeatId } },
        select: { id: true },
      });

      const booking = await tx.booking.create({
        data: {
          eventId,
          eventSeatId: eventSeat.id,
          userName,
          userPhone,
          caseType: CaseType.GUEST,
          status: BookingStatus.CONFIRMED,
          confirmedByAdmin: adminId,
          confirmedAt: new Date(),
        },
        select: { id: true },
      });

      return { ok: true, bookingId: booking.id };
    });
  } catch {
    return { ok: false, error: 'Could not create guest booking.' };
  }
}

export async function expireBookingIfPastDue(bookingId: string) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.booking.updateMany({
      where: {
        id: bookingId,
        status: BookingStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
      data: {
        status: BookingStatus.EXPIRED,
      },
    });

    if (result.count === 0) {
      return false;
    }

    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });

    await tx.eventSeat.updateMany({
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

    return true;
  });
}
