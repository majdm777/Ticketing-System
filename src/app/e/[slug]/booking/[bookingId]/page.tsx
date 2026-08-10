import { BookingStatus, CaseType, EventStatus } from '@prisma/client';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { formatUsd } from '@/lib/currency';
import { formatDate } from '@/lib/format';
import { getPublicBooking, type PublicBooking } from '@/lib/public-bookings';

function StatusCard({
  booking,
  slug,
}: {
  booking: PublicBooking;
  slug: string;
}) {
  const eventLive =
    booking.event.status === EventStatus.PUBLISHED &&
    booking.event.startsAt > new Date();

  if (
    booking.status === BookingStatus.PENDING &&
    booking.caseType === CaseType.ONLINE_CODE
  ) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-950">
          Waiting for your payment
        </h2>

        {booking.referenceCode ? (
          <div className="mt-4 rounded-lg border border-zinc-950 bg-zinc-950 p-4 text-center">
            <p className="text-sm text-zinc-200">
              Pay the organizer {formatUsd(booking.seat.price ?? 0)} and use
              this code as your payment note:
            </p>
            <p className="mt-2 font-mono text-3xl font-bold tracking-widest text-white">
              {booking.referenceCode}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-base leading-6 text-zinc-700">
            We are waiting for your payment.
          </p>
        )}

        <p className="mt-4 text-base leading-6 text-zinc-700">
          Once your payment is confirmed, refresh this page to see the update.
        </p>
      </section>
    );
  }

  if (booking.status === BookingStatus.PENDING) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-950">
          Your seat is being held
        </h2>
        <p className="mt-2 text-base leading-6 text-zinc-700">
          We are holding your seat for you. Pay at the door when you arrive.
        </p>
      </section>
    );
  }

  if (booking.status === BookingStatus.CONFIRMED) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-950">
          Your seat is confirmed
        </h2>
        <p className="mt-2 text-base leading-6 text-zinc-700">
          See you at the event!
        </p>
      </section>
    );
  }

  // CANCELLED / EXPIRED — the hold is gone. Link back to the event page so the
  // attendee can request the seat again if it is still available.
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-zinc-950">
        {booking.status === BookingStatus.EXPIRED
          ? 'This hold has expired'
          : 'This booking was cancelled'}
      </h2>
      <p className="mt-2 text-base leading-6 text-zinc-700">
        Your seat is no longer held for you.
      </p>
      {eventLive ? (
        <Link
          href={`/e/${slug}`}
          className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-zinc-950 px-4 py-3 text-base font-medium text-white sm:w-auto"
        >
          Request your seat again
        </Link>
      ) : (
        <Link
          href={`/e/${slug}`}
          className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-zinc-300 px-4 py-3 text-base font-medium text-zinc-950 sm:w-auto"
        >
          Back to the event page
        </Link>
      )}
    </section>
  );
}

export default async function BookingStatusPage({
  params,
}: {
  params: Promise<{ slug: string; bookingId: string }>;
}) {
  const { slug, bookingId } = await params;

  const lookup = await getPublicBooking({ slug, bookingId });

  if (lookup.outcome === 'not_found') {
    notFound();
  }

  const { booking } = lookup;
  const { event, seat } = booking;

  return (
    <main className="w-full flex-1">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
            Booking status
          </h1>
          <p className="text-base text-zinc-600">
            {event.name}
            <span aria-hidden="true"> · </span>
            {formatDate(event.startsAt)}
          </p>
        </header>

        <div className="mt-6 space-y-4">
          <StatusCard booking={booking} slug={slug} />

          <section className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-zinc-950">
              Your booking
            </h2>
            <dl className="mt-3 space-y-3 text-base">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-zinc-600">Seat</dt>
                <dd className="text-right font-medium text-zinc-950">
                  {seat.section ? `${seat.section} · ` : ''}row {seat.row},
                  seat {seat.number}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-zinc-600">Price</dt>
                <dd className="font-medium text-zinc-950">
                  {formatUsd(seat.price ?? 0)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-zinc-600">Date</dt>
                <dd className="text-right font-medium text-zinc-950">
                  {formatDate(event.startsAt)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-zinc-600">Venue</dt>
                <dd className="text-right font-medium text-zinc-950">
                  {event.venue.name}
                </dd>
              </div>
            </dl>
            {event.venue.address ? (
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                {event.venue.address}
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
