'use client';

import { EventStatus } from '@prisma/client';
import { useTransition } from 'react';

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

  function handleCancel() {
    if (
      !confirm(
        `Cancel "${eventName}"? All of its seats will be marked canceled and its bookings canceled.`,
      )
    ) {
      return;
    }

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
    if (!confirm(`Publish "${eventName}"?`)) {
      return;
    }

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
      <button
        type="button"
        onClick={handleCancel}
        disabled={isPending}
        className="inline-flex h-11 w-full items-center justify-center rounded-md border border-red-300 px-4 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 sm:w-auto"
      >
        {isPending ? 'Canceling...' : 'Cancel event'}
      </button>
    );
  }

  if (status === EventStatus.DRAFT && !isFinished) {
    return (
      <button
        type="button"
        onClick={handlePublish}
        disabled={isPending}
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
      >
        {isPending ? 'Publishing...' : 'Publish'}
      </button>
    );
  }

  return null;
}
