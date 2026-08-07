import { BookingStatus, EventStatus, Prisma, SeatStatus } from '@prisma/client';

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

  const eventIds = events.map((event) => event.id);

  const seatCountGroups = await prisma.eventSeat.groupBy({
    by: ['eventId', 'status'],
    where: eventIds.length > 0 ? { eventId: { in: eventIds } } : undefined,
    _count: { _all: true },
  });

  const revenueGroups =
    eventIds.length === 0
      ? []
      : await prisma.$queryRaw<{ eventId: string; revenue: number }[]>(
          Prisma.sql`
            SELECT b."eventId" AS "eventId", COALESCE(SUM(s."price"), 0)::int AS "revenue"
            FROM "Booking" b
            JOIN "EventSeat" es ON es."id" = b."eventSeatId" AND es."eventId" = b."eventId"
            JOIN "VenueSeat" vse ON vse."id" = es."venueSeatId" AND vse."venueId" = es."venueId"
            JOIN "VenueSection" s ON s."id" = vse."sectionId" AND s."venueId" = vse."venueId"
            WHERE b."status" = ${BookingStatus.CONFIRMED}::"BookingStatus" AND b."eventId" IN (${Prisma.join(eventIds)})
            GROUP BY b."eventId"
          `,
        );

  const seatCountsByEvent = new Map<string, Partial<Record<SeatStatus, number>>>();
  for (const group of seatCountGroups) {
    const counts = seatCountsByEvent.get(group.eventId) ?? {};
    counts[group.status] = group._count._all;
    seatCountsByEvent.set(group.eventId, counts);
  }

  const revenueByEvent = new Map<string, number>();
  for (const group of revenueGroups) {
    revenueByEvent.set(group.eventId, group.revenue);
  }

  const now = new Date();

  return events.map((event) => {
    const counts = seatCountsByEvent.get(event.id) ?? {};
    const totalSeats =
      Object.values(counts).reduce((sum, count) => sum + count, 0) -
      (counts[SeatStatus.GAP] ?? 0);

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
