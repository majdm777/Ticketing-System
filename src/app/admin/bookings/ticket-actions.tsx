'use client';

import { useActionState } from 'react';

import { sendTicketsStateAction, type BookingActionState } from '@/lib/actions/bookings';
import { formatDate } from '@/lib/format';

export type TicketActionsGroup = {
  representativeBookingId: string;
  allConfirmed: boolean;
  ticketSentAt: Date | null;
  ticketNote: string | null;
};

const initialState: BookingActionState = { ok: false };

// Row-level ticket controls for a confirmed request: Send/Resend triggers the
// whole pipeline (token claim-or-adopt, PDF, WhatsApp send), Download streams
// the same PDF without sending. The UI never claims "delivered" — only "sent".
export function TicketActions({ group }: { group: TicketActionsGroup }) {
  const [sendState, sendAction, sendPending] = useActionState(
    sendTicketsStateAction,
    initialState,
  );
  const label = group.ticketSentAt ? 'Resend' : 'Send';

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <form action={sendAction}>
          <input type="hidden" name="bookingId" value={group.representativeBookingId} />
          <button
            type="submit"
            disabled={sendPending}
            className="w-full rounded-md bg-zinc-950 px-3 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-500 sm:w-auto"
          >
            {label}
          </button>
        </form>
        {group.allConfirmed ? (
          <a
            href={`/admin/bookings/tickets?bookingId=${group.representativeBookingId}`}
            className="inline-flex w-full items-center justify-center rounded-md border border-zinc-300 px-3 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 sm:w-auto"
          >
            Download
          </a>
        ) : null}
      </div>
      {group.ticketSentAt ? (
        <p className="max-w-none text-xs text-zinc-600">Sent {formatDate(group.ticketSentAt)}</p>
      ) : group.ticketNote ? (
        <p className="max-w-none text-xs text-red-700">Failed: {group.ticketNote}</p>
      ) : null}
      {sendState.error ? (
        <p className="max-w-none text-xs text-red-700">{sendState.error}</p>
      ) : null}
    </div>
  );
}
