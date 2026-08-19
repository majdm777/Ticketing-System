'use client';

import { useLocale, useTranslations } from 'next-intl';
import { SeatStatus } from '@prisma/client';

import { SeatMap as VenueSeatMap, type SeatMapRow } from '@/components/seat-map';
import type { PublicGapSeat, PublicSeatGroup } from '@/lib/public-events';
import { buildSeatMapData, type SeatMapDataInput } from '@/lib/seat-map-data';

export function SeatMap({
  seatGroups,
  gapSeats,
  selectedSeatIds,
  onSelect,
  seatLayout = 'ODD_EVEN',
}: {
  seatGroups: PublicSeatGroup[];
  gapSeats: PublicGapSeat[];
  selectedSeatIds: string[];
  onSelect: (seatId: string) => void;
  seatLayout?: 'ODD_EVEN' | 'IN_ORDER';
}) {
  const t = useTranslations('SeatMap');
  const locale = useLocale();

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
      ariaLabel: seat.available
        ? t('seatAriaLabel', { section: seat.section, row: dataRow.row, number: seat.number })
        : t('seatAriaLabelTaken', { section: seat.section, row: dataRow.row, number: seat.number }),
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
      stageLabel={t('stage')}
      seatLayout={seatLayout}
      locale={locale}
      legend={[
        ...seatGroups.map((group) => ({
          id: `section:${group.section}`,
          name: group.section,
          color: group.color,
          price: group.price,
        })),
        ...(hasTakenSeats
          ? [{ id: 'taken', name: t('taken'), color: '#e5e7eb' }]
          : []),
      ]}
    />
  );
}
