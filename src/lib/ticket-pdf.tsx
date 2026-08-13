import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import { CaseType } from '@prisma/client';
import QRCode from 'qrcode';

import { formatUsd } from './currency';
import { formatDate } from './format';

// The slice of a Booking (with relations) that a ticket page renders. The send
// pipeline and the admin Download action both load bookings in exactly this
// shape and pass them here. ticketToken is non-null by contract: every booking
// has its token persisted (claim-or-adopt at confirmation) before a PDF can be
// generated — a missing token fails loudly rather than silently dropping the QR.
export type TicketBooking = {
  id: string;
  referenceCode: string | null;
  ticketToken: string;
  caseType: CaseType;
  event: {
    name: string;
    startsAt: Date;
    venue: { name: string; address: string };
  };
  eventSeat: {
    venueSeat: {
      row: string;
      number: string;
      section: { name: string; price: number } | null;
    };
  };
};

// The status badge reflects how the booking was placed and paid. ONLINE_CODE
// bookings are paid by transfer before admin confirmation; PAY_AT_DOOR is
// settled at the entrance; GUEST bookings are placed by the box office.
const STATUS_BY_CASE: Record<CaseType, { label: string; color: string }> = {
  ONLINE_CODE: { label: 'Paid', color: '#16a34a' },
  PAY_AT_DOOR: { label: 'Pay on Door', color: '#d97706' },
  GUEST: { label: 'Guest', color: '#7c3aed' },
};

function statusOf(caseType: CaseType): { label: string; color: string } {
  return STATUS_BY_CASE[caseType] ?? STATUS_BY_CASE.ONLINE_CODE;
}

