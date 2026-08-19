'use client';

import { useLocale, useTranslations } from 'next-intl';
import { SeatStatus } from '@prisma/client';
import { useActionState, useMemo, useState } from 'react';

import {
  requestSeatStateAction,
  type RequestSeatActionState,
} from '@/lib/actions/bookings';
import { CopyCodeButton } from '@/components/copy-code-button';
import { PhoneInput } from '@/components/phone-input';
import { formatUsd } from '@/lib/currency';
import type { PublicGapSeat, PublicSeatGroup } from '@/lib/public-events';
import { MAX_PUBLIC_BOOKING_SEATS } from '@/lib/validation/bookings';
import { Link } from '@/i18n/navigation';

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

function SeatSummary({ seat, locale }: { seat: SelectedSeat; locale: string }) {
  const t = useTranslations('Booking');
  return (
    <li className="flex items-center gap-3 rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
        <CheckIcon className="h-3.5 w-3.5" />
      </span>
      <span className="text-sm font-medium text-zinc-950">
        {t('seatSummary', { section: seat.section, row: seat.row, number: seat.number })}
      </span>
      <span className="ms-auto text-sm font-semibold text-zinc-950">
        {formatUsd(seat.price, locale === 'ar' ? 'ar-SA' : 'en-US')}
      </span>
    </li>
  );
}

