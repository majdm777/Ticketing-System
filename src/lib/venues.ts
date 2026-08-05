import { prisma } from './prisma';
import type { CreateVenueInput } from './validation/venues';
import { Prisma } from '@prisma/client';

type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function createVenue(
  input: CreateVenueInput
): Promise<ActionResult<{ venueId: string; seatCount: number }>> {
  const { seats, sections } = input;

  if (seats.length === 0) {
    return { ok: false, error: 'At least one seat is required.' };
  }

  const sectionNames = new Set(sections.map((s) => s.name));
  for (const seat of seats) {
    if (!sectionNames.has(seat.section)) {
      return {
        ok: false,
        error: `Seat ${seat.row}${seat.number} references a section ("${seat.section}") that has no price.`,
      };
    }
  }

  // Guard against duplicate (row, number, section) combos before hitting
  // the database — cheaper and clearer than letting the @@unique
  // constraint on VenueSeat reject the whole batch with a raw DB error.
  const seenKeys = new Set<string>();
  for (const seat of seats) {
    const key = JSON.stringify([seat.row, seat.number, seat.section]);
    if (seenKeys.has(key)) {
      return {
        ok: false,
        error: `Duplicate seat detected: row ${seat.row}, seat ${seat.number}, section "${seat.section}".`,
      };
    }
    seenKeys.add(key);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const venue = await tx.venue.create({
        data: {
          name: input.name,
          address: input.address,
          sections: {
            create: sections.map((s) => ({ name: s.name, price: s.price })),
          },
        },
        select: { id: true },
      });

      const createdSections = await tx.venueSection.findMany({
        where: { venueId: venue.id },
        select: { id: true, name: true },
      });
      const sectionIdByName = new Map(createdSections.map((s) => [s.name, s.id]));

      await tx.venueSeat.createMany({
        data: seats.map((seat) => ({
          venueId: venue.id,
          row: seat.row,
          number: seat.number,
          sectionId: sectionIdByName.get(seat.section) ?? '',
        })),
      });

      return { ok: true, data: { venueId: venue.id, seatCount: seats.length } };
    });
  } catch (err) {
    console.error('Failed to create venue', err);
    return { ok: false, error: 'Something went wrong creating the venue.' };
  }
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
