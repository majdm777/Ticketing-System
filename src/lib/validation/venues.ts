import { z } from 'zod';

const seatSchema = z.object({
  row: z.string().trim().min(1).max(10),
  number: z.string().trim().min(1).max(10),
  section: z.string().trim().min(1).max(60).optional(),
  gap: z.boolean().optional(),
});

const sectionSchema = z.object({
  name: z.string().trim().min(1, 'Section name is required.').max(60),
  price: z.number().int('Section price must be a whole-dollar amount.').positive('Section price must be greater than zero.'),
});

export const createVenueSchema = z.object({
  name: z.string().trim().min(1, 'Venue name is required.').max(150),
  address: z.string().trim().min(1, 'Address is required.').max(300),
  sections: z.array(sectionSchema).min(1, 'At least one section is required.'),
  seats: z.array(seatSchema).min(1, 'At least one seat is required.'),
});

export type CreateVenueInput = z.infer<typeof createVenueSchema>;
export type SeatInput = z.infer<typeof seatSchema>;
export type SectionInput = z.infer<typeof sectionSchema>;

export const updateVenueSchema = z.object({
  sections: z.array(sectionSchema).min(1, 'At least one section is required.'),
  seats: z.array(seatSchema).min(1, 'At least one seat is required.'),
});

export type UpdateVenueInput = z.infer<typeof updateVenueSchema>;

export const venueIdSchema = z.object({
  venueId: z.string().trim().min(1, 'Venue is required.'),
});
