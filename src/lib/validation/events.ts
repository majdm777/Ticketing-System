import { z } from 'zod';

export const eventIdSchema = z.object({
  eventId: z.string().trim().min(1, 'Event is required.'),
});

export const createEventSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Event name is required.')
    .max(120, 'Event name must be 120 characters or fewer.'),
  startsAt: z.string().trim().min(1, 'Event time is required.'),
  venueId: z.string().trim().min(1, 'Choose a venue.'),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