export function BookingFlow({
  slug,
  eventId,
  seatGroups,
  gapSeats,
  seatLayout,
  defaultCountryCode,
}: {
  slug: string;
  eventId: string;
  seatGroups: PublicSeatGroup[];
  gapSeats: PublicGapSeat[];
  seatLayout: 'ODD_EVEN' | 'IN_ORDER';
  defaultCountryCode: string;
}) {
  const t = useTranslations('Booking');
  const tCopy = useTranslations('Copy');
  const tPhone = useTranslations('Phone');
  const locale = useLocale();
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [userName, setUserName] = useState('');
  const [state, formAction, pending] = useActionState(
    requestSeatStateAction,
    initialRequestState,
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

  const availableSeatIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of seatGroups) {
      for (const row of group.rows) {
        for (const seat of row.seats) {
          if (seat.status === SeatStatus.AVAILABLE) {
            ids.add(seat.id);
          }
        }
      }
    }
    return ids;
  }, [seatGroups]);

  const selectedSeatIds = useMemo(() => {
    const effective = new Set<string>();
    for (const id of selection) {
      if (availableSeatIds.has(id)) {
        effective.add(id);
      }
    }
    return effective;
  }, [selection, availableSeatIds]);

  const selectedSeats = Array.from(selectedSeatIds)
    .map((id) => seatById.get(id))
    .filter((seat): seat is SelectedSeat => seat != null);
  const totalPrice = selectedSeats.reduce((sum, seat) => sum + seat.price, 0);
  const atCap = selectedSeatIds.size >= MAX_PUBLIC_BOOKING_SEATS;

  function toggleSeat(seatId: string) {
    if (pending) {
      return;
    }
    setSelection((prev) => {
      const next = new Set(prev);
      for (const id of prev) {
        if (!availableSeatIds.has(id)) {
          next.delete(id);
        }
      }
      if (next.has(seatId)) {
        next.delete(seatId);
      } else if (next.size < MAX_PUBLIC_BOOKING_SEATS) {
        next.add(seatId);
      }
      return next;
    });
  }

  if (state.ok) {
    const isOnline = state.referenceCode != null;
    const bookedSeats = state.bookings
      .map((booking) => ({
        seat: seatById.get(booking.eventSeatId),
        bookingId: booking.bookingId,
      }))
      .filter(
        (entry): entry is { seat: SelectedSeat; bookingId: string } =>
          entry.seat != null,
      );
    const bookedTotal = bookedSeats.reduce(
      (sum, { seat }) => sum + seat.price,
      0,
    );

    return (
      <div className="space-y-4">
        <section className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-zinc-950">
            {isOnline ? t('seatsHeldOnline') : t('seatsHeldDoor')}
          </h2>

          {isOnline ? (
            <div className="mt-4 rounded-lg border border-zinc-950 bg-zinc-950 p-4 text-center">
              <p className="text-sm text-zinc-200">
                {t('payOrganizer', { amount: formatUsd(bookedTotal, locale === 'ar' ? 'ar-SA' : 'en-US') })}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
                <p className="font-mono text-3xl font-bold tracking-widest text-white">
                  {state.referenceCode}
                </p>
                <CopyCodeButton
                  value={state.referenceCode ?? ''}
                  copiedLabel={tCopy('copied')}
                  copyLabel={tCopy('copy')}
                  failedLabel={tCopy('copyFailed')}
                  ariaLabel={tCopy('copyPaymentCode')}
                  failedMessage={tCopy('copyFailedHint')}
                />
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-zinc-700">
              {t('payAtDoorMessage', { amount: formatUsd(bookedTotal, locale === 'ar' ? 'ar-SA' : 'en-US') })}
            </p>
          )}

          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-zinc-950">
            {t('yourSeats')}
          </h3>
          <ul className="mt-2 space-y-2">
            {bookedSeats.map(({ seat, bookingId }) => (
              <li
                key={seat.id}
                className="flex items-center gap-3 rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm font-medium text-zinc-950">
                  {t('seatSummary', { section: seat.section, row: seat.row, number: seat.number })} ·{' '}
                  {formatUsd(seat.price, locale === 'ar' ? 'ar-SA' : 'en-US')}
                </span>
                <Link
                  href={`/e/${slug}/booking/${bookingId}`}
                  className="ms-auto inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-semibold text-emerald-900 underline"
                >
                  {t('checkBooking')}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-950">
          {t('chooseSeats')}
        </h2>
        <p className="mt-1 text-sm leading-5 text-zinc-700">
          {t('chooseSeatsDescription', { max: MAX_PUBLIC_BOOKING_SEATS })}
        </p>
      </div>

      <SeatMap
        seatGroups={seatGroups}
        gapSeats={gapSeats}
        seatLayout={seatLayout}
        selectedSeatIds={selectedSeats.map((seat) => seat.id)}
        onSelect={toggleSeat}
      />

      {atCap ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          {t('seatLimitReached')}
        </p>
      ) : null}

      {selectedSeats.length > 0 ? (
        <form
          action={formAction}
          className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6"
        >
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              {t('requestSeats')}
            </h2>
            <p className="mt-1 text-sm text-zinc-700">
              {t('seatsSelected', { count: selectedSeats.length })}
            </p>
          </div>

          <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-zinc-950">
            {t('yourSeats')}
          </h3>
          <ul className="mt-2 space-y-2">
            {selectedSeats.map((seat) => (
              <SeatSummary key={seat.id} seat={seat} locale={locale} />
            ))}
          </ul>

          <fieldset className="mt-5 space-y-3">
            <legend className="text-base font-medium text-zinc-950">
              {t('howWillYouPay')}
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
                  {t('payOnline')}
                </span>
                <span className="block text-sm leading-5 text-zinc-700">
                  {t('payOnlineDescription', { count: selectedSeats.length })}
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
                  {t('payAtDoor')}
                </span>
                <span className="block text-sm leading-5 text-zinc-700">
                  {t('payAtDoorDescription')}
                </span>
              </span>
            </label>
          </fieldset>

          <div className="mt-5 space-y-4">
            <label className="block space-y-1">
              <span className="text-base font-medium text-zinc-950">
                {t('yourName')}
              </span>
              <input
                name="userName"
                type="text"
                autoComplete="name"
                required
                value={userName}
                onChange={(event) => setUserName(event.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-3 text-base text-zinc-950 outline-none focus:border-zinc-950"
              />
            </label>

            <PhoneInput
              defaultCountryCode={defaultCountryCode}
              label={tPhone('yourPhone')}
              placeholder={tPhone('yourPhone')}
              phoneErrorTemplate={(country) => tPhone('invalidPhone', { country })}
              countryPickerLabel={tPhone('countryPickerLabel')}
            />
          </div>

          {state.ok === false && state.error ? (
            <p
              role="alert"
              className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-base leading-6 text-red-700"
            >
              {state.error}
            </p>
          ) : null}

          <input type="hidden" name="eventId" value={eventId} />
          {selectedSeats.map((seat) => (
            <input
              key={seat.id}
              type="hidden"
              name="eventSeatIds"
              value={seat.id}
            />
          ))}
          <input type="hidden" name="slug" value={slug} />

          <div className="mt-5 flex items-center justify-between gap-4 rounded-lg bg-zinc-950 px-4 py-3 text-white">
            <span className="text-sm font-medium">
              {t('total')} · {t('seatsSelected', { count: selectedSeats.length })}
            </span>
            <span className="text-2xl font-bold">{formatUsd(totalPrice, locale === 'ar' ? 'ar-SA' : 'en-US')}</span>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="mt-4 w-full rounded-md bg-zinc-950 px-4 py-3 text-base font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-500"
          >
            {pending
              ? t('requesting')
              : t('requestButton', { count: selectedSeats.length })}
          </button>
        </form>
      ) : null}
    </div>
  );
}
