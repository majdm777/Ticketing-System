'use client';

import { useActionState, useState } from 'react';

import {
  SeatMap as VenueSeatMap,
  type SeatMapRow,
} from '@/components/seat-map';
import { createGuestBookingAction, type BookingActionState } from '@/lib/actions/bookings';
import { buildSeatMapData, type SeatMapDataInput } from '@/lib/seat-map-data';

const MAX_SEATS = 10;

type Section = {
  name: string;
  price: number;
};

const initialState: BookingActionState = { ok: false };

export function GuestBookingForm({
  eventId,
  seats,
  sections,
}: {
  eventId: string;
  seats: SeatMapDataInput[];
  sections: Section[];
}) {
  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(new Set());
  const [state, formAction, pending] = useActionState(createGuestBookingAction, initialState);

  const [prevSeats, setPrevSeats] = useState(seats);
  if (seats !== prevSeats) {
    setPrevSeats(seats);
    const availableIds = new Set(
      seats
        .filter((seat) => seat.status === 'AVAILABLE')
        .map((seat) => seat.venueSeatId),
    );
    setSelectedSeatIds((prev) => new Set([...prev].filter((id) => availableIds.has(id))));
  }

  const { rows: dataRows, sectionColors } = buildSeatMapData(seats);

  const rows: SeatMapRow[] = dataRows.map((dataRow) => ({
    label: dataRow.row,
    seats: dataRow.seats.map((seat) => {
      const selected = selectedSeatIds.has(seat.venueSeatId);
      return {
        id: seat.id,
        number: seat.number,
        gap: seat.gap,
        color: seat.available ? seat.color : '#e5e7eb',
        disabled: !seat.available,
        selected,
        onClick: () => {
          setSelectedSeatIds((prev) => {
            const next = new Set(prev);
            if (next.has(seat.venueSeatId)) {
              next.delete(seat.venueSeatId);
            } else if (next.size < MAX_SEATS) {
              next.add(seat.venueSeatId);
            }
            return next;
          });
        },
        ariaLabel: `${seat.section} section, row ${dataRow.row}, seat ${
          seat.number
        }${seat.available ? '' : ', taken'}`,
      };
    }),
  }));

  const atCap = selectedSeatIds.size >= MAX_SEATS;

  return (
    <form
      action={formAction}
      className="grid gap-4 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6"
    >
      <input type="hidden" name="eventId" value={eventId} />
      {Array.from(selectedSeatIds).map((venueSeatId) => (
        <input key={venueSeatId} type="hidden" name="venueSeatIds" value={venueSeatId} />
      ))}

      <div className="space-y-4 lg:space-y-6">
        <VenueSeatMap
          rows={rows}
          legend={sections.map((section) => ({
            name: section.name,
            color: sectionColors.get(section.name) ?? '#e5e7eb',
            price: section.price,
          }))}
        />
        <p className="text-sm leading-6 text-zinc-500">
          Select one or more available seats for this guest — up to {MAX_SEATS}.
          Each selected seat becomes its own booking under this guest&apos;s
          name and phone.
        </p>
      </div>

      <aside className="order-first h-fit space-y-4 rounded-lg border border-zinc-200 bg-white p-4 lg:order-none lg:sticky lg:top-6">
        <h2 className="font-semibold">Guest details</h2>

        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
          <p className="text-sm font-medium">
            {selectedSeatIds.size === 0
              ? 'No seats selected'
              : `${selectedSeatIds.size} seat${selectedSeatIds.size === 1 ? '' : 's'} selected`}
          </p>
          <p className="text-xs text-zinc-500">
            {selectedSeatIds.size === 0
              ? 'Pick seats on the seat map.'
              : 'One booking is created per seat.'}
          </p>
        </div>

        <label className="block space-y-2 text-sm font-medium">
          <span>Name</span>
          <input
            name="userName"
            type="text"
            autoComplete="name"
            className="w-full rounded-md border border-zinc-300 px-3 py-3 text-base outline-none focus:border-zinc-950"
          />
        </label>

        <label className="block space-y-2 text-sm font-medium">
          <span>Phone</span>
          <input
            name="userPhone"
            type="tel"
            autoComplete="tel"
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
          disabled={pending || selectedSeatIds.size === 0}
          className="hidden w-full rounded-md bg-zinc-950 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-500 lg:block"
        >
          {pending ? 'Creating...' : 'Create guest booking'}
        </button>

        {atCap ? (
          <p className="text-xs text-zinc-500">
            Seat limit reached — deselect a seat to pick another.
          </p>
        ) : null}
      </aside>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-zinc-200 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:-mx-6 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">
            {selectedSeatIds.size === 0
              ? 'No seats selected'
              : `${selectedSeatIds.size} seat${
                  selectedSeatIds.size === 1 ? '' : 's'
                } selected`}
          </p>
          <button
            type="submit"
            disabled={pending || selectedSeatIds.size === 0}
            className="rounded-md bg-zinc-950 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-500"
          >
            {pending ? 'Creating...' : 'Create guest booking'}
          </button>
        </div>
      </div>
    </form>
  );
}
