import { BookingStatus, EventStatus, SeatStatus } from '@prisma/client';

import { prisma } from './prisma';

export type EventWithStats = {
  id: string;
  name: string;
  description: string | null;
  startsAt: Date;
  status: EventStatus;
  slug: string;
  venue: { id: string; name: string };
  totalSeats: number;
  available: number;
  pending: number;
  booked: number;
  revenue: number;
  isFinished: boolean;
};

export async function getEventsWithStats(): Promise<EventWithStats[]> {
  const events = await prisma.event.findMany({
    orderBy: { startsAt: 'desc' },
    include: { venue: { select: { id: true, name: true } } },
  });

  const seatCountGroups = await prisma.eventSeat.groupBy({
    by: ['eventId', 'status'],
    _count: { _all: true },
  });

  const confirmedBookings = await prisma.booking.findMany({
    where: { status: BookingStatus.CONFIRMED },
    select: {
      eventId: true,
      eventSeat: {
        select: {
          venueSeat: {
            select: { section: { select: { price: true } } },
          },
        },
      },
    },
  });

  const seatCountsByEvent = new Map<string, Partial<Record<SeatStatus, number>>>();
  for (const group of seatCountGroups) {
    const counts = seatCountsByEvent.get(group.eventId) ?? {};
    counts[group.status] = group._count._all;
    seatCountsByEvent.set(group.eventId, counts);
  }

  const revenueByEvent = new Map<string, number>();
  for (const booking of confirmedBookings) {
    const current = revenueByEvent.get(booking.eventId) ?? 0;
    revenueByEvent.set(
      booking.eventId,
      current + booking.eventSeat.venueSeat.section.price,
    );
  }

  const now = new Date();

  return events.map((event) => {
    const counts = seatCountsByEvent.get(event.id) ?? {};
    const totalSeats = Object.values(counts).reduce((sum, count) => sum + count, 0);

    return {
      id: event.id,
      name: event.name,
      description: event.description,
      startsAt: event.startsAt,
      status: event.status,
      slug: event.slug,
      venue: event.venue,
      totalSeats,
      available: counts[SeatStatus.AVAILABLE] ?? 0,
      pending: counts[SeatStatus.PENDING] ?? 0,
      booked: counts[SeatStatus.BOOKED] ?? 0,
      revenue: revenueByEvent.get(event.id) ?? 0,
      isFinished: event.status === EventStatus.CLOSED || event.startsAt <= now,
    };
  });
}
