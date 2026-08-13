import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
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

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: '#18181b',
  },
  header: {
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#18181b',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#71717a',
  },
  divider: {
    height: 1,
    backgroundColor: '#e4e4e7',
    marginTop: 16,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  label: {
    color: '#71717a',
  },
  value: {
    fontWeight: 600,
    textAlign: 'right',
    marginLeft: 16,
  },
  qrWrap: {
    alignItems: 'center',
    marginTop: 28,
  },
  qrHint: {
    marginTop: 8,
    fontSize: 9,
    color: '#71717a',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 16,
    fontSize: 8,
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

function TicketPage({ booking, qr }: { booking: TicketBooking; qr: string }) {
  const seat = booking.eventSeat.venueSeat;

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>{booking.event.name}</Text>
        <Text style={styles.subtitle}>Admission ticket</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.row}>
        <Text style={styles.label}>Seat</Text>
        <Text style={styles.value}>{seatLabel(booking)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Date</Text>
        <Text style={styles.value}>{formatDate(booking.event.startsAt)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Venue</Text>
        <Text style={styles.value}>{booking.event.venue.name}</Text>
      </View>
      {booking.event.venue.address ? (
        <View style={styles.row}>
          <Text style={styles.label}>Address</Text>
          <Text style={styles.value}>{booking.event.venue.address}</Text>
        </View>
      ) : null}
      {seat.section ? (
        <View style={styles.row}>
          <Text style={styles.label}>Price</Text>
          <Text style={styles.value}>{formatUsd(seat.section.price)}</Text>
        </View>
      ) : null}
      {booking.referenceCode ? (
        <View style={styles.row}>
          <Text style={styles.label}>Reference</Text>
          <Text style={styles.value}>{booking.referenceCode}</Text>
        </View>
      ) : null}

      <View style={styles.qrWrap}>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={qr} style={{ width: 140, height: 140 }} />
        <Text style={styles.qrHint}>Scan this code at the door</Text>
      </View>

      <Text style={styles.footer}>Booking {booking.id}</Text>
    </Page>
  );
}

// One PDF per request, one A4 page per booking/seat, generated fresh every
// call — nothing is persisted, nothing expires. Builds the QR codes for each
// seat's own signed ticket token, then renders and returns the PDF buffer.
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
