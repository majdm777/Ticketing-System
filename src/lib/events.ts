import { BookingStatus, CaseType, EventStatus, Prisma, SeatStatus } from '@prisma/client';

import { prisma } from './prisma';

// Bookable capacity = every seat minus the gap seats. Gap seats only exist to
// block out positions on the seat map and can never be booked, so they are
// excluded from the total (admin dashboard uses the same helper).
export function countBookableSeats(counts: Partial<Record<SeatStatus, number>>): number {
  return (
    Object.values(counts).reduce((sum, count) => sum + count, 0) -
    (counts[SeatStatus.GAP] ?? 0)
  );
}

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
            WHERE b."status" = ${BookingStatus.CONFIRMED}::"BookingStatus" AND b."eventId" IN (${Prisma.join(eventIds)}) AND b."caseType" = ${CaseType.ONLINE_CODE}::"CaseType"
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
    // Revenue counts confirmed ONLINE_CODE bookings only. GUEST bookings are
    // placed directly by an admin (often comped) and PAY_AT_DOOR isn't matched
    // to an in-app payment, so both are deliberately excluded.
    const totalSeats = countBookableSeats(counts);

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

export type DashboardStats = {
  revenue: number;
  confirmedTickets: number;
  pendingHolds: number;
  bookableSeats: number;
  bookedSeats: number;
  pendingSeats: number;
};

// Cross-event aggregates for the admin dashboard. Revenue uses the same rule
// as getEventsWithStats: confirmed ONLINE_CODE bookings only (GUEST bookings
// are placed directly by an admin and PAY_AT_DOOR isn't matched to an in-app
// payment, so both are excluded). Gap seats never count as bookable capacity.
export async function getDashboardStats(): Promise<DashboardStats> {
  const [revenueRows, confirmedTickets, pendingHolds, seatGroups] =
    await Promise.all([
      prisma.$queryRaw<{ revenue: number }[]>(Prisma.sql`
        SELECT COALESCE(SUM(s."price"), 0)::int AS "revenue"
        FROM "Booking" b
        JOIN "EventSeat" es ON es."id" = b."eventSeatId" AND es."eventId" = b."eventId"
        JOIN "VenueSeat" vse ON vse."id" = es."venueSeatId" AND vse."venueId" = es."venueId"
        JOIN "VenueSection" s ON s."id" = vse."sectionId" AND s."venueId" = vse."venueId"
        WHERE b."status" = ${BookingStatus.CONFIRMED}::"BookingStatus" AND b."caseType" = ${CaseType.ONLINE_CODE}::"CaseType"
      `),
      prisma.booking.count({ where: { status: BookingStatus.CONFIRMED } }),
      prisma.booking.count({ where: { status: BookingStatus.PENDING } }),
      prisma.eventSeat.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

  const counts: Partial<Record<SeatStatus, number>> = {};
  for (const group of seatGroups) {
    counts[group.status] = group._count._all;
  }

  return {
    revenue: revenueRows[0]?.revenue ?? 0,
    confirmedTickets,
    pendingHolds,
    bookableSeats: countBookableSeats(counts),
    bookedSeats: counts[SeatStatus.BOOKED] ?? 0,
    pendingSeats: counts[SeatStatus.PENDING] ?? 0,
  };
}
