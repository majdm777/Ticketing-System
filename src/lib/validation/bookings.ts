import { z } from 'zod';

export const bookingIdSchema = z.object({
  bookingId: z.string().trim().min(1, 'Booking is required.'),
});

// Single source of truth for the guest-booking seat limit; the booking form
// disables selection once this many seats are picked, and the server schema
// rejects anything beyond it.
export const MAX_GUEST_BOOKING_SEATS = 10;

export const guestBookingSchema = z.object({
  eventId: z.string().trim().min(1, 'Event is required.'),
  venueSeatIds: z
    .array(z.string().trim().min(1, 'Seat is required.'))
    .min(1, 'Select at least one seat.')
    .max(
      MAX_GUEST_BOOKING_SEATS,
      `Select up to ${MAX_GUEST_BOOKING_SEATS} seats at a time.`,
    )
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Duplicate seats selected.',
    }),
  userName: z.string().trim().min(1, 'Name is required.').max(120),
  userPhone: z.string().trim().min(1, 'Phone is required.').max(40),
});

export type GuestBookingInput = z.infer<typeof guestBookingSchema>;
