import { BookingStatus } from '@prisma/client';
import Link from 'next/link';

import {
  SeatMap as VenueSeatMap,
  type SeatMapLegendItem,
  type SeatMapRow,
} from '@/components/seat-map';
import { requestGroupKey, seatLabel } from '@/lib/booking-groups';
import { formatDate } from '@/lib/format';
import { prisma } from '@/lib/prisma';
import { buildSeatMapData } from '@/lib/seat-map-data';
import { expirePastDuePendingBookings } from '@/lib/seat-locking';

import { RequestRow, type RequestGroupView } from './request-row';

const statusOptions = ['all', ...Object.values(BookingStatus)] as const;

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string | string[]; status?: string | string[] }>;
}) {
  const params = await searchParams;
  const eventId = typeof params.eventId === 'string' ? params.eventId : '';
  const selectedStatus =
    typeof params.status === 'string' &&
    statusOptions.includes(params.status as (typeof statusOptions)[number])
      ? params.status
      : 'all';

  const events = await prisma.event.findMany({
    orderBy: { startsAt: 'desc' },
    include: { venue: true },
  });

  const event = eventId
    ? await prisma.event.findUnique({
        where: { id: eventId },
        include: { venue: true },
      })
    : null;

  if (event) {
    await expirePastDuePendingBookings(event.id);
  }

  const bookings = event
    ? await prisma.booking.findMany({
        where: {
          eventId: event.id,
          ...(selectedStatus !== 'all' ? { status: selectedStatus as BookingStatus } : {}),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          eventSeat: {
            include: {
              venueSeat: { include: { section: true } },
            },
          },
        },
      })
    : [];

  const showScroll = bookings.length >= 10;

  // Collapse the per-seat rows back into one row per attendee request. The
  // input is already ordered newest-first, so Map insertion order (first
  // occurrence of each key) yields requests sorted newest-first too. See
  // requestGroupKey in src/lib/booking-groups.ts for the grouping key.
  const requestGroups: RequestGroupView[] = (() => {
    const byKey = new Map<string, (typeof bookings)[number][]>();
    for (const booking of bookings) {
      const key = requestGroupKey(booking);
      const members = byKey.get(key) ?? [];
      members.push(booking);
      byKey.set(key, members);
    }

    const groups: RequestGroupView[] = [];
    for (const members of byKey.values()) {
      members.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const rep = members[0];
      const statusCounts = new Map<string, number>();
      let totalUsd = 0;
      for (const member of members) {
        statusCounts.set(member.status, (statusCounts.get(member.status) ?? 0) + 1);
        totalUsd += member.eventSeat.venueSeat.section?.price ?? 0;
      }
      const statusText = Array.from(statusCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([status, count]) => `${count} ${status}`)
        .join(' / ');
      const hasConfirmed = statusCounts.has(BookingStatus.CONFIRMED);
      const allConfirmed =
        members.length > 0 &&
        members.every((member) => member.status === BookingStatus.CONFIRMED);
      const needsSend = members.some(
        (member) =>
          member.status === BookingStatus.CONFIRMED &&
          (member.ticketSentAt === null || member.ticketNote !== null),
      );
      const confirmedMembers = members.filter(
        (member) => member.status === BookingStatus.CONFIRMED,
      );
      const ticketSentAt = confirmedMembers.reduce<Date | null>(
        (latest, member) =>
          member.ticketSentAt && (!latest || member.ticketSentAt > latest)
            ? member.ticketSentAt
            : latest,
        null,
      );
      const ticketNote =
        confirmedMembers.find((member) => member.ticketNote !== null)?.ticketNote ?? null;
      groups.push({
        key: requestGroupKey(rep),
        representativeBookingId: rep.id,
        attendeeName: rep.userName,
        attendeePhone: rep.userPhone,
        caseType: rep.caseType,
        referenceCode: rep.referenceCode,
        totalUsd,
        statusText,
        hasPending: statusCounts.has(BookingStatus.PENDING),
        hasConfirmed,
        allConfirmed,
        needsSend,
        ticketSentAt,
        ticketNote,
        confirmedByAdmin: rep.confirmedByAdmin,
        confirmedAt: rep.confirmedAt,
        seats: members.map((member) => ({
          bookingId: member.id,
          label: seatLabel(member),
          status: member.status,
          referenceCode: member.referenceCode,
        })),
      });
    }
    return groups;
  })();

  // Whole-event occupancy for the read-only seat map. EventSeat.status is the
  // source of truth (kept in sync by booking confirm/pending/expiry flows),
  // so booked and pending seats are highlighted independently of the status
  // filter above.
  const eventSeats = event
    ? await prisma.eventSeat.findMany({
        where: { eventId: event.id },
        select: {
          id: true,
          status: true,
          venueSeat: {
            select: {
              id: true,
              row: true,
              number: true,
              section: { select: { name: true, price: true } },
            },
          },
        },
      })
    : [];

  const seatInputs = eventSeats.map((eventSeat) => ({
    id: eventSeat.id,
    venueSeatId: eventSeat.venueSeat.id,
    row: eventSeat.venueSeat.row,
    number: eventSeat.venueSeat.number,
    section: eventSeat.venueSeat.section?.name ?? '',
    status: eventSeat.status,
  }));
  const { rows: dataRows, sectionColors } = buildSeatMapData(seatInputs);

  const statusColor: Record<string, string> = {
    BOOKED: '#18181b',
    PENDING: '#f97316',
    CANCELED: '#e4e4e7',
  };

  const mapRows: SeatMapRow[] = dataRows.map((dataRow) => ({
    label: dataRow.row,
    seats: dataRow.seats.map((seat) => ({
      id: seat.id,
      number: seat.number,
      gap: seat.gap,
      color:
        seat.status === 'AVAILABLE'
          ? seat.color
          : (statusColor[seat.status] ?? '#e4e4e7'),
      ariaLabel: `${seat.section} section, row ${dataRow.row}, seat ${
        seat.number
      }, ${seat.status.toLowerCase()}`,
    })),
  }));

  const sectionsByName = new Map<string, { name: string; price: number }>();
  for (const eventSeat of eventSeats) {
    const section = eventSeat.venueSeat.section;
    if (section && !sectionsByName.has(section.name)) {
      sectionsByName.set(section.name, {
        name: section.name,
        price: section.price,
      });
    }
  }

  const legend: SeatMapLegendItem[] = [
    ...Array.from(sectionsByName.values()).map((section) => ({
      id: `section:${section.name}`,
      name: section.name,
      color: sectionColors.get(section.name) ?? '#e5e7eb',
      price: section.price,
    })),
    { id: 'booked', name: 'Booked', color: '#18181b' },
    { id: 'pending', name: 'Pending', color: '#f97316' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
          <p className="max-w-xl text-base leading-6 text-zinc-600">
            Confirm paid bookings, cancel pending holds, and review booking history.
          </p>
        </div>

        {event ? (
          <Link
            href={`/admin/bookings/new?eventId=${event.id}`}
            className="inline-flex w-full items-center justify-center rounded-md bg-zinc-950 px-4 py-3 text-sm font-medium text-white sm:w-auto"
          >
            Guest booking
          </Link>
        ) : null}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase text-zinc-500">Event</h2>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {events.map((item) => (
            <Link
              key={item.id}
              href={`/admin/bookings?eventId=${item.id}`}
              className={`inline-flex h-11 items-center whitespace-nowrap rounded-md border px-3 text-sm ${
                item.id === eventId
                  ? 'border-zinc-950 bg-white text-zinc-950'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:text-zinc-950'
              }`}
            >
              {item.name}
            </Link>
          ))}
        </div>
      </section>

      {event ? (
        <>
          <section className="rounded-lg border border-zinc-200 bg-white p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <h2 className="font-semibold tracking-tight">{event.name}</h2>
                <p className="text-sm leading-6 text-zinc-600">
                  {event.venue.name} · {formatDate(event.startsAt)}
                </p>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:pb-0">
                {statusOptions.map((status) => (
                  <Link
                    key={status}
                    href={`/admin/bookings?eventId=${event.id}&status=${status}`}
                    className={`inline-flex h-11 items-center whitespace-nowrap rounded-md border px-3 text-sm ${
                      selectedStatus === status
                        ? 'border-zinc-950 bg-zinc-950 text-white'
                        : 'border-zinc-200 text-zinc-600 hover:text-zinc-950'
                    }`}
                  >
                    {status === 'all' ? 'All' : status}
                  </Link>
                ))}
              </div>
            </div>
          </section>

          <div
            className={`space-y-3 md:hidden ${
              showScroll ? 'max-h-[560px] overflow-y-auto pb-3' : ''
            }`}
          >
            {requestGroups.map((group) => (
              <RequestRow key={group.key} group={group} variant="card" />
            ))}

            {requestGroups.length === 0 ? (
              <p className="rounded-lg border border-zinc-100 bg-white px-4 py-8 text-center text-base text-zinc-500">
                No bookings match this view.
              </p>
            ) : null}
          </div>

          <div
            className={`hidden rounded-lg border border-zinc-200 bg-white md:block ${
              showScroll ? 'max-h-[560px] overflow-y-auto' : 'overflow-hidden'
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
                {requestGroups.map((group) => (
                  <RequestRow key={group.key} group={group} variant="table" />
                ))}
              </tbody>
            </table>

            {requestGroups.length === 0 ? (
              <p className="border-t border-zinc-100 px-4 py-8 text-center text-base text-zinc-500">
                No bookings match this view.
              </p>
            ) : null}
          </div>

          <section className="rounded-lg border border-zinc-200 bg-white p-4 sm:p-5">
            <div className="mb-4 space-y-1">
              <h2 className="text-sm font-semibold uppercase text-zinc-500">
                Seat map
              </h2>
              <p className="text-sm leading-6 text-zinc-600">
                Booked seats are dark, pending holds are orange.
              </p>
            </div>
            <VenueSeatMap
              readOnly
              rows={mapRows}
              legend={legend}
              seatLayout={event.venue.seatLayout}
            />
          </section>
        </>
      ) : (
        <p className="rounded-lg border border-zinc-200 bg-white p-6 text-base leading-6 text-zinc-600">
          Pick an event to review its bookings.
        </p>
      )}
    </div>
  );
}
