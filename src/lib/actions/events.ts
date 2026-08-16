'use server';

import { BookingStatus, EventStatus, SeatStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

import { getAdminSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseScheduledTime, startOfTomorrow } from '@/lib/timezone';
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
  const existing = await prisma.event.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  const taken = new Set(existing.map((event) => event.slug));

  let slug = base;
  let n = 2;
  while (taken.has(slug) && n <= 50) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return taken.has(slug) ? `${base}-${Date.now().toString(36)}` : slug;
}

function isUniqueSlugError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002' &&
    'meta' in error &&
    Array.isArray((error as { meta?: { target?: unknown } }).meta?.target) &&
    ((error as { meta?: { target?: unknown[] } }).meta?.target ?? []).includes('slug')
  );
}

const EVENT_SEAT_CLONE_TIMEOUT_MS = 15_000;

class EventNotPublishedError extends Error {
  constructor() {
    super('Event is not published.');
    this.name = 'EventNotPublishedError';
  }
}

async function createEventWithSeats(params: {
  venueId: string;
  name: string;
  startsAt: Date;
  slug: string;
}) {
  const { venueId, name, startsAt, slug } = params;

  return prisma.$transaction(
    async (tx) => {
      const event = await tx.event.create({
        data: {
          venueId,
          name,
          startsAt,
          status: EventStatus.DRAFT,
          slug,
        },
        select: { id: true },
      });

      const venueSeats = await tx.venueSeat.findMany({
        where: { venueId },
        select: { id: true, gap: true },
      });

      if (venueSeats.length > 0) {
        await tx.eventSeat.createMany({
          data: venueSeats.map((seat) => ({
            eventId: event.id,
            venueSeatId: seat.id,
            venueId,
            status: seat.gap ? SeatStatus.GAP : SeatStatus.AVAILABLE,
          })),
        });
      }
    },
    { timeout: EVENT_SEAT_CLONE_TIMEOUT_MS },
  );
}

export type EventActionState = {
  ok: boolean;
  error?: string;
  eventSlug?: string;
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
      select: { id: true, startsAt: true },
    });
    if (!event) {
      return { ok: false, error: 'Event not found.' };
    }
    if (event.startsAt <= new Date()) {
      return { ok: false, error: 'Finished events cannot be canceled.' };
    }

    await prisma.$transaction(async (tx) => {
      const eventResult = await tx.event.updateMany({
        where: { id: eventId, status: EventStatus.PUBLISHED },
        data: { status: EventStatus.CANCELED },
      });
      if (eventResult.count === 0) {
        throw new EventNotPublishedError();
      }

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
    });

    revalidatePath('/admin/events');
    revalidatePath('/admin/bookings');
    revalidatePath('/admin');
    return { ok: true };
  } catch (err) {
    if (err instanceof EventNotPublishedError) {
      return { ok: false, error: 'Only published events can be canceled.' };
    }
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
  const startsAtDate = parseScheduledTime(startsAt);
  if (Number.isNaN(startsAtDate.getTime())) {
    return { ok: false, error: 'Event time is required.' };
  }
  if (startsAtDate.getTime() <= Date.now()) {
    return { ok: false, error: 'Event time must be in the future.' };
  }
  if (startsAtDate.getTime() < startOfTomorrow().getTime()) {
    return { ok: false, error: 'Event time must be tomorrow or later.' };
  }

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true },
  });
  if (!venue) {
    return { ok: false, error: 'Venue not found.' };
  }

  const baseSlug = slugify(name);
  let slug = await resolveUniqueSlug(baseSlug);

  try {
    try {
      await createEventWithSeats({ venueId, name, startsAt: startsAtDate, slug });
    } catch (error) {
      if (!isUniqueSlugError(error)) {
        throw error;
      }
      slug = `${baseSlug}-${Date.now().toString(36)}`;
      await createEventWithSeats({ venueId, name, startsAt: startsAtDate, slug });
    }

    revalidatePath('/admin/events');
    revalidatePath('/admin');
  } catch (err) {
    console.error('Failed to create event', err);
    return { ok: false, error: 'Something went wrong creating the event.' };
  }

  return { ok: true, eventSlug: slug };
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
      select: { id: true, status: true, startsAt: true },
    });
    if (!event) {
      return { ok: false, error: 'Event not found.' };
    }
    if (event.status !== EventStatus.DRAFT) {
      return { ok: false, error: 'Only draft events can be published.' };
    }
    if (event.startsAt <= new Date()) {
      return { ok: false, error: 'Past events cannot be published.' };
    }

    const result = await prisma.event.updateMany({
      where: { id: eventId, status: EventStatus.DRAFT },
      data: { status: EventStatus.PUBLISHED },
    });
    if (result.count === 0) {
      return { ok: false, error: 'Only draft events can be published.' };
    }

    revalidatePath('/admin/events');
    revalidatePath('/admin');
    return { ok: true };
  } catch (err) {
    console.error('Failed to publish event', err);
    return { ok: false, error: 'Something went wrong publishing the event.' };
  }
}
