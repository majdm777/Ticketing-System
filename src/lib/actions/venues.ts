'use server';

import { revalidatePath } from 'next/cache';

import { getAdminSession } from '@/lib/auth';
import { createVenue } from '@/lib/venues';
import { createVenueSchema, type CreateVenueInput } from '@/lib/validation/venues';
import { venueIdSchema } from '@/lib/validation/venues';
import { deleteVenue } from '@/lib/venues';


export type VenueActionState = {
  ok: boolean;
  error?: string;
  venueId?: string;
  seatCount?: number;
};

function formValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? '');
}

export type DeleteVenueState = {
  ok: boolean;
  error?: string;
};

export async function deleteVenueAction(formData: FormData): Promise<DeleteVenueState> {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false, error: 'Unauthorized.' };
  }

  const parsed = venueIdSchema.safeParse({
    venueId: formValue(formData, 'venueId'),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid venue.' };
  }

  const result = await deleteVenue(parsed.data.venueId);

  if (result.ok) {
    revalidatePath('/admin/venues');
  }

  return result;
}



export async function createVenueAction(input: CreateVenueInput): Promise<VenueActionState> {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false, error: 'Unauthorized.' };
  }

  const parsed = createVenueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid venue details.' };
  }

  const result = await createVenue(parsed.data);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath('/admin/venues');
  return { ok: true, venueId: result.data.venueId, seatCount: result.data.seatCount };
}