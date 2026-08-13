import { BookingStatus } from '@prisma/client';

import { seatLabel } from './booking-groups';
import { env } from './env';
import { prisma } from './prisma';
import { bookingGroupWhere } from './seat-locking';
import { buildTicketPdf, type TicketBooking } from './ticket-pdf';
import { ensureTicketToken } from './tickets';
import { sendTicket } from './whatsapp';

export type SendTicketsResult = { ok: true } | { ok: false; error: string };

// The relation shape buildTicketPdf renders — every caller (send pipeline and
// the admin download route) loads bookings with exactly these includes.
export const ticketBookingInclude = {
  event: { include: { venue: true } },
  eventSeat: { include: { venueSeat: { include: { section: true } } } },
} as const;

// A booking stores the phone as the attendee typed it (possibly a local
// number). WhatsApp requires E.164: an international `+` number passes through
// as-is, a local number gets the optional WHATSAPP_DEFAULT_COUNTRY_CODE prefix,
// and anything else fails closed (the send reports failure instead of dialing a
// wrong or ambiguous number). The attendee flow may later replace this with a
// country-code picker; until then this is the single normalization point.
export function normalizePhoneNumber(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (trimmed.startsWith('+')) {
    return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : null;
  }

  const countryCode = env.whatsappDefaultCountryCode?.replace(/\D/g, '');
  if (!countryCode) {
    return null;
  }

  // A locally typed number often carries a national trunk prefix ("0"), which
  // must be dropped before the country code is prepended.
  const national = digits.replace(/^0+/, '');
  if (!national) {
    return null;
  }

  const full = `${countryCode}${national}`;
  return full.length >= 7 && full.length <= 15 ? `+${full}` : null;
}

async function markSent(bookings: TicketBooking[]) {
  await prisma.booking.updateMany({
    where: { id: { in: bookings.map((booking) => booking.id) }, status: BookingStatus.CONFIRMED },
    data: { ticketSentAt: new Date(), ticketNote: null },
  });
}

async function recordSendFailure(bookings: Array<{ id: string }>, note: string) {
  await prisma.booking.updateMany({
    where: { id: { in: bookings.map((booking) => booking.id) }, status: BookingStatus.CONFIRMED },
    data: { ticketNote: note.slice(0, 200) },
  });
}

// Sends one WhatsApp message per request (one PDF, one page per confirmed
// seat), or per single seat for a GUEST booking. The group is resolved from a
// representative bookingId exactly like the confirm/cancel actions, then
// reduced to its CONFIRMED members: a partial cancellation never appears in a
// sent ticket. Tokens are claim-or-adopted before rendering, and the outcome
// is recorded on every confirmed booking via a guarded update — a send
// failure never rolls back the confirmation.
export async function sendTicketsForRequest(params: {
  bookingId: string;
}): Promise<SendTicketsResult> {
  const { bookingId } = params;
  let confirmed: TicketBooking[] = [];

  try {
    const rep = await prisma.booking.findUnique({
      where: { id: bookingId },
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
      return { ok: false, error: 'Booking does not exist.' };
    }

    const group = bookingGroupWhere(rep);
    const members = await prisma.booking.findMany({
      where: { ...group.where, status: BookingStatus.CONFIRMED },
      include: ticketBookingInclude,
    });
    if (members.length === 0) {
      return { ok: false, error: 'No confirmed bookings to send tickets for.' };
    }

    // Validate the phone before claiming tokens or rendering the PDF — an
    // invalid number discards all of that work.
    const phone = normalizePhoneNumber(rep.userPhone);
    if (!phone) {
      await recordSendFailure(
        members,
        'Phone number is not a valid WhatsApp number.',
      );
      return { ok: false, error: 'The attendee phone number is not a valid WhatsApp number.' };
    }

    confirmed = await Promise.all(
      members.map(async (member) => ({
        ...member,
        ticketToken: await ensureTicketToken(member.id),
      })),
    );

    const pdf = await buildTicketPdf(confirmed);

    const result = await sendTicket({
      phone,
      pdfBuffer: pdf,
      eventName: confirmed[0].event.name,
      seatLabels: confirmed.map((booking) => seatLabel(booking)),
    });

    if (result.ok) {
      await markSent(confirmed);
      return { ok: true };
    }

    await recordSendFailure(confirmed, result.error);
    return { ok: false, error: result.error };
  } catch (error) {
    if (confirmed.length > 0) {
      await recordSendFailure(confirmed, 'Tickets could not be sent.').catch(() => {});
    }
    console.error('Failed to send tickets', error);
    return { ok: false, error: 'Tickets could not be sent.' };
  }
}
