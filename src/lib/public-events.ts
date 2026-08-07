import { EventStatus, SeatStatus } from '@prisma/client';

import { prisma } from './prisma';
import { buildSectionColorMap } from './section-colors';

export type PublicSeat = {
  id: string;
  venueSeatId: string;
  number: string;
  status: SeatStatus;
  label: string;
};

export type PublicSeatRow = {
  row: string;
  seats: PublicSeat[];
};

export type PublicSeatGroup = {
  section: string;
  price: number;
  color: string;
  rows: PublicSeatRow[];
};

export type PublicGapSeat = {
  id: string;
  venueSeatId: string;
  row: string;
  number: string;
};

export type PublicEvent = {
  id: string;
  name: string;
  description: string | null;
  startsAt: Date;
  slug: string;
  venue: {
    name: string;
    address: string;
  };
  seatGroups: PublicSeatGroup[];
  gapSeats: PublicGapSeat[];
};

export type PublicEndedEvent = {
  id: string;
  name: string;
  description: string | null;
  startsAt: Date;
  slug: string;
  status: EventStatus;
  venue: {
    name: string;
    address: string;
  };
  endedReason: 'canceled' | 'ended';
};

// Public visibility contract:
// - not_found — unknown slug, or an event that was never published (DRAFT).
//   Both return the identical 404; the app never reveals whether an
//   unpublished event exists at a given slug.
// - live — PUBLISHED and startsAt still in the future: details + seat map.
// - ended — was published but is now CLOSED, CANCELED, or already started:
//   details only, no selectable seats and no request form.
export type PublicEventLookup =
  | { outcome: 'not_found' }
  | { outcome: 'live'; event: PublicEvent }
  | { outcome: 'ended'; event: PublicEndedEvent };

function compareRowLabels(a: string, b: string): number {
  const aNum = Number(a);
  const bNum = Number(b);
  if (Number.isInteger(aNum) && Number.isInteger(bNum)) {
    return aNum - bNum;
  }
  return a.localeCompare(b);
}

function compareSeatNumbers(a: string, b: string): number {
  return Number(a) - Number(b) || a.localeCompare(b);
}

export async function getPublicEventBySlug(
  slug: string
): Promise<PublicEventLookup> {
  const event = await prisma.event.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      description: true,
      startsAt: true,
      slug: true,
      status: true,
      venue: { select: { name: true, address: true } },
      eventSeats: {
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
      },
    },
  });

  if (!event || event.status === EventStatus.DRAFT) {
    return { outcome: 'not_found' };
  }

  if (
    event.status === EventStatus.CLOSED ||
    event.status === EventStatus.CANCELED ||
    event.startsAt < new Date()
  ) {
    return {
      outcome: 'ended',
      event: {
        id: event.id,
        name: event.name,
        description: event.description,
        startsAt: event.startsAt,
        slug: event.slug,
        status: event.status,
        venue: event.venue,
        endedReason:
          event.status === EventStatus.CANCELED ? 'canceled' : 'ended',
      },
    };
  }

  // Gap seats have no section; collect them flat so the map can still render
  // the blocked-out positions while keeping section grouping intact.
  const gapSeats: PublicGapSeat[] = [];

  const sectionNames: string[] = [];
  for (const eventSeat of event.eventSeats) {
    const { row, number, section } = eventSeat.venueSeat;
    if (eventSeat.status === SeatStatus.GAP || !section) {
      gapSeats.push({
        id: eventSeat.id,
        venueSeatId: eventSeat.venueSeat.id,
        row,
        number,
      });
      continue;
    }
    if (!sectionNames.includes(section.name)) {
      sectionNames.push(section.name);
    }
  }
  const colors = buildSectionColorMap(sectionNames);

  const groupsBySection = new Map<string, PublicSeatGroup>();
  for (const eventSeat of event.eventSeats) {
    const { row, number, section } = eventSeat.venueSeat;
    if (eventSeat.status === SeatStatus.GAP || !section) continue;

    let group = groupsBySection.get(section.name);
    if (!group) {
      group = {
        section: section.name,
        price: section.price,
        color: colors.get(section.name) ?? '#e5e7eb',
        rows: [],
      };
      groupsBySection.set(section.name, group);
    }

    let rowEntry = group.rows.find((entry) => entry.row === row);
    if (!rowEntry) {
      rowEntry = { row, seats: [] };
      group.rows.push(rowEntry);
    }

    rowEntry.seats.push({
      id: eventSeat.id,
      venueSeatId: eventSeat.venueSeat.id,
      number,
      status: eventSeat.status,
      label: number,
    });
  }

  const seatGroups = Array.from(groupsBySection.values());
  for (const group of seatGroups) {
    group.rows.sort((a, b) => compareRowLabels(a.row, b.row));
    for (const row of group.rows) {
      row.seats.sort((a, b) => compareSeatNumbers(a.number, b.number));
    }
  }

  return {
    outcome: 'live',
    event: {
      id: event.id,
      name: event.name,
      description: event.description,
      startsAt: event.startsAt,
      slug: event.slug,
      venue: event.venue,
      seatGroups,
      gapSeats,
    },
  };
}
