import { z } from 'zod';

const seatSchema = z.object({
  row: z.string().trim().min(1).max(10),
  number: z.string().trim().min(1).max(10),
  section: z.string().trim().min(1).max(60),
});

export const createVenueSchema = z.object({
  name: z.string().trim().min(1, 'Venue name is required.').max(150),
  address: z.string().trim().min(1, 'Address is required.').max(300),
  seats: z.array(seatSchema).min(1, 'At least one seat is required.'),
});

export type CreateVenueInput = z.infer<typeof createVenueSchema>;
export type SeatInput = z.infer<typeof seatSchema>;

export const venueIdSchema = z.object({
  venueId: z.string().trim().min(1, 'Venue is required.'),
});