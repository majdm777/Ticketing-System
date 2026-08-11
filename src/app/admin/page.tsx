import { BookingStatus, EventStatus, SeatStatus } from '@prisma/client';
import Link from 'next/link';

import { requestGroupKey, seatLabel } from '@/lib/booking-groups';
import { formatPrice, formatUsd } from '@/lib/currency';
import { countBookableSeats, getDashboardStats } from '@/lib/events';
import { formatDate } from '@/lib/format';
import { prisma } from '@/lib/prisma';
import { expirePastDuePendingBookings } from '@/lib/seat-locking';

import { PendingRequestActions } from './bookings/pending-request-actions';

const statusStyles: Record<EventStatus, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-600',
  PUBLISHED: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-zinc-200 text-zinc-500',
  CANCELED: 'bg-red-100 text-red-700',
};

function OccupancyBar({ occupied, total }: { occupied: number; total: number }) {
  const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-zinc-200">
        <div
          className="h-full rounded-full bg-zinc-900"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm text-zinc-600">
        {occupied} of {total} occupied
      </span>
    </div>
  );
}

export default async function AdminDashboardPage() {
  await expirePastDuePendingBookings();

  const now = new Date();

  const events = await prisma.event.findMany({
    where: { status: EventStatus.PUBLISHED },
    orderBy: { startsAt: 'desc' },
    include: { venue: true },
  });

  const eventIds = events.map((event) => event.id);

  const [stats, seatGroups, pendingBookingGroups, pendingBookings] = await Promise.all([
    getDashboardStats(eventIds),
    prisma.eventSeat.groupBy({
      by: ['eventId', 'status'],
      where: { eventId: { in: eventIds } },
      _count: { _all: true },
    }),
    prisma.booking.groupBy({
      by: ['eventId'],
      where: {
        status: BookingStatus.PENDING,
        eventId: { in: eventIds },
      },
      _count: { _all: true },
    }),
    prisma.booking.findMany({
      where: { status: BookingStatus.PENDING, event: { status: EventStatus.PUBLISHED } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        event: { select: { id: true, name: true } },
        eventSeat: {
          include: {
            venueSeat: { include: { section: true } },
          },
        },
      },
    }),
  ]);

  const seatCountsByEvent = new Map<string, Partial<Record<SeatStatus, number>>>();
  for (const group of seatGroups) {
    const counts = seatCountsByEvent.get(group.eventId) ?? {};
    counts[group.status] = group._count._all;
    seatCountsByEvent.set(group.eventId, counts);
  }

  const pendingBookingsByEvent = new Map(
    pendingBookingGroups.map((group) => [group.eventId, group._count._all]),
  );

  // One row per attendee request, not per seat — the same grouping key the
  // bookings page uses, so a multi-seat hold is confirmed or cancelled once.
  const pendingRequestGroups = (() => {
    const byKey = new Map<string, (typeof pendingBookings)[number][]>();
    for (const booking of pendingBookings) {
      const key = requestGroupKey(booking);
      const members = byKey.get(key) ?? [];
      members.push(booking);
      byKey.set(key, members);
    }
    return Array.from(byKey.values()).map((members) => {
      members.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const rep = members[0];
      const totalUsd = members.reduce(
        (sum, member) => sum + (member.eventSeat.venueSeat.section?.price ?? 0),
        0,
      );
      return {
        key: requestGroupKey(rep),
        representativeBookingId: rep.id,
        attendeeName: rep.userName,
        attendeePhone: rep.userPhone,
        eventId: rep.event.id,
        eventName: rep.event.name,
        seatCount: members.length,
        seatLabels: members.map(seatLabel),
        totalUsd,
        createdAt: rep.createdAt,
        expiresAt: rep.expiresAt,
      };
    });
  })();

  const occupancyPct =
    stats.bookableSeats > 0
      ? Math.round(((stats.bookedSeats + stats.pendingSeats) / stats.bookableSeats) * 100)
      : 0;

  const summary = [
    { label: 'Revenue', value: formatPrice(stats.revenue) },
    { label: 'Confirmed', value: stats.confirmedTickets },
    { label: 'Pending holds', value: stats.pendingHolds },
    { label: 'Occupancy', value: `${occupancyPct}%` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-base leading-6 text-zinc-600">
            Revenue, pending holds needing action, and seat occupancy across your events.
          </p>
        </div>
      </div>

      {events.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-white p-6 text-base leading-6 text-zinc-600">
          No published events yet. Publish an event to see it here.
        </p>
      ) : (
        <>
          <section aria-label="Summary">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {summary.map((stat) => (
                <div key={stat.label} className="rounded-lg border border-zinc-200 bg-white p-4">
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">{stat.label}</dt>
                  <dd className="mt-1 text-xl font-semibold text-zinc-900 sm:text-2xl">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase text-zinc-500">Needs attention</h2>
            {pendingRequestGroups.length === 0 ? (
              <p className="rounded-lg border border-zinc-200 bg-white p-6 text-base leading-6 text-zinc-600">
                All caught up — no pending holds need action.
              </p>
            ) : (
              <ul className="space-y-3">
                {pendingRequestGroups.map((group) => (
                  <li
                    key={group.key}
                    className="rounded-lg border border-zinc-200 bg-white p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <div className="font-medium">
                          {group.attendeeName}
                          <span className="font-normal text-zinc-500">
                            {' '}
                            · {group.attendeePhone}
                          </span>
                        </div>
                        <p className="text-sm leading-6 text-zinc-600">
                          <Link
                            href={`/admin/bookings?eventId=${group.eventId}`}
                            className="font-medium text-zinc-900 hover:underline"
                          >
                            {group.eventName}
                          </Link>
                          <span aria-hidden="true"> · </span>
                          {group.seatCount} seat{group.seatCount === 1 ? '' : 's'} ·{' '}
                          {group.seatLabels.join(', ')}
                        </p>
                        <p className="text-sm font-medium text-zinc-900">
                          Total {formatUsd(group.totalUsd)}
                        </p>
                        <p className="text-xs text-zinc-500">
                          Held {formatDate(group.createdAt)}
                          {group.expiresAt
                            ? ` · expires ${formatDate(group.expiresAt)}`
                            : ''}
                        </p>
                      </div>
                      <PendingRequestActions bookingId={group.representativeBookingId} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase text-zinc-500">Events</h2>
            <div className="space-y-3">
              {events.map((event) => {
                const seatCounts = seatCountsByEvent.get(event.id) ?? {};
                const totalSeats = countBookableSeats(seatCounts);
                const occupied =
                  (seatCounts[SeatStatus.BOOKED] ?? 0) + (seatCounts[SeatStatus.PENDING] ?? 0);
                const pending = pendingBookingsByEvent.get(event.id) ?? 0;

                return (
                  <article key={event.id} className="rounded-lg border border-zinc-200 bg-white p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold tracking-tight">{event.name}</h3>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${statusStyles[event.status]}`}
                          >
                            {event.status}
                          </span>
                        </div>
                        <p className="text-sm leading-6 text-zinc-600">
                          {event.venue.name} · {formatDate(event.startsAt)}
                        </p>
                      </div>
                      {pending > 0 ? (
                        <Link
                          href={`/admin/bookings?eventId=${event.id}&status=PENDING`}
                          className="inline-flex h-11 w-fit items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700"
                        >
                          {pending} pending
                        </Link>
                      ) : null}
                    </div>

                    <div className="mt-3">
                      <OccupancyBar occupied={occupied} total={totalSeats} />
                    </div>

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <Link
                        href={`/admin/bookings?eventId=${event.id}`}
                        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white sm:w-auto"
                      >
                        View bookings
                      </Link>
                      {event.status === EventStatus.PUBLISHED && event.startsAt > now ? (
                        <Link
                          href={`/admin/bookings/new?eventId=${event.id}`}
                          className="inline-flex h-11 w-full items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 sm:w-auto"
                        >
                          Guest booking
                        </Link>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
