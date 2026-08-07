import Link from 'next/link';
import { EventStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { expirePastDuePendingBookings } from '@/lib/seat-locking';

import { GuestBookingForm } from './guest-booking-form';

export default async function NewGuestBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string | string[] }>;
}) {
  const { eventId: rawEventId } = await searchParams;
  const eventId = typeof rawEventId === 'string' ? rawEventId : '';
  const event = eventId
    ? await prisma.event.findUnique({
        where: { id: eventId },
        include: { venue: true },
      })
    : null;

  if (event) {
    await expirePastDuePendingBookings(event.id);
  }

  const seats = event
    ? await prisma.eventSeat.findMany({
        where: { eventId: event.id },
        include: { venueSeat: { include: { section: true } } },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  const flatSeats = seats.map((seat) => ({
    id: seat.id,
    venueSeatId: seat.venueSeatId,
    row: seat.venueSeat.row,
    number: seat.venueSeat.number,
    section: seat.venueSeat.section?.name ?? '',
    status: seat.status,
  }));

  const sections = Array.from(
    seats.reduce((map, seat) => {
      if (!seat.venueSeat.section) return map;
      if (!map.has(seat.venueSeat.section.name)) {
        map.set(seat.venueSeat.section.name, seat.venueSeat.section.price);
      }
      return map;
    }, new Map<string, number>()),
  ).map(([name, price]) => ({ name, price }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Guest booking</h1>
          <p className="max-w-xl text-base leading-6 text-zinc-600">
            Create an already-confirmed guest booking for an available seat.
          </p>
        </div>
        {event ? (
          <Link
            href={`/admin/bookings?eventId=${event.id}`}
            className="inline-flex w-full items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-700 sm:w-auto"
          >
            Back to bookings
          </Link>
        ) : null}
      </div>

      {event ? (
        event.status === EventStatus.CANCELED ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
            &quot;{event.name}&quot; was canceled, so guest booking is unavailable.
          </p>
        ) : (
          <>
            <section className="rounded-lg border border-zinc-200 bg-white p-4 sm:p-5">
              <h2 className="font-semibold tracking-tight">{event.name}</h2>
              <p className="text-sm leading-6 text-zinc-600">{event.venue.name}</p>
            </section>
            <GuestBookingForm eventId={event.id} seats={flatSeats} sections={sections} />
          </>
        )
      ) : (
        <p className="rounded-lg border border-zinc-200 bg-white p-6 text-base leading-6 text-zinc-600">
          Open guest booking from a selected event on the bookings page.
        </p>
      )}
    </div>
  );
}
