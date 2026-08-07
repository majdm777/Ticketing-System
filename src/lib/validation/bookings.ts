import { z } from 'zod';

export const bookingIdSchema = z.object({
  bookingId: z.string().trim().min(1, 'Booking is required.'),
});

export const guestBookingSchema = z.object({
  eventId: z.string().trim().min(1, 'Event is required.'),
  venueSeatIds: z
    .array(z.string().trim().min(1, 'Seat is required.'))
    .min(1, 'Select at least one seat.')
    .max(10, 'Select up to 10 seats at a time.')
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Duplicate seats selected.',
    }),
  userName: z.string().trim().min(1, 'Name is required.').max(120),
  userPhone: z.string().trim().min(1, 'Phone is required.').max(40),
});

export type GuestBookingInput = z.infer<typeof guestBookingSchema>;
