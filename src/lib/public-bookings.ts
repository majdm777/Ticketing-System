import { BookingStatus, EventStatus, type CaseType } from '@prisma/client';

import { prisma } from './prisma';
import { expirePastDuePendingBookings } from './seat-locking';

export type PublicBooking = {
  id: string;
  status: BookingStatus;
  caseType: CaseType;
  referenceCode: string | null;
  event: {
    id: string;
    name: string;
    startsAt: Date;
    status: EventStatus;
    slug: string;
    venue: { name: string; address: string };
  };
  seat: {
    row: string;
    number: string;
    section: string | null;
    price: number | null;
  };
};

export type PublicBookingLookup =
  | { outcome: 'not_found' }
  | { outcome: 'found'; booking: PublicBooking };

// Same visibility contract as the event page (Shared Convention #9 / Task B2):
// an unknown slug and a never-published (DRAFT) event are the same identical
// not_found — the app never reveals that an unpublished event exists. Events
// that were published and are now CLOSED/CANCELED/finished still render, since
// attendees may be checking a booking on an event that has since ended. The
// booking must belong to the event at [slug]; an unknown id or one belonging
// to a different event is the same not_found. Runs the per-event expiry sweep
// first so a past-due PENDING hold shows as EXPIRED here, matching what the
// event page shows.
export async function getPublicBooking({
  slug,
  bookingId,
}: {
  slug: string;
  bookingId: string;
}): Promise<PublicBookingLookup> {
  const event = await prisma.event.findUnique({
    where: { slug },
    select: { id: true, status: true },
  });

  if (!event || event.status === EventStatus.DRAFT) {
    return { outcome: 'not_found' };
  }

  await expirePastDuePendingBookings(event.id);

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, eventId: event.id },
    select: {
      id: true,
      status: true,
      caseType: true,
      referenceCode: true,
      event: {
        select: {
          id: true,
          name: true,
          startsAt: true,
          status: true,
          slug: true,
          venue: { select: { name: true, address: true } },
        },
      },
      eventSeat: {
        select: {
          venueSeat: {
            select: {
              row: true,
              number: true,
              section: { select: { name: true, price: true } },
            },
          },
        },
      },
    },
  });

  if (!booking) {
    return { outcome: 'not_found' };
  }

  return {
    outcome: 'found',
    booking: {
      id: booking.id,
      status: booking.status,
      caseType: booking.caseType,
      referenceCode: booking.referenceCode,
      event: booking.event,
      seat: {
        row: booking.eventSeat.venueSeat.row,
        number: booking.eventSeat.venueSeat.number,
        section: booking.eventSeat.venueSeat.section?.name ?? null,
        price: booking.eventSeat.venueSeat.section?.price ?? null,
      },
    },
  };
}
