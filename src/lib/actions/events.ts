'use server';

import { BookingStatus, EventStatus, SeatStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getAdminSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createEventSchema, eventIdSchema } from '@/lib/validation/events';

function slugify(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'event';
}

async function resolveUniqueSlug(base: string) {
  let slug = base;
  let n = 2;
  while (n <= 50) {
    const existing = await prisma.event.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) {
      return slug;
    }
    slug = `${base}-${n}`;
    n += 1;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export type EventActionState = {
  ok: boolean;
  error?: string;
};

function formValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? '');
}

export async function cancelEventAction(formData: FormData): Promise<EventActionState> {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false, error: 'Unauthorized.' };
  }

  const parsed = eventIdSchema.safeParse({
    eventId: formValue(formData, 'eventId'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid event.' };
  }

  const eventId = parsed.data.eventId;

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, status: true },
    });
    if (!event) {
      return { ok: false, error: 'Event not found.' };
    }
    if (event.status !== EventStatus.PUBLISHED) {
      return { ok: false, error: 'Only published events can be canceled.' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.eventSeat.updateMany({
        where: { eventId },
        data: {
          status: SeatStatus.CANCELED,
          bookedByName: null,
          bookedByPhone: null,
          referenceCode: null,
          pendingSince: null,
          expiresAt: null,
        },
      });

      await tx.booking.updateMany({
        where: {
          eventId,
          status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        },
        data: { status: BookingStatus.CANCELLED, cancelledAt: new Date() },
      });

      await tx.event.update({
        where: { id: eventId },
        data: { status: EventStatus.CANCELED },
      });
    });

    revalidatePath('/admin/events');
    revalidatePath('/admin/bookings');
    return { ok: true };
  } catch (err) {
    console.error('Failed to cancel event', err);
    return { ok: false, error: 'Something went wrong canceling the event.' };
  }
}

export async function createEventAction(
  _previousState: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false, error: 'Unauthorized.' };
  }

  const parsed = createEventSchema.safeParse({
    name: formValue(formData, 'name'),
    startsAt: formValue(formData, 'startsAt'),
    venueId: formValue(formData, 'venueId'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid event details.' };
  }

  const { name, startsAt, venueId } = parsed.data;
  const startsAtDate = new Date(startsAt);
  if (Number.isNaN(startsAtDate.getTime())) {
    return { ok: false, error: 'Event time is required.' };
  }
  if (startsAtDate.getTime() <= Date.now()) {
    return { ok: false, error: 'Event time must be in the future.' };
  }
  const now = new Date();
  const earliest = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (startsAtDate.getTime() < earliest.getTime()) {
    return { ok: false, error: 'Event time must be tomorrow or later.' };
  }

  try {
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true },
    });
    if (!venue) {
      return { ok: false, error: 'Venue not found.' };
    }

    const slug = await resolveUniqueSlug(slugify(name));

    await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          venueId,
          name,
          startsAt: startsAtDate,
          status: EventStatus.DRAFT,
          slug,
        },
        select: { id: true },
      });

      const venueSeats = await tx.venueSeat.findMany({
        where: { venueId },
        select: { id: true },
      });

      if (venueSeats.length > 0) {
        await tx.eventSeat.createMany({
          data: venueSeats.map((seat) => ({
            eventId: event.id,
            venueSeatId: seat.id,
            venueId,
            status: SeatStatus.AVAILABLE,
          })),
        });
      }
    });

    revalidatePath('/admin/events');
    revalidatePath('/admin');
  } catch (err) {
    console.error('Failed to create event', err);
    return { ok: false, error: 'Something went wrong creating the event.' };
  }

  redirect('/admin/events');
}

export async function publishEventAction(formData: FormData): Promise<EventActionState> {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false, error: 'Unauthorized.' };
  }

  const parsed = eventIdSchema.safeParse({
    eventId: formValue(formData, 'eventId'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid event.' };
  }

  const eventId = parsed.data.eventId;

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, status: true },
    });
    if (!event) {
      return { ok: false, error: 'Event not found.' };
    }
    if (event.status !== EventStatus.DRAFT) {
      return { ok: false, error: 'Only draft events can be published.' };
    }

    await prisma.event.update({
      where: { id: eventId },
      data: { status: EventStatus.PUBLISHED },
    });

    revalidatePath('/admin/events');
    return { ok: true };
  } catch (err) {
    console.error('Failed to publish event', err);
    return { ok: false, error: 'Something went wrong publishing the event.' };
  }
}
