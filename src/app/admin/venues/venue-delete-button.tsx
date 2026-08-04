'use client';

import { useTransition } from 'react';

import { deleteVenueAction } from '@/lib/actions/venues';

export function VenueDeleteButton({ venueId, venueName }: { venueId: string; venueName: string }) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Delete "${venueName}"? This can't be undone.`)) {
      return;
    }

    const formData = new FormData();
    formData.set('venueId', venueId);

    startTransition(async () => {
      const result = await deleteVenueAction(formData);
      if (!result.ok) {
        alert(result.error);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="inline-block border border-gray-300 px-4 py-2 rounded-md font-medium text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {isPending ? 'Deleting...' : 'Delete'}
    </button>
  );
}