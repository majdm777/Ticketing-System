'use client';

import { useState } from 'react';

import { formatUsd } from '@/lib/currency';
import { formatDate } from '@/lib/format';

import { PendingBookingActions } from './pending-booking-actions';
import { PendingRequestActions } from './pending-request-actions';
import { TicketActions } from './ticket-actions';

export type RequestSeatView = {
  bookingId: string;
  label: string;
  status: string;
  referenceCode: string | null;
};

export type RequestGroupView = {
  key: string;
  representativeBookingId: string;
  attendeeName: string;
  attendeePhone: string;
  caseType: string;
  referenceCode: string | null;
  totalUsd: number;
  statusText: string;
  hasPending: boolean;
  hasConfirmed: boolean;
  allConfirmed: boolean;
  needsSend: boolean;
  ticketSentAt: Date | null;
  ticketNote: string | null;
  confirmedByAdmin: string | null;
  confirmedAt: Date | null;
  seats: RequestSeatView[];
};

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${
        expanded ? 'rotate-180' : ''
      }`}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SeatDetail({ seats }: { seats: RequestSeatView[] }) {
  return (
    <ul className="space-y-2">
      {seats.map((seat) => (
        <li
          key={seat.bookingId}
          className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="space-y-0.5">
            <div className="text-sm font-medium text-zinc-900">{seat.label}</div>
            <div className="text-xs text-zinc-500">
              {seat.status}
              {seat.referenceCode ? ` · ${seat.referenceCode}` : ''}
            </div>
          </div>
          {seat.status === 'PENDING' ? (
            <PendingBookingActions bookingId={seat.bookingId} />
          ) : (
            <span className="text-sm text-zinc-400">-</span>
          )}
        </li>
      ))}
    </ul>
  );
}

// Renders one request two ways: a mobile card, or a desktop table row pair
// (summary row + a full-width row listing the seats once expanded).
export function RequestRow({
  group,
  variant,
}: {
  group: RequestGroupView;
  variant: 'card' | 'table';
}) {
  const [expanded, setExpanded] = useState(false);

  const seatCount = group.seats.length;
  const seatCountText = `${seatCount} seat${seatCount === 1 ? '' : 's'}`;
  const actions = (
    <div className="space-y-3">
      {group.hasPending ? (
        <PendingRequestActions bookingId={group.representativeBookingId} />
      ) : null}
      {group.hasConfirmed ? (
        <TicketActions
          group={{
            representativeBookingId: group.representativeBookingId,
            allConfirmed: group.allConfirmed,
            needsSend: group.needsSend,
            ticketSentAt: group.ticketSentAt,
            ticketNote: group.ticketNote,
          }}
        />
      ) : null}
      {!group.hasPending && !group.hasConfirmed ? (
        <span className="text-sm text-zinc-500">No actions available.</span>
      ) : null}
    </div>
  );
  const detail = (
    <div className="space-y-3">
      <SeatDetail seats={group.seats} />
    </div>
  );

  if (variant === 'card') {
    return (
      <article className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex w-full items-center justify-between gap-3 p-4 text-left"
        >
          <div className="min-w-0 space-y-0.5">
            <div className="font-medium">{group.attendeeName}</div>
            <div className="text-sm text-zinc-600">{group.attendeePhone}</div>
            <div className="text-xs text-zinc-500">
              {seatCountText} · {group.statusText}
              {group.referenceCode ? ` · ${group.referenceCode}` : ''}
            </div>
            <div className="text-sm font-semibold text-zinc-900">
              Total {formatUsd(group.totalUsd)}
            </div>
          </div>
          <Chevron expanded={expanded} />
        </button>
        {expanded ? (
          <div className="space-y-3 border-t border-zinc-100 px-4 py-3">{detail}</div>
        ) : null}
        <div className="border-t border-zinc-100 px-4 py-3">{actions}</div>
      </article>
    );
  }

  return (
    <>
      <tr className="border-b border-zinc-100">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              aria-label={expanded ? 'Hide seats' : 'Show seats'}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
            >
              <Chevron expanded={expanded} />
            </button>
            <div>
              <div className="font-medium">{group.attendeeName}</div>
              <div className="text-zinc-600">{group.attendeePhone}</div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-zinc-700">{seatCountText}</td>
        <td className="px-4 py-3">{group.caseType}</td>
        <td className="px-4 py-3">{group.statusText}</td>
        <td className="px-4 py-3 font-mono">{group.referenceCode ?? '-'}</td>
        <td className="px-4 py-3 text-zinc-700">{formatUsd(group.totalUsd)}</td>
        <td className="px-4 py-3 text-zinc-700">
          <div>{group.confirmedByAdmin ?? '-'}</div>
          <div>{formatDate(group.confirmedAt)}</div>
        </td>
        <td className="px-4 py-3">{actions}</td>
      </tr>
      {expanded ? (
        <tr className="border-b border-zinc-100 bg-zinc-50/60">
          <td colSpan={8} className="px-4 py-4">
            {detail}
          </td>
        </tr>
      ) : null}
    </>
  );
}
