'use client';

import { useEffect, useRef, useState } from 'react';

import { formatPrice } from '@/lib/currency';

// Single source of truth for rendering a venue's seat map. Both the admin
// venue builder and the attendee event page feed rows into this component,
// so any future visual change (spacing, stage, blocks, ...) made here shows
// up everywhere. Callers supply the seat data and click behavior; this
// component only draws.
//
// One seat size is calculated for the whole map: the container width is
// divided by the seat count of the widest row (gaps and the two block gaps
// included), so every row fits the container width and the map never scrolls
// horizontally. The size is capped at MAX_SEAT so sparse rows stay compact on
// wide screens; there is no minimum, because the map must always fit. The same
// size is used for every seat in every row, and a ResizeObserver recalculates
// it on resize so it adapts responsively (especially mobile).
const MAX_SEAT = 44;
const GAP_RATIO = 0.2;
const AISLE_RATIO = 1;
const LABEL_WIDTH = 32;
const LABEL_GAP = 8;
const SHOW_NUMBERS_MIN_SEAT = 20;
const MIN_ROW_FOR_BLOCKS = 4;

export type SeatMapSeat = {
  id: string;
  color: string;
  selected?: boolean;
  disabled?: boolean;
  number?: string;
  gap?: boolean;
  onClick: () => void;
  ariaLabel: string;
};

export type SeatMapRow = {
  label: string;
  seats: SeatMapSeat[];
};

export type SeatMapLegendItem = {
  name: string;
  color: string;
  price?: number | null;
};

// A contiguous 1..N row is drawn as three flat blocks — left | gap | middle |
// gap | right — numbered center-out so seat 1 and 2 sit at the middle's
// center (15 13 11 | 9 7 5 3 1 2 4 6 8 | 10 12 14 for a 15-seat row).
// The sides are always equal and smaller than the middle:
//   side = floor(N / 4), middle = N - 2 * side   (38 -> 9/20/9, 41 -> 10/21/10)
// Rows with fewer than 4 seats, or numbers that aren't exactly 1..N, keep the
// caller-provided order in a single block. Purely visual — seat ids, click
// targets, and venueSeatIds are unchanged.
export function splitLeftMiddleRight(seats: SeatMapSeat[]): {
  left: SeatMapSeat[];
  middle: SeatMapSeat[];
  right: SeatMapSeat[];
} | null {
  const count = seats.length;
  if (count < MIN_ROW_FOR_BLOCKS) return null;

  const numbers = seats.map((seat) => Number(seat.number));
  if (
    !numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= count) ||
    new Set(numbers).size !== count
  ) {
    return null;
  }

  const seatByNumber = new Map(numbers.map((n, i) => [n, seats[i]]));
  const side = Math.floor(count / 4);
  const middleCount = count - side * 2;
  const middleOdds = Math.ceil(middleCount / 2);
  const middleEvens = Math.floor(middleCount / 2);
  const largestOdd = count % 2 === 0 ? count - 1 : count;
  const largestEven = count % 2 === 0 ? count : count - 1;

  const left: SeatMapSeat[] = [];
  for (let n = largestOdd; n > middleOdds * 2 - 1; n -= 2) {
    left.push(seatByNumber.get(n)!);
  }

  const middle: SeatMapSeat[] = [];
  for (let n = middleOdds * 2 - 1; n >= 1; n -= 2) {
    middle.push(seatByNumber.get(n)!);
  }
  for (let n = 2; n <= middleEvens * 2; n += 2) {
    middle.push(seatByNumber.get(n)!);
  }

  const right: SeatMapSeat[] = [];
  for (let n = middleEvens * 2 + 2; n <= largestEven; n += 2) {
    right.push(seatByNumber.get(n)!);
  }

  return { left, middle, right };
}

function seatTextColor(color: string): string {
  const hex = color.replace('#', '');
  if (hex.length < 6) return '#ffffff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 160 ? '#18181b' : '#ffffff';
}

