import { BookingStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getAdminSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { bookingGroupWhere } from '@/lib/seat-locking';
import { ticketBookingInclude } from '@/lib/ticket-send';
import { buildTicketPdf } from '@/lib/ticket-pdf';
import { ensureTicketToken } from '@/lib/tickets';

const bookingIdSchema = z.string().trim().min(1);

// Admin ticket download (docs/whatsapp-ticket-delivery.md, Task 4). Lives
// under /admin so the proxy guards it; the handler re-checks the session
// anyway. Resolves the request's group from a representative bookingId and
// streams the same multi-page PDF the send pipeline produces — one page per
// CONFIRMED seat, tokens claim-or-adopted so every QR is present. Read-only:
// no state is mutated, ticketSentAt is untouched.
export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  const parsed = bookingIdSchema.safeParse(
    new URL(request.url).searchParams.get('bookingId'),
  );
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid booking.' }, { status: 400 });
  }

  try {
    const rep = await prisma.booking.findUnique({
      where: { id: parsed.data },
      select: {
        id: true,
        eventId: true,
        userName: true,
        userPhone: true,
        caseType: true,
        referenceCode: true,
        expiresAt: true,
      },
    });
    if (!rep) {
      return NextResponse.json(
        { ok: false, error: 'Booking does not exist.' },
        { status: 404 },
      );
    }

    const group = bookingGroupWhere(rep);
    const members = await prisma.booking.findMany({
      where: { ...group.where, status: BookingStatus.CONFIRMED },
      include: ticketBookingInclude,
    });
    if (members.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No confirmed bookings to download.' },
        { status: 400 },
      );
    }

    const withTokens = await Promise.all(
      members.map(async (member) => ({
        ...member,
        ticketToken: await ensureTicketToken(member.id),
      })),
    );
    const pdf = await buildTicketPdf(withTokens);

    const filename = `tickets-${(rep.referenceCode ?? rep.id).replace(/[^A-Za-z0-9._-]/g, '')}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    // Log server-side; never leak the raw error to the caller.
    console.error('Ticket download failed', error);
    return NextResponse.json(
      { ok: false, error: 'Could not generate tickets.' },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';
