'use server';

import { revalidatePath } from 'next/cache';

import { getAdminSession } from '@/lib/auth';
import { createVenue, deleteVenue, updateVenue } from '@/lib/venues';
import {
  createVenueSchema,
  type CreateVenueInput,
  type UpdateVenueInput,
  updateVenueSchema,
  venueIdSchema,
} from '@/lib/validation/venues';


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

export async function updateVenueAction(
  venueId: string,
  input: UpdateVenueInput
): Promise<VenueActionState> {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false, error: 'Unauthorized.' };
  }

  const parsedVenueId = venueIdSchema.safeParse({ venueId });
  if (!parsedVenueId.success) {
    return { ok: false, error: parsedVenueId.error.issues[0]?.message ?? 'Invalid venue.' };
  }

  const parsed = updateVenueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid venue details.' };
  }

  const result = await updateVenue(parsedVenueId.data.venueId, parsed.data);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath('/admin/venues');
  return { ok: true, venueId: result.data.venueId, seatCount: result.data.seatCount };
}