export function SeatMap({
  rows,
  legend,
  stageLabel = 'STAGE',
  gapEditable = false,
}: {
  rows: SeatMapRow[];
  legend?: SeatMapLegendItem[];
  stageLabel?: string;
  gapEditable?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerW(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // contentRect excludes border/padding, so geometry stays inside the
        // visible container at every screen size.
        if (entry.contentRect.width > 0) setContainerW(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const availW = containerW > 0 ? containerW : 360;
  const availForSeats = Math.max(1, availW - LABEL_WIDTH - LABEL_GAP);
  const maxSpan = Math.max(
    1,
    ...rows.map((row) => {
      const count = row.seats.length;
      const hasGaps = splitLeftMiddleRight(row.seats) !== null;
      return (
        count +
        (count - 1) * GAP_RATIO +
        (hasGaps ? 2 * AISLE_RATIO : 0)
      );
    }),
  );
  const exactSize = availForSeats / maxSpan;
  const seatSize = Math.min(MAX_SEAT, exactSize);
  const seatGap = seatSize * GAP_RATIO;
  const aisleWidth = seatSize * AISLE_RATIO;
  const showNumbers = seatSize >= SHOW_NUMBERS_MIN_SEAT;
  const numberFontSize = Math.max(9, Math.round(seatSize * 0.38));

  return (
    <div ref={containerRef} className="space-y-4">
      <div className="flex w-full max-w-full flex-col items-center gap-2">
        {stageLabel ? (
          <div className="mb-4 w-full rounded-full border border-zinc-300 bg-zinc-100 px-4 py-2 text-center text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
            {stageLabel}
          </div>
        ) : null}
        {rows.map((row) => {
          const split = splitLeftMiddleRight(row.seats);
          return (
            <div key={row.label} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-right text-xs text-zinc-500">
                {row.label}
              </span>
              <div className="flex items-center" style={{ gap: seatGap }}>
                {split ? (
                  <>
                    {split.left.map((seat) => (
                      <SeatNode
                        key={seat.id}
                        seat={seat}
                        seatSize={seatSize}
                        showNumbers={showNumbers}
                        numberFontSize={numberFontSize}
                        gapEditable={gapEditable}
                      />
                    ))}
                    <BlockGap width={aisleWidth} />
                    {split.middle.map((seat) => (
                      <SeatNode
                        key={seat.id}
                        seat={seat}
                        seatSize={seatSize}
                        showNumbers={showNumbers}
                        numberFontSize={numberFontSize}
                        gapEditable={gapEditable}
                      />
                    ))}
                    <BlockGap width={aisleWidth} />
                    {split.right.map((seat) => (
                      <SeatNode
                        key={seat.id}
                        seat={seat}
                        seatSize={seatSize}
                        showNumbers={showNumbers}
                        numberFontSize={numberFontSize}
                        gapEditable={gapEditable}
                      />
                    ))}
                  </>
                ) : (
                  row.seats.map((seat) => (
                    <SeatNode
                      key={seat.id}
                      seat={seat}
                      seatSize={seatSize}
                      showNumbers={showNumbers}
                      numberFontSize={numberFontSize}
                      gapEditable={gapEditable}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {legend && legend.length > 0 ? (
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-zinc-200 pt-4">
          {legend.map((item) => (
            <div
              key={item.name}
              className="flex items-center gap-1.5 text-sm text-zinc-600"
            >
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              {item.name}
              {item.price != null ? (
                <span className="text-zinc-400">· {formatPrice(item.price)}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BlockGap({ width }: { width: number }) {
  return <div aria-hidden="true" className="shrink-0" style={{ width }} />;
}

function SeatNode({
  seat,
  seatSize,
  showNumbers,
  numberFontSize,
  gapEditable,
}: {
  seat: SeatMapSeat;
  seatSize: number;
  showNumbers: boolean;
  numberFontSize: number;
  gapEditable: boolean;
}) {
  if (seat.gap && !gapEditable) {
    // A gap seat keeps its position in the row (so numbering and the
    // three-block layout stay intact) but renders as an empty slot that
    // can never be selected or booked.
    return (
      <div
        aria-hidden="true"
        className="shrink-0 rounded-full"
        style={{ width: seatSize, height: seatSize }}
      />
    );
  }
  return (
    <SeatButton
      seat={seat}
      seatSize={seatSize}
      showNumbers={showNumbers}
      numberFontSize={numberFontSize}
    />
  );
}

function SeatButton({
  seat,
  seatSize,
  showNumbers,
  numberFontSize,
}: {
  seat: SeatMapSeat;
  seatSize: number;
  showNumbers: boolean;
  numberFontSize: number;
}) {
  const isGap = Boolean(seat.gap);
  return (
    <button
      type="button"
      disabled={seat.disabled}
      onClick={seat.onClick}
      aria-pressed={seat.selected}
      aria-label={seat.ariaLabel}
      className={`flex shrink-0 items-center justify-center rounded-full border transition-colors ${
        isGap
          ? 'border-dashed border-zinc-400'
          : seat.selected
            ? 'border-black ring-2 ring-offset-1 ring-black'
            : seat.disabled
              ? 'cursor-not-allowed border-zinc-300'
              : 'border-zinc-300'
      }`}
      style={
        isGap
          ? {
              width: seatSize,
              height: seatSize,
              background:
                'repeating-linear-gradient(45deg, #fafafa 0px, #fafafa 2px, #e4e4e7 2px, #e4e4e7 4px)',
            }
          : {
              width: seatSize,
              height: seatSize,
              backgroundColor: seat.color,
            }
      }
    >
      {showNumbers && seat.number && !isGap ? (
        <span
          aria-hidden="true"
          style={{
            fontSize: numberFontSize,
            color: seat.disabled ? '#a1a1aa' : seatTextColor(seat.color),
          }}
        >
          {seat.number}
        </span>
      ) : null}
    </button>
  );
}
