'use server';

import { revalidatePath } from 'next/cache';

import { getAdminSession } from '@/lib/auth';
import {
  cancelBooking,
  confirmBooking,
  createGuestBooking,
} from '@/lib/seat-locking';
import { bookingIdSchema, guestBookingSchema } from '@/lib/validation/bookings';

export type BookingActionState = {
  ok: boolean;
  error?: string;
};

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
  return result.ok ? { ok: true } : result;
}

export async function cancelBookingStateAction(
  _previousState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  return cancelBookingAction(formData);
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
  return result.ok ? { ok: true } : result;
}