// Short, wide boarding-pass ticket — 900x300pt (3:1). The left body is a
// column whose info grid stretches to fill the full height (badge + title on
// top, Date/Venue/Address/Reference in two columns spread edge to edge); the
// right stub is its own column spread across the same height, with a compact
// seat, price and QR. The vertical center of the page is never empty.
const styles = StyleSheet.create({
  page: {
    width: 900,
    height: 300,
    padding: 14,
    flexDirection: 'row',
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#18181b',
  },
  body: {
    flex: 1,
    flexDirection: 'column',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  kicker: {
    fontSize: 8,
    letterSpacing: 3,
    color: '#71717a',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: '#18181b',
    marginTop: 6,
    marginBottom: 8,
  },
  grid: {
    flex: 1,
    flexDirection: 'row',
  },
  gridCol: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: 2,
  },
  gridColA: {
    marginRight: 20,
  },
  infoCell: {
    paddingVertical: 3,
  },
  infoLabel: {
    fontSize: 8,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: '#71717a',
    marginBottom: 3,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: 600,
    color: '#18181b',
  },
  perforation: {
    width: 16,
    alignSelf: 'stretch',
    alignItems: 'center',
    position: 'relative',
    marginHorizontal: 8,
  },
  perfLine: {
    flex: 1,
    borderLeftWidth: 2,
    borderLeftColor: '#a1a1aa',
    borderStyle: 'dashed',
  },
  perfNotch: {
    position: 'absolute',
    top: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  perfNotchBottom: {
    position: 'absolute',
    bottom: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e4e4e7',
  },
  stub: {
    width: 168,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexDirection: 'column',
    paddingVertical: 2,
  },
  stubLabel: {
    fontSize: 8,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#71717a',
    marginBottom: 3,
  },
  seat: {
    fontSize: 17,
    fontWeight: 700,
    color: '#18181b',
    textAlign: 'center',
  },
  price: {
    fontSize: 13,
    fontWeight: 700,
    color: '#18181b',
  },
  qrWrap: {
    alignItems: 'center',
  },
  qrHint: {
    marginTop: 4,
    fontSize: 7,
    letterSpacing: 1,
    color: '#a1a1aa',
    textTransform: 'uppercase',
  },
  bookingId: {
    fontSize: 6.5,
    color: '#a1a1aa',
    textAlign: 'center',
  },
});

// "Front A1" style label — section name, row and number concatenated, the same
// convention the admin bookings page uses (booking-groups.ts seatLabel).
function seatLabel(booking: TicketBooking): string {
  const seat = booking.eventSeat.venueSeat;
  return `${seat.section?.name ?? ''} ${seat.row}${seat.number}`.trim();
}

// Stable page order across sends, resends and downloads: seat row, then seat
// number, both compared numerically so "A10" sorts after "A2".
function compareSeats(a: TicketBooking, b: TicketBooking): number {
  const aSeat = a.eventSeat.venueSeat;
  const bSeat = b.eventSeat.venueSeat;
  const row = aSeat.row.localeCompare(bSeat.row, undefined, { numeric: true });
  if (row !== 0) {
    return row;
  }
  return aSeat.number.localeCompare(bSeat.number, undefined, { numeric: true });
}

function StatusBadge({ caseType }: { caseType: CaseType }) {
  const status = statusOf(caseType);
  return (
    <View style={[styles.badge, { backgroundColor: status.color }]}>
      <Text style={styles.badgeText}>{status.label}</Text>
    </View>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoCell}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

// Dashed tear line with a notch cut at each end — the boarding-pass look that
// separates the event body (left) from the detachable stub (right).
function Perforation() {
  return (
    <View style={styles.perforation}>
      <View style={styles.perfLine} />
      <View style={styles.perfNotch} />
      <View style={styles.perfNotchBottom} />
    </View>
  );
}

function TicketPage({ booking, qr }: { booking: TicketBooking; qr: string }) {
  const seat = booking.eventSeat.venueSeat;
  const venue = booking.event.venue;
  const address = venue.address || '-';
  const reference = booking.referenceCode || '-';

  return (
    <Page size={[900, 300]} style={styles.page}>
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <StatusBadge caseType={booking.caseType} />
          <Text style={styles.kicker}>Admission ticket</Text>
        </View>

        <Text style={styles.title}>{booking.event.name}</Text>

        <View style={styles.grid}>
          <View style={[styles.gridCol, styles.gridColA]}>
            <InfoCell label="Date" value={formatDate(booking.event.startsAt)} />
            <InfoCell label="Reference" value={reference} />
          </View>
          <View style={styles.gridCol}>
            <InfoCell label="Venue" value={venue.name} />
            <InfoCell label="Address" value={address} />
          </View>
        </View>
      </View>

      <Perforation />

      <View style={styles.stub}>
        <View style={styles.qrWrap}>
          <Text style={styles.stubLabel}>Seat</Text>
          <Text style={styles.seat}>{seatLabel(booking)}</Text>
        </View>

        {seat.section ? (
          <View style={styles.qrWrap}>
            <Text style={styles.stubLabel}>Price</Text>
            <Text style={styles.price}>{formatUsd(seat.section.price)}</Text>
          </View>
        ) : null}

        <View style={styles.qrWrap}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={qr} style={{ width: 84, height: 84 }} />
          <Text style={styles.qrHint}>Scan to validate</Text>
        </View>

        <Text style={styles.bookingId}>Booking {booking.id}</Text>
      </View>
    </Page>
  );
}

// One PDF per request, one 900x300pt page per booking/seat, generated fresh
// every call — nothing is persisted, nothing expires. Builds the QR codes for
// each seat's own signed ticket token, then renders and returns the PDF buffer.
export async function buildTicketPdf(bookings: TicketBooking[]): Promise<Buffer> {
  const ordered = [...bookings].sort(compareSeats);

  const pages = await Promise.all(
    ordered.map(async (booking) => ({
      booking,
      qr: await QRCode.toDataURL(booking.ticketToken, { margin: 1, width: 256 }),
    })),
  );

  const document = (
    <Document>
      {pages.map(({ booking, qr }) => (
        <TicketPage key={booking.id} booking={booking} qr={qr} />
      ))}
    </Document>
  );

  return renderToBuffer(document);
}
