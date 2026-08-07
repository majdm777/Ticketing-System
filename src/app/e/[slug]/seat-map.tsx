'use client';

import { useState } from 'react';

import { SeatMap as VenueSeatMap, type SeatMapRow } from '@/components/seat-map';
import type { PublicGapSeat, PublicSeatGroup } from '@/lib/public-events';
import { buildSeatMapData } from '@/lib/seat-map-data';

// Feeds the shared SeatMap component with the event's live seat data. A single
// venue row can hold seats from more than one section, so rows are merged
// across sections first and then rendered once, in row order. buildSeatMapData
// does the merging, coloring, and row ordering; this wrapper only adds the
// click behavior and the taken-seat grey-out. Gap seats (blocked-out venue
// positions) have no section and are fed in flat, so they render as empty
// slots that keep the row layout intact.

export function SeatMap({
  seatGroups,
  gapSeats,
}: {
  seatGroups: PublicSeatGroup[];
  gapSeats: PublicGapSeat[];
}) {
  const [selectedSeatId, setSelectedSeatId] = useState('');

  const seats = [
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
      selected: selectedSeatId === seat.venueSeatId,
      onClick: () =>
        setSelectedSeatId(
          selectedSeatId === seat.venueSeatId ? '' : seat.venueSeatId,
        ),
      ariaLabel: `${seat.section} section, row ${dataRow.row}, seat ${
        seat.number
      }${seat.available ? '' : ', taken'}`,
    })),
  }));

  return (
    <VenueSeatMap
      rows={rows}
      legend={seatGroups.map((group) => ({
        name: group.section,
        color: group.color,
        price: group.price,
      }))}
    />
  );
}
