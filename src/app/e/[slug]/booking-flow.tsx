'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import {
  requestSeatStateAction,
  type RequestSeatActionState,
} from '@/lib/actions/bookings';
import { formatUsd } from '@/lib/currency';
import type { PublicGapSeat, PublicSeatGroup } from '@/lib/public-events';
import { MAX_PUBLIC_BOOKING_SEATS } from '@/lib/validation/bookings';

import { SeatMap } from './seat-map';

const initialRequestState: RequestSeatActionState = { ok: false, error: '' };

type SelectedSeat = {
  id: string;
  row: string;
  number: string;
  section: string;
  price: number;
};

function CheckIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M4 10.5l4 4 8-8"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SeatSummary({ seat }: { seat: SelectedSeat }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
        <CheckIcon className="h-3.5 w-3.5" />
      </span>
      <span className="text-sm font-medium text-zinc-950">
        {seat.section} · row {seat.row} seat {seat.number}
      </span>
      <span className="ml-auto text-sm font-semibold text-zinc-950">
        {formatUsd(seat.price)}
      </span>
    </li>
  );
}

export function BookingFlow({
  slug,
  eventId,
  seatGroups,
  gapSeats,
}: {
  slug: string;
  eventId: string;
  seatGroups: PublicSeatGroup[];
  gapSeats: PublicGapSeat[];
}) {
  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(
    () => new Set(),
  );

  const seatById = new Map<string, SelectedSeat>();
  for (const group of seatGroups) {
    for (const row of group.rows) {
      for (const seat of row.seats) {
        seatById.set(seat.id, {
          id: seat.id,
          row: row.row,
          number: seat.number,
          section: group.section,
          price: group.price,
        });
      }
    }
  }

  const selectedSeats = Array.from(selectedSeatIds)
    .map((id) => seatById.get(id))
    .filter((seat): seat is SelectedSeat => seat != null);
  const totalPrice = selectedSeats.reduce((sum, seat) => sum + seat.price, 0);
  const atCap = selectedSeatIds.size >= MAX_PUBLIC_BOOKING_SEATS;

  function toggleSeat(seatId: string) {
    setSelectedSeatIds((prev) => {
      const next = new Set(prev);
      if (next.has(seatId)) {
        next.delete(seatId);
      } else if (next.size < MAX_PUBLIC_BOOKING_SEATS) {
        next.add(seatId);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-950">
          Choose your seats
        </h2>
        <p className="mt-1 text-sm leading-5 text-zinc-700">
          Tap one or more available seats — up to {MAX_PUBLIC_BOOKING_SEATS}.
          They&apos;re reserved together and paid with a single code.
        </p>
      </div>

      <SeatMap
        seatGroups={seatGroups}
        gapSeats={gapSeats}
        selectedSeatIds={selectedSeats.map((seat) => seat.id)}
        onSelect={toggleSeat}
      />

      {atCap ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          Seat limit reached — tap a selected seat to drop it before picking
          another.
        </p>
      ) : null}

      {selectedSeats.length > 0 ? (
        <BookingForm
          key={selectedSeats.map((seat) => seat.id).sort().join('|')}
          slug={slug}
          eventId={eventId}
          seats={selectedSeats}
          totalPrice={totalPrice}
        />
      ) : null}
    </div>
  );
}

function BookingForm({
  slug,
  eventId,
  seats,
  totalPrice,
}: {
  slug: string;
  eventId: string;
  seats: SelectedSeat[];
  totalPrice: number;
}) {
  const [state, formAction, pending] = useActionState(
    requestSeatStateAction,
    initialRequestState,
  );

  if (state.ok) {
    const isOnline = state.referenceCode != null;
    const bookingBySeat = new Map(
      state.bookings.map((booking) => [booking.eventSeatId, booking.bookingId]),
    );

    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-950">
          {isOnline ? 'Your seats are being held' : 'We are holding your seats'}
        </h2>

        {isOnline ? (
          <div className="mt-4 rounded-lg border border-zinc-950 bg-zinc-950 p-4 text-center">
            <p className="text-sm text-zinc-200">
              Pay the organizer {formatUsd(totalPrice)} and use this code as
              your payment note:
            </p>
            <p className="mt-2 font-mono text-3xl font-bold tracking-widest text-white">
              {state.referenceCode}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm leading-6 text-zinc-700">
            We are holding your seats for you. Pay{' '}
            <span className="font-bold text-zinc-950">
              {formatUsd(totalPrice)}
            </span>{' '}
            at the door when you arrive.
          </p>
        )}

        <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-zinc-950">
          Your seats
        </h3>
        <ul className="mt-2 space-y-2">
          {seats.map((seat) => (
            <li
              key={seat.id}
              className="flex items-center gap-3 rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                <CheckIcon className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm font-medium text-zinc-950">
                {seat.section} · row {seat.row} seat {seat.number} ·{' '}
                {formatUsd(seat.price)}
              </span>
              <Link
                href={`/e/${slug}/booking/${bookingBySeat.get(seat.id)}`}
                className="ml-auto min-h-11 shrink-0 text-sm font-semibold text-emerald-900 underline"
              >
                Check booking
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6"
    >
      <div>
        <h2 className="text-lg font-semibold text-zinc-950">
          Request these seats
        </h2>
        <p className="mt-1 text-sm text-zinc-700">
          {seats.length} seat{seats.length === 1 ? '' : 's'} selected
        </p>
      </div>

      <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-zinc-950">
        Your seats
      </h3>
      <ul className="mt-2 space-y-2">
        {seats.map((seat) => (
          <SeatSummary key={seat.id} seat={seat} />
        ))}
      </ul>

      <fieldset className="mt-5 space-y-3">
        <legend className="text-base font-medium text-zinc-950">
          How will you pay?
        </legend>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-300 p-4 has-[:checked]:border-zinc-950 has-[:checked]:bg-zinc-50 has-[:checked]:ring-2 has-[:checked]:ring-zinc-950">
          <input
            type="radio"
            name="caseType"
            value="ONLINE_CODE"
            defaultChecked
            className="mt-1 h-5 w-5"
          />
          <span>
            <span className="block font-medium text-zinc-950">
              Pay online with a code
            </span>
            <span className="block text-sm leading-5 text-zinc-700">
              We&apos;ll give you one code for all {seats.length} seat
              {seats.length === 1 ? '' : 's'}. Pay the organizer online and use
              the code as your payment note.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-300 p-4 has-[:checked]:border-zinc-950 has-[:checked]:bg-zinc-50 has-[:checked]:ring-2 has-[:checked]:ring-zinc-950">
          <input
            type="radio"
            name="caseType"
            value="PAY_AT_DOOR"
            className="mt-1 h-5 w-5"
          />
          <span>
            <span className="block font-medium text-zinc-950">
              Pay at the door
            </span>
            <span className="block text-sm leading-5 text-zinc-700">
              No payment needed now.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="mt-5 space-y-4">
        <label className="block space-y-1">
          <span className="text-base font-medium text-zinc-950">
            Your name
          </span>
          <input
            name="userName"
            type="text"
            autoComplete="name"
            required
            className="w-full rounded-md border border-zinc-300 px-3 py-3 text-base text-zinc-950 outline-none focus:border-zinc-950"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-base font-medium text-zinc-950">
            Your phone number
          </span>
          <input
            name="userPhone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            className="w-full rounded-md border border-zinc-300 px-3 py-3 text-base text-zinc-950 outline-none focus:border-zinc-950"
          />
        </label>
      </div>

      {state.ok === false && state.error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-base leading-6 text-red-700">
          {state.error}
        </p>
      ) : null}

      <input type="hidden" name="eventId" value={eventId} />
      {seats.map((seat) => (
        <input key={seat.id} type="hidden" name="eventSeatIds" value={seat.id} />
      ))}
      <input type="hidden" name="slug" value={slug} />

      <div className="mt-5 flex items-center justify-between gap-4 rounded-lg bg-zinc-950 px-4 py-3 text-white">
        <span className="text-sm font-medium">
          Total · {seats.length} seat{seats.length === 1 ? '' : 's'}
        </span>
        <span className="text-2xl font-bold">{formatUsd(totalPrice)}</span>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-4 w-full rounded-md bg-zinc-950 px-4 py-3 text-base font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-500"
      >
        {pending
          ? 'Requesting…'
          : `Request ${seats.length} seat${seats.length === 1 ? '' : 's'}`}
      </button>
    </form>
  );
}
