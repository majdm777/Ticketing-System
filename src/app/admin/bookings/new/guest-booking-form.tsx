'use client';

import { useActionState, useState } from 'react';

import {
  createGuestBookingAction,
  type BookingActionState,
} from '@/lib/actions/bookings';

type Seat = {
  id: string;
  venueSeatId: string;
  status: string;
  label: string;
};

type SeatGroup = {
  section: string;
  rows: {
    row: string;
    seats: Seat[];
  }[];
};

const initialState: BookingActionState = { ok: false };

export function GuestBookingForm({
  eventId,
  seatGroups,
}: {
  eventId: string;
  seatGroups: SeatGroup[];
}) {
  const [selectedSeatId, setSelectedSeatId] = useState('');
  const [state, formAction, pending] = useActionState(createGuestBookingAction, initialState);

  return (
    <form action={formAction} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="venueSeatId" value={selectedSeatId} />

      <div className="space-y-4 lg:space-y-6">
        {seatGroups.map((group) => (
          <section key={group.section} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{group.section}</h2>
            <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3 sm:p-4">
              {group.rows.map((row) => (
                <div key={row.row} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-3">
                  <div className="pt-2 text-xs font-medium uppercase tracking-wide text-zinc-500 sm:text-sm sm:normal-case sm:tracking-normal">
                    Row {row.row}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {row.seats.map((seat) => {
                      const available = seat.status === 'AVAILABLE';
                      const selected = selectedSeatId === seat.venueSeatId;

                      return (
                        <button
                          key={seat.id}
                          type="button"
                          disabled={!available}
                          onClick={() => {
                            setSelectedSeatId(seat.venueSeatId);
                          }}
                          className={`h-11 min-w-11 touch-manipulation rounded-md border px-3 text-sm font-medium ${
                            selected
                              ? 'border-zinc-950 bg-zinc-950 text-white'
                              : available
                                ? 'border-zinc-300 bg-white text-zinc-900 hover:border-zinc-950'
                                : 'cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400'
                          }`}
                        >
                          {seat.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <aside className="h-fit space-y-4 rounded-lg border border-zinc-200 bg-white p-4 lg:sticky lg:top-6">
        <h2 className="font-semibold">Guest details</h2>

        <label className="block space-y-2 text-sm font-medium">
          <span>Name</span>
          <input
            name="userName"
            type="text"
            className="w-full rounded-md border border-zinc-300 px-3 py-3 text-base outline-none focus:border-zinc-950"
          />
        </label>

        <label className="block space-y-2 text-sm font-medium">
          <span>Phone</span>
          <input
            name="userPhone"
            type="tel"
            className="w-full rounded-md border border-zinc-300 px-3 py-3 text-base outline-none focus:border-zinc-950"
          />
        </label>

        {state.error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            Guest booking created.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending || !selectedSeatId}
          className="w-full rounded-md bg-zinc-950 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-500"
        >
          {pending ? 'Creating...' : 'Create guest booking'}
        </button>
      </aside>
    </form>
  );
}
