'use server';

import { revalidatePath } from 'next/cache';

import { getAdminSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  cancelBooking,
  cancelBookingGroup,
  confirmBooking,
  confirmBookingGroup,
  createGuestBooking,
  EventNotBookableError,
  InvalidSeatError,
  requestSeats,
  SeatHoldLimitError,
  SeatUnavailableError,
} from '@/lib/seat-locking';
import {
  bookingIdSchema,
  guestBookingSchema,
  publicRequestSchema,
} from '@/lib/validation/bookings';

export type BookingActionState = {
  ok: boolean;
  error?: string;
};

export type RequestSeatActionState =
  | {
      ok: true;
      bookings: Array<{ bookingId: string; eventSeatId: string }>;
      referenceCode?: string;
    }
  | { ok: false; error: string };

function formValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? '');
}

export async function confirmBookingAction(formData: FormData): Promise<BookingActionState> {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false, error: 'Unauthorized.' };
  }

  const parsed = bookingIdSchema.safeParse({
    bookingId: formValue(formData, 'bookingId'),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid booking.' };
  }

  const result = await confirmBooking({
    bookingId: parsed.data.bookingId,
    adminId: session.adminName,
  });

  revalidatePath('/admin/bookings');
  revalidatePath('/admin');
  return result.ok ? { ok: true } : result;
}

export async function confirmBookingStateAction(
  _previousState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  return confirmBookingAction(formData);
}

export async function cancelBookingAction(formData: FormData): Promise<BookingActionState> {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false, error: 'Unauthorized.' };
  }

  const parsed = bookingIdSchema.safeParse({
    bookingId: formValue(formData, 'bookingId'),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid booking.' };
  }

  const result = await cancelBooking({ bookingId: parsed.data.bookingId });

  revalidatePath('/admin/bookings');
  revalidatePath('/admin');
  return result.ok ? { ok: true } : result;
}

export async function cancelBookingStateAction(
  _previousState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  return cancelBookingAction(formData);
}

// Group variants: `bookingId` is any member of the request — confirm/cancel
// acts on every still-PENDING booking of the group (see seat-locking).
export async function confirmBookingGroupAction(
  formData: FormData,
): Promise<BookingActionState> {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false, error: 'Unauthorized.' };
  }

  const parsed = bookingIdSchema.safeParse({
    bookingId: formValue(formData, 'bookingId'),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request.' };
  }

  const result = await confirmBookingGroup({
    bookingId: parsed.data.bookingId,
    adminId: session.adminName,
  });

  revalidatePath('/admin/bookings');
  revalidatePath('/admin');
  return result.ok ? { ok: true } : result;
}

export async function confirmBookingGroupStateAction(
  _previousState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  return confirmBookingGroupAction(formData);
}

export async function cancelBookingGroupAction(
  formData: FormData,
): Promise<BookingActionState> {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false, error: 'Unauthorized.' };
  }

  const parsed = bookingIdSchema.safeParse({
    bookingId: formValue(formData, 'bookingId'),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request.' };
  }

  const result = await cancelBookingGroup({ bookingId: parsed.data.bookingId });

  revalidatePath('/admin/bookings');
  revalidatePath('/admin');
  return result.ok ? { ok: true } : result;
}

export async function cancelBookingGroupStateAction(
  _previousState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  return cancelBookingGroupAction(formData);
}

export async function createGuestBookingAction(
  _previousState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false, error: 'Unauthorized.' };
  }

  const parsed = guestBookingSchema.safeParse({
    eventId: formValue(formData, 'eventId'),
    venueSeatIds: formData.getAll('venueSeatIds').map(String),
    userName: formValue(formData, 'userName'),
    userPhone: formValue(formData, 'userPhone'),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid guest booking.' };
  }

  const result = await createGuestBooking({
    ...parsed.data,
    adminId: session.adminName,
  });

  revalidatePath('/admin/bookings');
  revalidatePath('/admin/bookings/new');
  revalidatePath('/admin');
  return result.ok ? { ok: true } : result;
}

// Public attendee request — no session. The event-bookability guard lives in
// the seat-locking transaction, so this action is safe even if the page never
// rendered. On success or a domain failure we revalidate the event page so the
// seat map re-renders with fresh state (a taken seat shows as taken) in the
// same roundtrip. The revalidation path uses the server-side event slug, not
// the client-provided one, so a stale or tampered slug cannot keep a booked
// event's seat map stale.
export async function requestSeatAction(
  formData: FormData,
): Promise<RequestSeatActionState> {
  const parsed = publicRequestSchema.safeParse({
    eventId: formValue(formData, 'eventId'),
    eventSeatIds: formData.getAll('eventSeatIds').map(String),
    userName: formValue(formData, 'userName'),
    userPhone: formValue(formData, 'userPhone'),
    caseType: formValue(formData, 'caseType'),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request.' };
  }

  const { caseType, eventSeatIds, ...attendee } = parsed.data;

  const event = await prisma.event.findUnique({
    where: { id: parsed.data.eventId },
    select: { slug: true },
  });
  const slug = event?.slug ?? null;

  try {
    const created = await requestSeats({
      ...attendee,
      eventSeatIds,
      caseType,
    });

    if (slug) {
      revalidatePath(`/e/${slug}`);
    }

    return {
      ok: true,
      bookings: created.bookings.map((booking) => ({
        bookingId: booking.id,
        eventSeatId: booking.eventSeatId,
      })),
      ...(created.referenceCode ? { referenceCode: created.referenceCode } : {}),
    };
  } catch (error) {
    if (slug) {
      revalidatePath(`/e/${slug}`);
    }

    if (error instanceof SeatUnavailableError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof InvalidSeatError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof EventNotBookableError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof SeatHoldLimitError) {
      return { ok: false, error: error.message };
    }

    console.error('Failed to request seat', error);
    return { ok: false, error: 'We could not request this seat right now. Please try again.' };
  }
}

export async function requestSeatStateAction(
  _previousState: RequestSeatActionState,
  formData: FormData,
): Promise<RequestSeatActionState> {
  return requestSeatAction(formData);
}
