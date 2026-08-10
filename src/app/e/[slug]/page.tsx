import { notFound } from 'next/navigation';

import { formatDate } from '@/lib/format';
import { getPublicEventBySlug } from '@/lib/public-events';

import { BookingFlow } from './booking-flow';

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const lookup = await getPublicEventBySlug(slug);

  if (lookup.outcome === 'not_found') {
    notFound();
  }

  if (lookup.outcome === 'ended') {
    const { event } = lookup;
    return (
      <main className="w-full flex-1">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
          <header className="space-y-2">
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
              {event.name}
            </h1>
            <p className="text-base text-zinc-600">
              {formatDate(event.startsAt)}
              <span aria-hidden="true"> · </span>
              {event.venue.name}
              {event.venue.address ? ` — ${event.venue.address}` : ''}
            </p>
          </header>

          {event.description ? (
            <p className="mt-4 whitespace-pre-line text-base leading-7 text-zinc-700">
              {event.description}
            </p>
          ) : null}

          <section className="mt-8">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6">
              <h2 className="text-lg font-semibold">
                {event.endedReason === 'canceled'
                  ? 'This event was canceled'
                  : 'This event has ended'}
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                {event.endedReason === 'canceled'
                  ? 'You can no longer request seats for this event.'
                  : 'Seats are no longer available for this event.'}
              </p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const { event } = lookup;

  return (
    <main className="w-full flex-1">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{event.name}</h1>
          <p className="text-base text-zinc-600">
            {formatDate(event.startsAt)}
            <span aria-hidden="true"> · </span>
            {event.venue.name}
            {event.venue.address ? ` — ${event.venue.address}` : ''}
          </p>
        </header>

        {event.description ? (
          <p className="mt-4 whitespace-pre-line text-base leading-7 text-zinc-700">
            {event.description}
          </p>
        ) : null}

        <section className="mt-8 space-y-4">
          {/* keyed by event so the selection resets when navigating between events */}
          <BookingFlow
            key={event.id}
            slug={slug}
            eventId={event.id}
            seatGroups={event.seatGroups}
            gapSeats={event.gapSeats}
          />
        </section>
      </div>
    </main>
  );
}
