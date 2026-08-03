import { prisma } from './prisma';
import { CaseType, SeatStatus, BookingStatus } from '@prisma/client';
import { generateReferenceCode } from './tickets';

export class SeatUnavailableError extends Error {
  constructor() {
    super('Seat is no longer available');
    this.name = 'SeatUnavailableError';
  }
}

function getOnlineExpiryHours(): number {
  return Number(process.env.PENDING_ONLINE_EXPIRY_HOURS ?? 3);
}

export async function requestSeatOnlineCode(params: {
  eventId: string;
  eventSeatId: string;
  userName: string;
  userPhone: string;
}) {
  const { eventId, eventSeatId, userName, userPhone } = params;
  const expiresAt = new Date(Date.now() + getOnlineExpiryHours() * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
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
        pendingSince: new Date(),
        expiresAt,
      },
    });

    if (lockResult.count === 0) {
      throw new SeatUnavailableError();
    }

    const referenceCode = generateReferenceCode();

    await tx.eventSeat.update({
      where: { id: eventSeatId },
      data: { referenceCode },
    });

    const booking = await tx.booking.create({
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

    return booking;
  });
}

export async function confirmOnlineCodeBooking(params: {
  bookingId: string;
  adminName: string;
}) {
  const { bookingId, adminName } = params;

  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { eventSeat: true },
    });

    if (!booking) {
      throw new Error('Booking not found');
    }
    if (booking.status !== BookingStatus.PENDING) {
      throw new Error(`Booking is not pending (current status: ${booking.status})`);
    }
    if (booking.eventSeat.expiresAt && booking.eventSeat.expiresAt < new Date()) {
      throw new SeatUnavailableError();
    }

    const updateResult = await tx.booking.updateMany({
      where: { id: bookingId, status: BookingStatus.PENDING },
      data: {
        status: BookingStatus.CONFIRMED,
        confirmedByAdmin: adminName,
        confirmedAt: new Date(),
        ticketNote: 'paid',
      },
    });

    if (updateResult.count === 0) {
      throw new Error('Booking was already processed');
    }

    await tx.eventSeat.update({
      where: { id: booking.eventSeatId },
      data: {
        status: SeatStatus.BOOKED,
        expiresAt: null,
        pendingSince: null,
      },
    });

    return tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  });
}

export async function expireBookingIfPastDue(bookingId: string) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();

    const result = await tx.booking.updateMany({
      where: {
        id: bookingId,
        status: BookingStatus.PENDING,
        expiresAt: { lt: now },
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
