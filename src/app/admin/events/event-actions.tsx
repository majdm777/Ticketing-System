'use client';

import { EventStatus } from '@prisma/client';
import { useState, useTransition } from 'react';

import { ConfirmationDialog } from '@/components/confirmation-dialog';
import { cancelEventAction, publishEventAction } from '@/lib/actions/events';

export function EventActions({
  eventId,
  eventName,
  status,
  isFinished,
}: {
  eventId: string;
  eventName: string;
  status: EventStatus;
  isFinished: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmAction, setConfirmAction] = useState<'publish' | 'cancel' | null>(null);

  function handleCancel() {
    const formData = new FormData();
    formData.set('eventId', eventId);

    startTransition(async () => {
      const result = await cancelEventAction(formData);
      if (!result.ok) {
        alert(result.error);
      }
    });
  }

  function handlePublish() {
    const formData = new FormData();
    formData.set('eventId', eventId);

    startTransition(async () => {
      const result = await publishEventAction(formData);
      if (!result.ok) {
        alert(result.error);
      }
    });
  }

  if (status === EventStatus.PUBLISHED && !isFinished) {
    return (
      <>
        <button
          type="button"
          onClick={() => setConfirmAction('cancel')}
          disabled={isPending}
          className="inline-flex h-11 w-full items-center justify-center rounded-md border border-red-300 px-4 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 sm:w-auto"
        >
          {isPending ? 'Canceling...' : 'Cancel event'}
        </button>
        <ConfirmationDialog
          open={confirmAction === 'cancel'}
          title="Cancel event"
          message={`Cancel "${eventName}"? All of its seats will be marked canceled and its bookings canceled. This cannot be undone.`}
          confirmLabel={isPending ? 'Canceling...' : 'Cancel event'}
          onConfirm={() => { setConfirmAction(null); handleCancel(); }}
          onCancel={() => setConfirmAction(null)}
        />
      </>
    );
  }

  if (status === EventStatus.DRAFT && !isFinished) {
    return (
      <>
        <button
          type="button"
          onClick={() => setConfirmAction('publish')}
          disabled={isPending}
          className="inline-flex h-11 w-full items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
        >
          {isPending ? 'Publishing...' : 'Publish'}
        </button>
        <ConfirmationDialog
          open={confirmAction === 'publish'}
          title="Publish event"
          message={`Publish "${eventName}"? It will become visible to attendees.`}
          confirmLabel={isPending ? 'Publishing...' : 'Publish'}
          onConfirm={() => { setConfirmAction(null); handlePublish(); }}
          onCancel={() => setConfirmAction(null)}
        />
      </>
    );
  }

  return null;
}
