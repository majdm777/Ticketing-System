import Link from 'next/link';

import { prisma } from '@/lib/prisma';
import { VenueDeleteButton } from './venue-delete-button';

async function getVenues() {
  const venues = await prisma.venue.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      seats: {
        select: { section: true },
      },
    },
  });

  return venues.map((venue) => {
    const sectionNames = new Set(venue.seats.map((s) => s.section).filter(Boolean));
    return {
      id: venue.id,
      name: venue.name,
      address: venue.address,
      capacity: venue.seats.length,
      sectionCount: sectionNames.size,
    };
  });
}

export default async function VenuesPage() {
  const venues = await getVenues();

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Venues</h1>
          <p className="text-gray-600 mt-1">Manage venue locations and seat layouts.</p>
        </div>
        <Link
          href="/admin/venues/new"
          className="bg-black text-white px-4 py-2 rounded-md font-medium hover:bg-gray-800"
        >
          + Add Venue
        </Link>
      </div>

      {venues.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          No venues yet. Add your first one to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {venues.map((venue) => (
            <div key={venue.id} className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-lg font-bold">{venue.name}</h2>
              </div>
              <p className="text-gray-600 text-sm mb-4">{venue.address}</p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="border border-gray-200 rounded-md p-3">
                  <div className="text-xs uppercase text-gray-500 tracking-wide">Capacity</div>
                  <div className="text-xl font-bold">{venue.capacity}</div>
                </div>
                <div className="border border-gray-200 rounded-md p-3">
                  <div className="text-xs uppercase text-gray-500 tracking-wide">Sections</div>
                  <div className="text-xl font-bold">{venue.sectionCount}</div>
                </div>
              </div>

            <div className="flex gap-2">
                <Link
                  href={`/admin/venues/${venue.id}/edit`}
                  className="inline-block border border-gray-300 px-4 py-2 rounded-md font-medium text-sm hover:bg-gray-50"
                >
                  Edit
                </Link>
                <VenueDeleteButton venueId={venue.id} venueName={venue.name} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}