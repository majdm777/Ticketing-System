import { z } from 'zod';

export const bookingIdSchema = z.object({
  bookingId: z.string().trim().min(1, 'Booking is required.'),
});

// Phone numbers identify the attendee and are the target for WhatsApp ticket
// delivery (docs/event-ticketing-flow.md), so require a real phone shape, not
// just a non-empty string: a leading `+` or `(` allowed, digits plus common
// separators only, and 7–15 digits (the E.164 range).
const phoneDigits = (value: string) => value.replace(/\D/g, '');

export const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Phone is required.')
  .max(40)
  .superRefine((value, ctx) => {
    const digits = phoneDigits(value);
    const valid =
      /^[+0-9(][0-9 ()+\-.]*$/.test(value) &&
      digits.length >= 7 &&
      digits.length <= 15;
    if (!valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a valid phone number (e.g. +15550123456).',
      });
    }
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
  userPhone: phoneSchema,
});

export type GuestBookingInput = z.infer<typeof guestBookingSchema>;

// Public (attendee-facing) seat request. `caseType` is restricted to the two
// attendee-facing cases — GUEST is admin-only and is never accepted here.
// One booking is created per seat, so multiple seats arrive as an array.
export const MAX_PUBLIC_BOOKING_SEATS = 8;

export const publicRequestSchema = z.object({
  eventId: z.string().trim().min(1, 'Event is required.'),
  eventSeatIds: z
    .array(z.string().trim().min(1, 'Seat is required.'))
    .min(1, 'Select at least one seat.')
    .max(
      MAX_PUBLIC_BOOKING_SEATS,
      `Select up to ${MAX_PUBLIC_BOOKING_SEATS} seats at a time.`,
    )
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Duplicate seats selected.',
    }),
  userName: z.string().trim().min(1, 'Name is required.').max(120),
  userPhone: phoneSchema,
  caseType: z.enum(['ONLINE_CODE', 'PAY_AT_DOOR'], {
    message: 'Invalid booking type.',
  }),
});

export type PublicRequestInput = z.infer<typeof publicRequestSchema>;
