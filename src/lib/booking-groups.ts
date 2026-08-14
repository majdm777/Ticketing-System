import type { Booking } from '@prisma/client';

// One admin "request" is the set of bookings created together by a single
// attendee request (docs/event-ticketing-flow.md). Bookings are stored one per
// seat, so the admin views collapse them back into one row:
//   - ONLINE_CODE requests share one referenceCode (the payment note).
//   - PAY_AT_DOOR requests have no code, but requestSeats stamps one shared
//     expiresAt on the whole group, so the identity tuple distinguishes one
//     request from a later request by the same attendee (expiry differs).
//   - GUEST bookings (admin-created) have neither, so the group is the
//     attendee itself: every seat created for the same guest (same event,
//     name, and phone) collapses into one request.
type GroupableBooking = Pick<
  Booking,
  'id' | 'eventId' | 'userName' | 'userPhone' | 'caseType' | 'referenceCode' | 'expiresAt'
>;

export function requestGroupKey(booking: GroupableBooking): string {
  if (booking.referenceCode) {
    return `ref:${booking.referenceCode}`;
  }
  // No code and no expiry (a GUEST booking): the admin creates all seats for
  // one guest in a single batch, so the group is the attendee — same event,
  // name, and phone. Mirrors bookingGroupWhere in seat-locking.ts.
  if (!booking.expiresAt) {
    return [
      'guest',
      booking.eventId,
      booking.userName,
      booking.userPhone,
      booking.caseType,
    ].join('|');
  }
  return [
    'idn',
    booking.eventId,
    booking.userName,
    booking.userPhone,
    booking.caseType,
    booking.expiresAt.toISOString(),
  ].join('|');
}

// "Front A1" style label: section name, row letter and number concatenated
// (the seat map draws row and number as one unit, e.g. `A1`).
export function seatLabel(booking: {
  eventSeat: {
    venueSeat: {
      row: string;
      number: string;
      section: { name: string } | null;
    };
  };
}): string {
  const seat = booking.eventSeat.venueSeat;
  return `${seat.section?.name ?? ''} ${seat.row}${seat.number}`.trim();
}
