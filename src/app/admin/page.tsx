import { BookingStatus, SeatStatus, type EventStatus } from '@prisma/client';
import Link from 'next/link';

import { prisma } from '@/lib/prisma';

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

const statusStyles: Record<EventStatus, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-600',
  PUBLISHED: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-zinc-200 text-zinc-500',
  CANCELED: 'bg-red-100 text-red-700',
};

export default async function AdminDashboardPage() {
  const events = await prisma.event.findMany({
    orderBy: { startsAt: 'desc' },
    include: { venue: true },
  });

  const seatGroups = await prisma.eventSeat.groupBy({
    by: ['eventId', 'status'],
    _count: { _all: true },
  });

  const pendingBookingGroups = await prisma.booking.groupBy({
    by: ['eventId'],
    where: { status: BookingStatus.PENDING },
    _count: { _all: true },
  });

  const pendingBookingsByEvent = new Map(
    pendingBookingGroups.map((group) => [group.eventId, group._count._all]),
  );

  const seatCountsByEvent = new Map<string, Partial<Record<SeatStatus, number>>>();
  for (const group of seatGroups) {
    const counts = seatCountsByEvent.get(group.eventId) ?? {};
    counts[group.status] = group._count._all;
    seatCountsByEvent.set(group.eventId, counts);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-base leading-6 text-zinc-600">
            Overview of events, seat availability, and bookings needing action.
          </p>
        </div>
      </div>

      {events.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-white p-6 text-base leading-6 text-zinc-600">
          No events yet. Create an event to start selling tickets.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {events.map((event) => {
            const seatCounts = seatCountsByEvent.get(event.id) ?? {};
            const totalSeats = Object.values(seatCounts).reduce((sum, count) => sum + count, 0);
            const available = seatCounts[SeatStatus.AVAILABLE] ?? 0;
            const pending = seatCounts[SeatStatus.PENDING] ?? 0;
            const booked = seatCounts[SeatStatus.BOOKED] ?? 0;
            const toAction = pendingBookingsByEvent.get(event.id) ?? 0;

            const stats = [
              { label: 'Seats', value: totalSeats },
              { label: 'Available', value: available },
              { label: 'Pending', value: pending },
              { label: 'Booked', value: booked },
              { label: 'To action', value: toAction },
            ];

            return (
              <article
                key={event.id}
                className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4 sm:p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <h2 className="font-semibold tracking-tight">{event.name}</h2>
                    <p className="text-sm leading-6 text-zinc-600">
                      {event.venue.name} · {formatDate(event.startsAt)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${statusStyles[event.status]}`}
                  >
                    {event.status}
                  </span>
                </div>

                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-md border border-zinc-200 px-3 py-2"
                    >
                      <dt className="text-xs uppercase tracking-wide text-zinc-500">{stat.label}</dt>
                      <dd className="text-lg font-semibold text-zinc-900">{stat.value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-auto flex flex-col gap-2 sm:flex-row">
                  <Link
                    href={`/admin/bookings?eventId=${event.id}`}
                    className="w-full rounded-md bg-zinc-950 px-4 py-3 text-center text-sm font-medium text-white sm:w-auto"
                  >
                    View bookings
                  </Link>
                  <Link
                    href={`/admin/bookings/new?eventId=${event.id}`}
                    className="w-full rounded-md border border-zinc-300 px-4 py-3 text-center text-sm font-medium text-zinc-700 sm:w-auto"
                  >
                    Guest booking
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
