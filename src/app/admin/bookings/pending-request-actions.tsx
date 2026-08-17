'use client';

import { useActionState, useState, useTransition } from 'react';

import { ConfirmationDialog } from '@/components/confirmation-dialog';
import {
  cancelBookingGroupStateAction,
  confirmBookingGroupStateAction,
  type BookingActionState,
} from '@/lib/actions/bookings';

const initialState: BookingActionState = { ok: false };

export function PendingRequestActions({ bookingId }: { bookingId: string }) {
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmBookingGroupStateAction,
    initialState,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelBookingGroupStateAction,
    initialState,
  );
  const error = confirmState.error ?? cancelState.error;
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [isTransitionPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <form action={confirmAction}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <button
            type="submit"
            disabled={confirmPending || cancelPending}
            className="w-full rounded-md bg-zinc-950 px-3 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-500 sm:w-auto"
          >
            Confirm
          </button>
        </form>
        <button
          type="button"
          disabled={confirmPending || cancelPending}
          onClick={() => setConfirmCancelOpen(true)}
          className="w-full rounded-md border border-zinc-300 px-3 py-3 text-sm font-medium text-zinc-700 disabled:cursor-not-allowed disabled:text-zinc-400 sm:w-auto"
        >
          Cancel
        </button>
      </div>
      <ConfirmationDialog
        open={confirmCancelOpen}
        title="Cancel this request?"
        message="All pending seats in this request will be released and available for others to book."
        confirmLabel="Cancel request"
        onConfirm={() => {
          setConfirmCancelOpen(false);
          startTransition(() => {
            const form = new FormData();
            form.set('bookingId', bookingId);
            cancelAction(form);
          });
        }}
        onCancel={() => setConfirmCancelOpen(false)}
      />
      {error ? <p className="max-w-none text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
