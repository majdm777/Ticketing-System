import { z } from 'zod';

export const bookingIdSchema = z.object({
  bookingId: z.string().trim().min(1, 'Booking is required.'),
});

export const guestBookingSchema = z.object({
  eventId: z.string().trim().min(1, 'Event is required.'),
  venueSeatId: z.string().trim().min(1, 'Seat is required.'),
  userName: z.string().trim().min(1, 'Name is required.').max(120),
  userPhone: z.string().trim().min(1, 'Phone is required.').max(40),
});

export type GuestBookingInput = z.infer<typeof guestBookingSchema>;
