import { BookingStatus } from '@prisma/client';
import Link from 'next/link';

import { prisma } from '@/lib/prisma';

import { PendingBookingActions } from './pending-booking-actions';

const statusOptions = ['all', ...Object.values(BookingStatus)] as const;

function formatDate(date: Date | null) {
  return date
    ? new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
    : '-';
}

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string | string[]; status?: string | string[] }>;
}) {
  const params = await searchParams;
  const eventId = typeof params.eventId === 'string' ? params.eventId : '';
  const selectedStatus =
    typeof params.status === 'string' &&
    statusOptions.includes(params.status as (typeof statusOptions)[number])
      ? params.status
      : 'all';

  const events = await prisma.event.findMany({
    orderBy: { startsAt: 'desc' },
    include: { venue: true },
  });

  const event = eventId
    ? await prisma.event.findUnique({
        where: { id: eventId },
        include: { venue: true },
      })
    : null;

  const bookings = event
    ? await prisma.booking.findMany({
        where: {
          eventId: event.id,
          ...(selectedStatus !== 'all' ? { status: selectedStatus as BookingStatus } : {}),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          eventSeat: {
            include: { venueSeat: true },
          },
        },
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
          <p className="max-w-xl text-base leading-6 text-zinc-600">
            Confirm paid bookings, cancel pending holds, and review booking history.
          </p>
        </div>

        {event ? (
          <Link
            href={`/admin/bookings/new?eventId=${event.id}`}
            className="inline-flex w-full items-center justify-center rounded-md bg-zinc-950 px-4 py-3 text-sm font-medium text-white sm:w-auto"
          >
            Guest booking
          </Link>
        ) : null}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase text-zinc-500">Event</h2>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {events.map((item) => (
            <Link
              key={item.id}
              href={`/admin/bookings?eventId=${item.id}`}
              className={`inline-flex h-11 items-center whitespace-nowrap rounded-md border px-3 text-sm ${
                item.id === eventId
                  ? 'border-zinc-950 bg-white text-zinc-950'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:text-zinc-950'
              }`}
            >
              {item.name}
            </Link>
          ))}
        </div>
      </section>

      {event ? (
        <>
          <section className="rounded-lg border border-zinc-200 bg-white p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <h2 className="font-semibold tracking-tight">{event.name}</h2>
                <p className="text-sm leading-6 text-zinc-600">
                  {event.venue.name} · {formatDate(event.startsAt)}
                </p>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:pb-0">
                {statusOptions.map((status) => (
                  <Link
                    key={status}
                    href={`/admin/bookings?eventId=${event.id}&status=${status}`}
                    className={`inline-flex h-11 items-center whitespace-nowrap rounded-md border px-3 text-sm ${
                      selectedStatus === status
                        ? 'border-zinc-950 bg-zinc-950 text-white'
                        : 'border-zinc-200 text-zinc-600 hover:text-zinc-950'
                    }`}
                  >
                    {status === 'all' ? 'All' : status}
                  </Link>
                ))}
              </div>
            </div>
          </section>

          <div className="space-y-3 md:hidden">
            {bookings.map((booking) => (
              <article key={booking.id} className="rounded-lg border border-zinc-200 bg-white p-4">
                <div className="space-y-3">
                  <div>
                    <div className="font-medium">{booking.userName}</div>
                    <div className="text-sm text-zinc-600">{booking.userPhone}</div>
                  </div>

                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs uppercase text-zinc-500">Seat</dt>
                      <dd className="text-zinc-700">
                        {booking.eventSeat.venueSeat.section} {booking.eventSeat.venueSeat.row}
                        {booking.eventSeat.venueSeat.number}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-zinc-500">Case</dt>
                      <dd>{booking.caseType}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-zinc-500">Status</dt>
                      <dd>{booking.status}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-zinc-500">Reference</dt>
                      <dd className="font-mono">{booking.referenceCode ?? '-'}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs uppercase text-zinc-500">Confirmed</dt>
                      <dd className="text-zinc-700">
                        <div>{booking.confirmedByAdmin ?? '-'}</div>
                        <div>{formatDate(booking.confirmedAt)}</div>
                      </dd>
                    </div>
                  </dl>

                  <div>
                    {booking.status === BookingStatus.PENDING ? (
                      <PendingBookingActions bookingId={booking.id} />
                    ) : (
                      <span className="text-sm text-zinc-500">No actions available.</span>
                    )}
                  </div>
                </div>
              </article>
            ))}

            {bookings.length === 0 ? (
              <p className="rounded-lg border border-zinc-100 bg-white px-4 py-8 text-center text-base text-zinc-500">
                No bookings match this view.
              </p>
            ) : null}
          </div>

          <div className="hidden overflow-hidden rounded-lg border border-zinc-200 bg-white md:block">
            <table className="w-full min-w-225 text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Attendee</th>
                  <th className="px-4 py-3">Seat</th>
                  <th className="px-4 py-3">Case</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Confirmed</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {bookings.map((booking) => (
                  <tr key={booking.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{booking.userName}</div>
                      <div className="text-zinc-600">{booking.userPhone}</div>
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {booking.eventSeat.venueSeat.section} {booking.eventSeat.venueSeat.row}
                      {booking.eventSeat.venueSeat.number}
                    </td>
                    <td className="px-4 py-3">{booking.caseType}</td>
                    <td className="px-4 py-3">{booking.status}</td>
                    <td className="px-4 py-3 font-mono">{booking.referenceCode ?? '-'}</td>
                    <td className="px-4 py-3 text-zinc-700">
                      <div>{booking.confirmedByAdmin ?? '-'}</div>
                      <div>{formatDate(booking.confirmedAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      {booking.status === BookingStatus.PENDING ? (
                        <PendingBookingActions bookingId={booking.id} />
                      ) : (
                        <span className="text-zinc-500">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {bookings.length === 0 ? (
              <p className="border-t border-zinc-100 px-4 py-8 text-center text-base text-zinc-500">
                No bookings match this view.
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <p className="rounded-lg border border-zinc-200 bg-white p-6 text-base leading-6 text-zinc-600">
          Pick an event to review its bookings.
        </p>
      )}
    </div>
  );
}
