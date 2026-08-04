'use client';

import { useActionState } from 'react';

import {
  cancelBookingStateAction,
  confirmBookingStateAction,
  type BookingActionState,
} from '@/lib/actions/bookings';

const initialState: BookingActionState = { ok: false };

export function PendingBookingActions({ bookingId }: { bookingId: string }) {
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmBookingStateAction,
    initialState,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelBookingStateAction,
    initialState,
  );
  const error = confirmState.error ?? cancelState.error;

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <form action={confirmAction}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <button
            type="submit"
            disabled={confirmPending || cancelPending}
            className="w-full rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-500 sm:w-auto"
          >
            Confirm
          </button>
        </form>
        <form action={cancelAction}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <button
            type="submit"
            disabled={confirmPending || cancelPending}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 disabled:cursor-not-allowed disabled:text-zinc-400 sm:w-auto"
          >
            Cancel
          </button>
        </form>
      </div>
      {error ? <p className="max-w-none text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
