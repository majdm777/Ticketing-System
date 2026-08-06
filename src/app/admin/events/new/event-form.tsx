'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { createEventAction, type EventActionState } from '@/lib/actions/events';
import { formatPrice } from '@/lib/currency';

type VenueOption = {
  id: string;
  name: string;
  address: string;
  capacity: number;
  sections: { name: string; price: number }[];
};

const initialState: EventActionState = { ok: false };

function minDateTimeInput() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T00:00`;
}

export function EventForm({ venues }: { venues: VenueOption[] }) {
  const [state, formAction, pending] = useActionState(createEventAction, initialState);
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const filteredVenues = venues.filter(
    (venue) =>
      venue.name.toLowerCase().includes(query) || venue.address.toLowerCase().includes(query),
  );

  return (
    <form action={formAction} className="space-y-8">
      <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Details</h2>

        <label className="block space-y-2 text-sm font-medium">
          <span>Event name</span>
          <input
            name="name"
            type="text"
            autoComplete="off"
            required
            maxLength={120}
            placeholder="e.g. Jazz Night 2026"
            className="w-full rounded-md border border-zinc-300 px-3 py-3 text-base outline-none focus:border-zinc-950"
          />
        </label>

        <label className="block space-y-2 text-sm font-medium">
          <span>Event time</span>
          <input
            name="startsAt"
            type="datetime-local"
            required
            min={minDateTimeInput()}
            className="w-full rounded-md border border-zinc-300 px-3 py-3 text-base outline-none focus:border-zinc-950"
          />
        </label>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Venue</h2>
          <p className="text-sm leading-6 text-zinc-600">Choose the venue for this event.</p>
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search venues"
          autoComplete="off"
          className="w-full rounded-md border border-zinc-300 px-3 py-3 text-base outline-none focus:border-zinc-950"
        />

        {filteredVenues.length === 0 ? (
          <p className="rounded-md border border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-500">
            No venues match &quot;{search.trim()}&quot;.
          </p>
        ) : (
          <div className="space-y-2">
            {filteredVenues.map((venue) => (
              <label key={venue.id} className="block cursor-pointer">
                <input
                  type="radio"
                  name="venueId"
                  value={venue.id}
                  required
                  className="peer sr-only"
                />
                <div className="rounded-lg border border-zinc-200 bg-white p-4 transition-colors peer-checked:border-zinc-950 peer-checked:ring-2 peer-checked:ring-zinc-950 peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-400">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold tracking-tight">{venue.name}</h3>
                      <p className="mt-0.5 text-sm leading-6 text-zinc-600">{venue.address}</p>
                    </div>
                    <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                      {venue.capacity} seats
                    </div>
                  </div>
                  {venue.sections.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {venue.sections.map((section) => (
                        <span
                          key={section.name}
                          className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600"
                        >
                          {section.name} · {formatPrice(section.price)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </label>
            ))}
          </div>
        )}

        <Link
          href="/admin/venues/new"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-dashed border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:border-zinc-950 hover:text-zinc-950 sm:w-auto"
        >
          + Add a new venue
        </Link>
      </section>

      {state.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-zinc-950 px-6 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-500 sm:w-auto"
      >
        {pending ? 'Creating...' : 'Create event'}
      </button>
    </form>
  );
}
