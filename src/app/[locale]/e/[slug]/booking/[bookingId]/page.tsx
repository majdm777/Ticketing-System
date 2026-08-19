import { BookingStatus, CaseType, EventStatus } from '@prisma/client';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { CopyCodeButton } from '@/components/copy-code-button';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { formatUsd } from '@/lib/currency';
import { formatDate } from '@/lib/format';
import { getPublicBooking, type PublicBooking } from '@/lib/public-bookings';
import { Link } from '@/i18n/navigation';

async function StatusCard({
  booking,
  slug,
  locale,
}: {
  booking: PublicBooking;
  slug: string;
  locale: string;
}) {
  const t = await getTranslations('Booking');
  const tStatus = await getTranslations('Status');
  const tCopy = await getTranslations('Copy');

  const eventLive =
    booking.event.status === EventStatus.PUBLISHED &&
    booking.event.startsAt > new Date();

  if (
    booking.status === BookingStatus.PENDING &&
    booking.caseType === CaseType.ONLINE_CODE
  ) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-950">
          {tStatus('waitingPayment')}
        </h2>

        {booking.referenceCode ? (
          <div className="mt-4 rounded-lg border border-zinc-950 bg-zinc-950 p-4 text-center">
            <p className="text-sm text-zinc-200">
              {t('payOrganizer', { amount: formatUsd(booking.seat.price ?? 0, locale === 'ar' ? 'ar-SA' : 'en-US') })}
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
              <p className="font-mono text-3xl font-bold tracking-widest text-white">
                {booking.referenceCode}
              </p>
              <CopyCodeButton
                value={booking.referenceCode}
                compact
                copiedLabel={tCopy('copied')}
                failedLabel={tCopy('copyFailed')}
                ariaLabel={tCopy('copyCode')}
              />
            </div>
          </div>
        ) : (
          <p className="mt-4 text-base leading-6 text-zinc-700">
            {tStatus('waitingForPayment')}
          </p>
        )}

        <p className="mt-4 text-base leading-6 text-zinc-700">
          {tStatus('waitingPaymentDescription')}
        </p>
      </section>
    );
  }

  if (booking.status === BookingStatus.PENDING) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-950">
          {tStatus('seatBeingHeld')}
        </h2>
        <p className="mt-2 text-base leading-6 text-zinc-700">
          {tStatus('seatBeingHeldDescription')}
        </p>
      </section>
    );
  }

  if (booking.status === BookingStatus.CONFIRMED) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-950">
          {tStatus('seatConfirmed')}
        </h2>
        <p className="mt-2 text-base leading-6 text-zinc-700">
          {tStatus('seeYou')}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-zinc-950">
        {booking.status === BookingStatus.EXPIRED
          ? tStatus('holdExpired')
          : tStatus('bookingCancelled')}
      </h2>
      <p className="mt-2 text-base leading-6 text-zinc-700">
        {tStatus('seatNoLongerHeld')}
      </p>
      {eventLive ? (
        <Link
          href={`/e/${slug}`}
          className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-zinc-950 px-4 py-3 text-base font-medium text-white sm:w-auto"
        >
          {tStatus('requestAgain')}
        </Link>
      ) : (
        <Link
          href={`/e/${slug}`}
          className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-zinc-300 px-4 py-3 text-base font-medium text-zinc-950 sm:w-auto"
        >
          {tStatus('backToEvent')}
        </Link>
      )}
    </section>
  );
}

export default async function BookingStatusPage({
  params,
}: {
  params: Promise<{ slug: string; bookingId: string; locale: string }>;
}) {
  const { slug, bookingId, locale } = await params;
  setRequestLocale(locale);

  const tStatus = await getTranslations('Status');

  const lookup = await getPublicBooking({ slug, bookingId });

  if (lookup.outcome === 'not_found') {
    notFound();
  }

  const { booking } = lookup;
  const { event, seat } = booking;

  return (
    <main className="w-full flex-1">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
              {tStatus('bookingStatus')}
            </h1>
            <p className="text-base text-zinc-600">
              {event.name}
              <span aria-hidden="true"> · </span>
              {formatDate(event.startsAt, locale)}
            </p>
          </div>
          <LocaleSwitcher />
        </header>

        <div className="mt-6 space-y-4">
          <StatusCard booking={booking} slug={slug} locale={locale} />

          <section className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-zinc-950">
              {tStatus('yourBooking')}
            </h2>
            <dl className="mt-3 space-y-3 text-base">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-zinc-600">{tStatus('seat')}</dt>
                <dd className="text-end font-medium text-zinc-950">
                  {seat.section
                    ? tStatus('seatDetails', { section: seat.section, row: seat.row, number: seat.number })
                    : tStatus('seatDetailsNoSection', { row: seat.row, number: seat.number })}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-zinc-600">{tStatus('price')}</dt>
                <dd className="font-medium text-zinc-950">
                  {formatUsd(seat.price ?? 0, locale === 'ar' ? 'ar-SA' : 'en-US')}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-zinc-600">{tStatus('date')}</dt>
                <dd className="text-end font-medium text-zinc-950">
                  {formatDate(event.startsAt, locale)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-zinc-600">{tStatus('venue')}</dt>
                <dd className="text-end font-medium text-zinc-950">
                  {event.venue.name}
                </dd>
              </div>
            </dl>
            {event.venue.address ? (
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                {event.venue.address}
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
