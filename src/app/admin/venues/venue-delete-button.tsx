'use client';

import { useState, useTransition } from 'react';

import { ConfirmationDialog } from '@/components/confirmation-dialog';
import { deleteVenueAction } from '@/lib/actions/venues';

export function VenueDeleteButton({ venueId, venueName }: { venueId: string; venueName: string }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleDelete() {
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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={isPending}
        className="inline-flex min-h-11 items-center border border-gray-300 px-4 py-2 rounded-md font-medium text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {isPending ? 'Deleting...' : 'Delete'}
      </button>
      <ConfirmationDialog
        open={open}
        title="Delete venue"
        message={`Delete "${venueName}"? This cannot be undone.`}
        confirmLabel={isPending ? 'Deleting...' : 'Delete'}
        onConfirm={() => { setOpen(false); handleDelete(); }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}