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
};

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

export async function getPublicEventBySlug(slug: string): Promise<PublicEvent | null> {
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

  if (!event || event.status !== EventStatus.PUBLISHED) {
    return null;
  }

  const sectionNames = event.eventSeats.map((eventSeat) => eventSeat.venueSeat.section.name);
  const colors = buildSectionColorMap(sectionNames);

  const groupsBySection = new Map<string, PublicSeatGroup>();
  for (const eventSeat of event.eventSeats) {
    const { row, number, section } = eventSeat.venueSeat;

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
    id: event.id,
    name: event.name,
    description: event.description,
    startsAt: event.startsAt,
    slug: event.slug,
    venue: event.venue,
    seatGroups,
  };
}
