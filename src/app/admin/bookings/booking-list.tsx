'use client';

import { useState } from 'react';

import { RequestRow, type RequestGroupView } from './request-row';

type Props = {
  requestGroups: RequestGroupView[];
  showScroll: boolean;
};

export function BookingList({ requestGroups, showScroll }: Props) {
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const filtered = query
    ? requestGroups.filter((g) => g.attendeeName.toLowerCase().includes(query))
    : requestGroups;

  return (
    <>
      <div className="mb-3">
        <div className="relative">
          <input
            type="search"
            aria-label="Search bookings by attendee name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name"
            autoComplete="off"
            className="h-11 w-full rounded-md border border-zinc-300 pl-3 pr-10 text-base outline-none focus:border-zinc-950"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 inline-flex h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded px-2 text-xs text-zinc-500 hover:text-zinc-950"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div
        className={`space-y-3 md:hidden ${
          showScroll ? 'max-h-[560px] overflow-y-auto pb-3' : ''
        }`}
      >
        {filtered.map((group) => (
          <RequestRow key={group.key} group={group} variant="card" />
        ))}

        {filtered.length === 0 ? (
          <p className="rounded-lg border border-zinc-100 bg-white px-4 py-8 text-center text-base text-zinc-500">
            {query ? 'No bookings match this search.' : 'No bookings match this view.'}
          </p>
        ) : null}
      </div>

      <div
        className={`hidden overflow-x-auto rounded-lg border border-zinc-200 bg-white md:block ${
          showScroll ? 'max-h-[560px] overflow-y-auto' : ''
        }`}
      >
        <table className="w-full min-w-225 text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Attendee</th>
              <th className="px-4 py-3">Seats</th>
              <th className="px-4 py-3">Case</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Confirmed</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((group) => (
              <RequestRow key={group.key} group={group} variant="table" />
            ))}
          </tbody>
        </table>

        {filtered.length === 0 ? (
          <p className="border-t border-zinc-100 px-4 py-8 text-center text-base text-zinc-500">
            {query ? 'No bookings match this search.' : 'No bookings match this view.'}
          </p>
        ) : null}
      </div>
    </>
  );
}
