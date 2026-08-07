import { buildSectionColorMap } from './section-colors';

// Shared seat-map data builder. Both the public event page and the admin
// guest-booking form flatten their own seat rows into `SeatMapDataInput[]`
// (one entry per EventSeat) and call buildSeatMapData to get a single
// row-ordered grid, merged across sections, with section colors applied and
// selectability derived from status. The rendering itself stays in
// src/components/seat-map.tsx.

export type SeatMapDataInput = {
  id: string;
  venueSeatId: string;
  row: string;
  number: string;
  section: string;
  status: string;
};

export type SeatMapDataSeat = SeatMapDataInput & {
  color: string;
  available: boolean;
  gap: boolean;
};

export type SeatMapDataRow = {
  row: string;
  seats: SeatMapDataSeat[];
};

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

export function buildSeatMapData(seats: SeatMapDataInput[]): {
  rows: SeatMapDataRow[];
  sectionColors: Map<string, string>;
} {
  const sectionColors = buildSectionColorMap(seats.map((seat) => seat.section));

  const rowMap = new Map<string, SeatMapDataSeat[]>();
  for (const seat of seats) {
    const list = rowMap.get(seat.row) ?? [];
    list.push({
      ...seat,
      color: sectionColors.get(seat.section) ?? '#e5e7eb',
      available: seat.status === 'AVAILABLE',
      gap: seat.status === 'GAP',
    });
    rowMap.set(seat.row, list);
  }

  const rows = Array.from(rowMap.entries())
    .sort((a, b) => compareRowLabels(a[0], b[0]))
    .map(([row, rowSeats]) => ({
      row,
      seats: rowSeats.sort((a, b) => compareSeatNumbers(a.number, b.number)),
    }));

  return { rows, sectionColors };
}
