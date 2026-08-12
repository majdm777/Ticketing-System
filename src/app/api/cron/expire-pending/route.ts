import crypto from 'crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { env } from '@/lib/env';
import { expirePastDuePendingBookings } from '@/lib/seat-locking';

const UNAUTHORIZED_BODY = { ok: false, error: 'Unauthorized' } as const;
const FAILURE_BODY = { ok: false, error: 'Expiry sweep failed.' } as const;

// Exact `Bearer <token>` shape: one space, non-empty token, nothing after.
// Rejects `Bearer` alone, an empty or space-containing token, and any other
// scheme. Validation happens before any secret comparison or DB access.
const bearerTokenSchema = z
  .string()
  .regex(/^Bearer \S+$/)
  .transform((header) => header.slice('Bearer '.length));

// Protected scheduled sweep (docs/cron-expiry-sweep.md). GET exists solely so
// Vercel Cron can reach it; GitHub Actions and external schedulers use POST.
// Both methods share the same CRON_SECRET check and run the same global sweep.
function isAuthorized(request: Request): boolean {
  if (!env.cronSecret) {
    return false;
  }

  const parsed = bearerTokenSchema.safeParse(
    request.headers.get('authorization'),
  );
  if (!parsed.success) {
    return false;
  }

  const candidate = Buffer.from(parsed.data);
  const secret = Buffer.from(env.cronSecret);

  // timingSafeEqual throws on length mismatch — guard on length first so a
  // wrong-length token fails identically to any other invalid credential.
  if (candidate.length !== secret.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidate, secret);
}

async function runSweep(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  try {
    const expired = await expirePastDuePendingBookings();
    console.log(`Expiry sweep expired ${expired} pending booking(s)`);
    return NextResponse.json({ ok: true, expired });
  } catch (error) {
    // Log the failure server-side but never leak the raw error to the caller.
    console.error('Expiry sweep failed', error);
    return NextResponse.json(FAILURE_BODY, { status: 500 });
  }
}

export async function GET(request: Request) {
  return runSweep(request);
}

export async function POST(request: Request) {
  return runSweep(request);
}

export const dynamic = 'force-dynamic';
