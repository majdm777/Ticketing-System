import crypto from 'crypto';

import { NextResponse } from 'next/server';

import { env } from '@/lib/env';
import { expirePastDuePendingBookings } from '@/lib/seat-locking';

const UNAUTHORIZED_BODY = { ok: false, error: 'Unauthorized' } as const;

// Protected scheduled sweep (docs/cron-expiry-sweep.md). GET exists solely so
// Vercel Cron can reach it; GitHub Actions and external schedulers use POST.
// Both methods share the same CRON_SECRET check and run the same global sweep.
function isAuthorized(request: Request): boolean {
  if (!env.cronSecret) {
    return false;
  }

  const parts = request.headers.get('authorization')?.split(' ');
  if (!parts || parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    return false;
  }

  const candidate = Buffer.from(parts[1]);
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

  const expired = await expirePastDuePendingBookings();
  console.log(`Expiry sweep expired ${expired} pending booking(s)`);
  return NextResponse.json({ ok: true, expired });
}

export async function GET(request: Request) {
  return runSweep(request);
}

export async function POST(request: Request) {
  return runSweep(request);
}

export const dynamic = 'force-dynamic';
