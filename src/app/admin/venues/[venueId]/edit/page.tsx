import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getVenueForEdit } from '@/lib/venues';

import { VenueBuilder } from '../../new/venue-builder';

export default async function EditVenuePage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;

  const venue = await getVenueForEdit(venueId);

  if (!venue) {
    notFound();
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-1">Edit Venue</h1>
      <p className="text-gray-600 mb-8">
        Update {venue.name} and its seating sections — seats are regenerated automatically.
      </p>

      {venue.hasUnsupportedLayout ? (
        <div>
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-700 rounded-md p-4 mb-4 text-sm"
          >
            This venue&apos;s layout isn&apos;t supported by the editor — some seats in different
            sections share the same row and seat number. Recreate the venue instead.
          </div>
          <Link
            href="/admin/venues"
            className="inline-flex items-center min-h-11 bg-black text-white px-4 py-2 rounded-md font-medium hover:bg-gray-800"
          >
            Back to venues
          </Link>
        </div>
      ) : venue.hasEvents ? (
        <div>
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-700 rounded-md p-4 mb-4 text-sm"
          >
            Can&apos;t edit this venue&apos;s layout — it has events using it. Remove those events
            first.
          </div>
          <Link
            href="/admin/venues"
            className="inline-flex items-center min-h-11 bg-black text-white px-4 py-2 rounded-md font-medium hover:bg-gray-800"
          >
            Back to venues
          </Link>
        </div>
      ) : (
        <VenueBuilder venueId={venue.id} initialData={venue.builderData} />
      )}
    </div>
  );
}
