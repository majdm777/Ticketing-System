import { z } from 'zod';

const seatSchema = z
  .object({
    row: z.string().trim().min(1).max(10),
    number: z.string().trim().min(1).max(10),
    section: z.string().trim().min(1).max(60).optional(),
    gap: z.boolean().optional(),
  })
  .refine((seat) => Boolean(seat.gap) !== Boolean(seat.section), {
    message: 'A seat is either a gap (no section) or belongs to a section — not both.',
  });

const sectionSchema = z.object({
  name: z.string().trim().min(1, 'Section name is required.').max(60),
  price: z.number().int('Section price must be a whole-dollar amount.').positive('Section price must be greater than zero.'),
});

export const createVenueSchema = z.object({
  name: z.string().trim().min(1, 'Venue name is required.').max(150),
  address: z.string().trim().min(1, 'Address is required.').max(300),
  seatLayout: z.enum(['ODD_EVEN', 'IN_ORDER']).default('ODD_EVEN'),
  sections: z.array(sectionSchema).min(1, 'At least one section is required.'),
  seats: z.array(seatSchema).min(1, 'At least one seat is required.'),
});

export type CreateVenueInput = z.infer<typeof createVenueSchema>;
export type SeatInput = z.infer<typeof seatSchema>;
export type SectionInput = z.infer<typeof sectionSchema>;

export const updateVenueSchema = z.object({
  seatLayout: z.enum(['ODD_EVEN', 'IN_ORDER']).default('ODD_EVEN'),
  sections: z.array(sectionSchema).min(1, 'At least one section is required.'),
  seats: z.array(seatSchema).min(1, 'At least one seat is required.'),
});

export type UpdateVenueInput = z.infer<typeof updateVenueSchema>;

export const venueIdSchema = z.object({
  venueId: z.string().trim().min(1, 'Venue is required.'),
});
