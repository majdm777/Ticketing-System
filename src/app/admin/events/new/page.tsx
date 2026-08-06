import Link from 'next/link';

import { prisma } from '@/lib/prisma';

import { EventForm } from './event-form';

async function getVenues() {
  const venues = await prisma.venue.findMany({
    orderBy: { name: 'asc' },
    include: {
      sections: { select: { name: true, price: true } },
      _count: { select: { seats: true } },
    },
  });

  return venues.map((venue) => ({
    id: venue.id,
    name: venue.name,
    address: venue.address,
    capacity: venue._count.seats,
    sections: venue.sections.map((s) => ({ name: s.name, price: s.price })),
  }));
}

export default async function NewEventPage() {
  const venues = await getVenues();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create Event</h1>
        <p className="max-w-xl text-base leading-6 text-zinc-600">
          New events are created as drafts, then published from the events page.
        </p>
      </div>

      {venues.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center">
          <p className="text-base leading-6 text-zinc-600">
            No venues yet. Add your first venue to start creating events.
          </p>
          <Link
            href="/admin/venues/new"
            className="mt-4 inline-flex h-11 items-center justify-center rounded-md bg-zinc-950 px-6 text-sm font-medium text-white"
          >
            + Add a venue
          </Link>
        </div>
      ) : (
        <EventForm venues={venues} />
      )}
    </div>
  );
}
