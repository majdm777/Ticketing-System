import { prisma } from './prisma';
import type { CreateVenueInput, SeatInput, SectionInput, UpdateVenueInput } from './validation/venues';
import { Prisma } from '@prisma/client';

type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type SectionsAndSeats = {
  sections: SectionInput[];
  seats: SeatInput[];
};

// Guards shared by create and update: every seat must point at a section
// that has a price, and no duplicate (row, number, section) combos. Cheaper
// and clearer than letting the @@unique constraint on VenueSeat reject the
// whole batch with a raw DB error.
function validateSectionsAndSeats(input: SectionsAndSeats): string | null {
  const { sections, seats } = input;

  if (seats.length === 0) {
    return 'At least one seat is required.';
  }

  const sectionNames = new Set(sections.map((s) => s.name));
  for (const seat of seats) {
    if (!sectionNames.has(seat.section)) {
      return `Seat ${seat.row}${seat.number} references a section ("${seat.section}") that has no price.`;
    }
  }

  const seenKeys = new Set<string>();
  for (const seat of seats) {
    const key = JSON.stringify([seat.row, seat.number, seat.section]);
    if (seenKeys.has(key)) {
      return `Duplicate seat detected: row ${seat.row}, seat ${seat.number}, section "${seat.section}".`;
    }
    seenKeys.add(key);
  }

  return null;
}

async function createSectionsAndSeats(
  tx: Prisma.TransactionClient,
  venueId: string,
  input: SectionsAndSeats
) {
  await tx.venueSection.createMany({
    data: input.sections.map((s) => ({ venueId, name: s.name, price: s.price })),
  });

  const createdSections = await tx.venueSection.findMany({
    where: { venueId },
    select: { id: true, name: true },
  });
  const sectionIdByName = new Map(createdSections.map((s) => [s.name, s.id]));

  await tx.venueSeat.createMany({
    data: input.seats.map((seat) => ({
      venueId,
      row: seat.row,
      number: seat.number,
      sectionId: sectionIdByName.get(seat.section) ?? '',
    })),
  });
}

export async function createVenue(
  input: CreateVenueInput
): Promise<ActionResult<{ venueId: string; seatCount: number }>> {
  const guardError = validateSectionsAndSeats(input);
  if (guardError) {
    return { ok: false, error: guardError };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const venue = await tx.venue.create({
        data: {
          name: input.name,
          address: input.address,
        },
        select: { id: true },
      });

      await createSectionsAndSeats(tx, venue.id, input);

      return { ok: true, data: { venueId: venue.id, seatCount: input.seats.length } };
    });
  } catch (err) {
    console.error('Failed to create venue', err);
    return { ok: false, error: 'Something went wrong creating the venue.' };
  }
}

export async function updateVenue(
  venueId: string,
  input: UpdateVenueInput
): Promise<ActionResult<{ venueId: string; seatCount: number }>> {
  const guardError = validateSectionsAndSeats(input);
  if (guardError) {
    return { ok: false, error: guardError };
  }

  try {
    const eventCount = await prisma.event.count({ where: { venueId } });
    if (eventCount > 0) {
      return {
        ok: false,
        error: `Can't edit this venue's layout — it has ${eventCount} event${
          eventCount === 1 ? '' : 's'
        } using it. Remove those events first.`,
      };
    }

    return await prisma.$transaction(async (tx) => {
      // Full rebuild. Safe because editing is blocked once events exist, so
      // nothing references these seats/sections yet.
      await tx.venueSeat.deleteMany({ where: { venueId } });
      await tx.venueSection.deleteMany({ where: { venueId } });

      await createSectionsAndSeats(tx, venueId, input);

      return { ok: true, data: { venueId, seatCount: input.seats.length } };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return { ok: false, error: 'Venue not found.' };
    }
    console.error('Failed to update venue', err);
    return { ok: false, error: 'Something went wrong updating the venue.' };
  }
}

export type VenueForEdit = {
  id: string;
  name: string;
  address: string;
  hasEvents: boolean;
  builderData: {
    name: string;
    address: string;
    rows: { id: string; label: string; seatCount: number }[];
    assignments: Record<string, string>;
    sectionPrices: Record<string, string>;
    gPrice: string;
  };
};

export async function getVenueForEdit(venueId: string): Promise<VenueForEdit | null> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      id: true,
      name: true,
      address: true,
      _count: { select: { events: true } },
      sections: {
        select: { name: true, price: true },
        orderBy: { name: 'asc' },
      },
      seats: {
        select: {
          row: true,
          number: true,
          section: { select: { name: true } },
        },
        orderBy: [{ row: 'asc' }, { number: 'asc' }],
      },
    },
  });

  if (!venue) {
    return null;
  }

  const sectionPrices: Record<string, string> = {};
  let gPrice = '';
  for (const section of venue.sections) {
    const price = String(section.price);
    if (section.name === 'G') {
      gPrice = price;
    } else {
      sectionPrices[section.name] = price;
    }
  }

  const seatsByRow = new Map<string, number[]>();
  for (const seat of venue.seats) {
    const number = Number(seat.number);
    if (!Number.isInteger(number) || number < 1) continue;
    const numbers = seatsByRow.get(seat.row);
    if (numbers) {
      numbers.push(number);
    } else {
      seatsByRow.set(seat.row, [number]);
    }
  }

  const rows = Array.from(seatsByRow.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((label, index) => {
      const numbers = seatsByRow.get(label) ?? [];
      return {
        id: `row-${index + 1}`,
        label,
        seatCount: numbers.length > 0 ? Math.max(...numbers) : 0,
      };
    });

  const rowIdByLabel = new Map(rows.map((row) => [row.label, row.id]));

  const assignments: Record<string, string> = {};
  for (const seat of venue.seats) {
    const rowId = rowIdByLabel.get(seat.row);
    const number = Number(seat.number);
    if (!rowId || !Number.isInteger(number) || number < 1) continue;
    assignments[`${rowId}__${number}`] = seat.section.name;
  }

  return {
    id: venue.id,
    name: venue.name,
    address: venue.address,
    hasEvents: venue._count.events > 0,
    builderData: {
      name: venue.name,
      address: venue.address,
      rows,
      assignments,
      sectionPrices,
      gPrice,
    },
  };
}

export async function deleteVenue(venueId: string): Promise<ActionResult> {
  
  try{
    const eventCount = await prisma.event.count({ where: { venueId } });

  if (eventCount > 0) {
        return {
        ok: false,
        error: `Can't delete this venue — it has ${eventCount} event${
            eventCount === 1 ? '' : 's'
        } using it. Remove those events first.`,
        };
    }
    }catch(err){
        console.error('Failed to delete venue', err);
        return { ok: false, error: 'Something went wrong deleting the venue.' };
    }
  try {
    await prisma.venue.delete({ where: { id: venueId } });
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      return {
        ok: false,
        error: "Can't delete this venue — it still has events using it. Remove those events first.",
      };
    }
    console.error('Failed to delete venue', err);
    return { ok: false, error: 'Something went wrong deleting the venue.' };
  }
}
