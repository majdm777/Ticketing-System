'use client';

import { SeatStatus } from '@prisma/client';

import { SeatMap as VenueSeatMap, type SeatMapRow } from '@/components/seat-map';
import type { PublicGapSeat, PublicSeatGroup } from '@/lib/public-events';
import { buildSeatMapData, type SeatMapDataInput } from '@/lib/seat-map-data';

// Feeds the shared SeatMap component with the event's live seat data. A single
// venue row can hold seats from more than one section, so rows are merged
// across sections first and then rendered once, in row order. buildSeatMapData
// does the merging, coloring, and row ordering; this wrapper only adds the
// click behavior and the taken-seat grey-out. Gap seats (blocked-out venue
// positions) have no section and are fed in flat, so they render as empty
// slots that keep the row layout intact.
//
// Selection is controlled by the parent: the parent owns `selectedSeatIds`
// and toggles membership in `onSelect` so the booking flow can show the
// request form for the tapped seats. Seat ids are EventSeat ids — the values
// the request needs.

export function SeatMap({
  seatGroups,
  gapSeats,
  selectedSeatIds,
  onSelect,
}: {
  seatGroups: PublicSeatGroup[];
  gapSeats: PublicGapSeat[];
  selectedSeatIds: string[];
  onSelect: (seatId: string) => void;
}) {
  const seats: SeatMapDataInput[] = [
    ...seatGroups.flatMap((group) =>
      group.rows.flatMap((row) =>
        row.seats.map((seat) => ({
          id: seat.id,
          venueSeatId: seat.venueSeatId,
          row: row.row,
          number: seat.number,
          section: group.section,
          status: seat.status,
        })),
      ),
    ),
    ...gapSeats.map((gap) => ({
      id: gap.id,
      venueSeatId: gap.venueSeatId,
      row: gap.row,
      number: gap.number,
      section: '',
      status: 'GAP',
    })),
  ];
  const { rows: dataRows } = buildSeatMapData(seats);

  const rows: SeatMapRow[] = dataRows.map((dataRow) => ({
    label: dataRow.row,
    seats: dataRow.seats.map((seat) => ({
      id: seat.id,
      number: seat.number,
      gap: seat.gap,
      color: seat.available ? seat.color : '#e5e7eb',
      disabled: !seat.available,
      selected: selectedSeatIds.includes(seat.id),
      onClick: () => onSelect(seat.id),
      ariaLabel: `${seat.section} section, row ${dataRow.row}, seat ${
        seat.number
      }${seat.available ? '' : ', taken'}`,
    })),
  }));

  const hasTakenSeats = seatGroups.some((group) =>
    group.rows.some((row) =>
      row.seats.some((seat) => seat.status !== SeatStatus.AVAILABLE),
    ),
  );

  return (
    <VenueSeatMap
      rows={rows}
      legend={[
        ...seatGroups.map((group) => ({
          name: group.section,
          color: group.color,
          price: group.price,
        })),
        ...(hasTakenSeats ? [{ name: 'Taken', color: '#e5e7eb' }] : []),
      ]}
    />
  );
}
