'use client';

import { useState } from 'react';

import { SeatMap as VenueSeatMap, type SeatMapRow } from '@/components/seat-map';
import type { PublicSeatGroup } from '@/lib/public-events';

// Feeds the shared SeatMap component with the event's live seat data. A single
// venue row can hold seats from more than one section, so rows are merged
// across sections first and then rendered once, in row order. Merging keys on
// (row, number) is safe because VenueSeat guarantees the coordinate is unique
// per venue (@@unique([venueId, row, number])) — a number can never appear
// twice in a row, even across sections.

function compareRowLabels(a: string, b: string): number {
  const aNum = Number(a);
  const bNum = Number(b);
  if (Number.isInteger(aNum) && Number.isInteger(bNum)) {
    return aNum - bNum;
  }
  return a.localeCompare(b);
}

function compareSeatNumbers(a: string, b: string): number {
  return Number(a) - Number(b) || a.localeCompare(b);
}

type MergedSeat = {
  seat: PublicSeatGroup['rows'][number]['seats'][number];
  color: string;
  section: string;
};

export function SeatMap({ seatGroups }: { seatGroups: PublicSeatGroup[] }) {
  const [selectedSeatId, setSelectedSeatId] = useState('');

  const rowMap = new Map<string, Map<string, MergedSeat>>();
  for (const group of seatGroups) {
    for (const row of group.rows) {
      let seatMap = rowMap.get(row.row);
      if (!seatMap) {
        seatMap = new Map();
        rowMap.set(row.row, seatMap);
      }
      for (const seat of row.seats) {
        seatMap.set(seat.number, {
          seat,
          color: group.color,
          section: group.section,
        });
      }
    }
  }

  const rows: SeatMapRow[] = Array.from(rowMap.entries())
    .sort((a, b) => compareRowLabels(a[0], b[0]))
    .map(([label, seatMap]) => ({
      label,
      seats: Array.from(seatMap.values())
        .sort((a, b) => compareSeatNumbers(a.seat.number, b.seat.number))
        .map(({ seat, color, section }) => {
          const available = seat.status === 'AVAILABLE';
          return {
            id: seat.id,
            color: available ? color : '#e5e7eb',
            disabled: !available,
            selected: selectedSeatId === seat.venueSeatId,
            onClick: () =>
              setSelectedSeatId(selectedSeatId === seat.venueSeatId ? '' : seat.venueSeatId),
            ariaLabel: `${section} section, row ${label}, seat ${seat.number}${
              available ? '' : ', taken'
            }`,
          };
        }),
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
