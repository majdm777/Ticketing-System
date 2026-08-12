import { EventStatus } from '@prisma/client';
import Link from 'next/link';

import { formatPrice } from '@/lib/currency';
import { getEventsWithStats, type EventWithStats } from '@/lib/events';
import { formatDate } from '@/lib/format';
import { expirePastDuePendingBookings } from '@/lib/seat-locking';

import { CopyLinkButton } from './copy-link-button';
import { EventActions } from './event-actions';
import { EventSection } from './event-section';

const statusStyles: Record<EventStatus, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-600',
  PUBLISHED: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-zinc-200 text-zinc-500',
  CANCELED: 'bg-red-100 text-red-700',
};

type EventGroup = {
  key: string;
  title: string;
  events: EventWithStats[];
};

export default async function AdminEventsPage() {
  await expirePastDuePendingBookings();

  const events = await getEventsWithStats();

  const groups: EventGroup[] = [
    {
      key: 'published',
      title: 'Published',
      events: events.filter((e) => !e.isFinished && e.status === EventStatus.PUBLISHED),
    },
    {
      key: 'draft',
      title: 'Draft',
      events: events.filter((e) => !e.isFinished && e.status === EventStatus.DRAFT),
    },
    {
      key: 'finished',
      title: 'Finished',
      events: events.filter((e) => e.isFinished && e.status !== EventStatus.CANCELED),
    },
    {
      key: 'canceled',
      title: 'Canceled',
      events: events.filter((e) => e.status === EventStatus.CANCELED),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <p className="max-w-xl text-base leading-6 text-zinc-600">
            Manage your events, seat availability, and revenue.
          </p>
        </div>
        <Link
          href="/admin/events/new"
          className="inline-flex w-full items-center justify-center rounded-md bg-zinc-950 px-4 py-3 text-sm font-medium text-white sm:w-auto"
        >
          + Add Event
        </Link>
      </div>

      {groups.map((group) => (
        <EventSection
          key={group.key}
          title={group.title}
          count={group.events.length}
          storageKey={`admin-events-${group.key}`}
        >
          {group.events.length === 0 ? (
            <p className="rounded-lg border border-zinc-100 bg-white px-4 py-8 text-center text-base text-zinc-500">
              No {group.title.toLowerCase()} events.
            </p>
          ) : (
            <div className="space-y-3">
              {group.events.map((event) => (
                <article
                  key={event.id}
                  className="rounded-lg border border-zinc-200 bg-white p-4 sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold tracking-tight">{event.name}</h3>
                      <p className="text-sm leading-6 text-zinc-600">
                        {event.venue.name} · {formatDate(event.startsAt)}
                      </p>
                    </div>
                    <span
                      className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${statusStyles[event.status]}`}
                    >
                      {event.status}
                    </span>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {[
                      { label: 'Seats', value: String(event.totalSeats) },
                      { label: 'Available', value: String(event.available) },
                      { label: 'Pending', value: String(event.pending) },
                      { label: 'Booked', value: String(event.booked) },
                      { label: 'Revenue', value: formatPrice(event.revenue) },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-md border border-zinc-200 px-3 py-2">
                        <dt className="text-xs uppercase tracking-wide text-zinc-500">
                          {stat.label}
                        </dt>
                        <dd className="text-lg font-semibold text-zinc-900">{stat.value}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Link
                      href={`/admin/bookings?eventId=${event.id}`}
                      className="inline-flex h-11 w-full items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100 sm:w-auto"
                    >
                      View bookings
                    </Link>
                    {event.isFinished || event.status === EventStatus.CANCELED ? (
                      <>
                        <button
                          type="button"
                          disabled
                          className="inline-flex h-11 w-full cursor-not-allowed items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 px-4 text-sm font-medium text-zinc-400 sm:w-auto"
                        >
                          Book a guest
                        </button>
                        <p className="w-full text-sm leading-6 text-zinc-500 sm:w-auto sm:self-center">
                          Guest booking is unavailable for finished or canceled events.
                        </p>
                      </>
                    ) : (
                      <Link
                        href={`/admin/bookings/new?eventId=${event.id}`}
                        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white sm:w-auto"
                      >
                        Book a guest
                      </Link>
                    )}
                    <EventActions
                      eventId={event.id}
                      eventName={event.name}
                      status={event.status}
                      isFinished={event.isFinished}
                    />
                    {event.status === EventStatus.PUBLISHED ? (
                      <CopyLinkButton slug={event.slug} />
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </EventSection>
      ))}
    </div>
  );
}
