'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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

// How a venue numbers its rows' seats. ODD_EVEN draws a contiguous 1..N row as
// three blocks numbered center-out; IN_ORDER draws it as the same three blocks
// but in sequential order mirrored right-to-left (seat 1 at the right edge).
// Mirrors Venue.seatLayout.
export type SeatLayout = 'ODD_EVEN' | 'IN_ORDER';

export type SeatMapSeat = {
  id: string;
  color: string;
  selected?: boolean;
  disabled?: boolean;
  number?: string;
  gap?: boolean;
  onClick?: () => void;
  ariaLabel: string;
};

export type SeatMapRow = {
  label: string;
  seats: SeatMapSeat[];
};

export type SeatMapLegendItem = {
  id: string;
  name: string;
  color: string;
  price?: number | null;
};

// This is the ODD_EVEN layout. A contiguous 1..N row is drawn as three flat
// blocks — left | gap | middle | gap | right — numbered center-out so seat 1
// and 2 sit at the middle's center (15 13 11 | 9 7 5 3 1 2 4 6 8 | 10 12 14
// for a 15-seat row). The sides are always equal and smaller than the middle:
//   side = floor(N / 4), middle = N - 2 * side   (38 -> 9/20/9, 41 -> 10/21/10)
// Rows with fewer than 4 seats, or numbers that aren't exactly 1..N, keep the
// caller-provided order in a single block. Rows in the IN_ORDER layout use
// splitIntoBlocks instead. Purely visual — seat ids, click targets, and
// venueSeatIds are unchanged.
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

// This is the IN_ORDER layout. An already-ordered seat array (the caller's
// order mirrored right-to-left, so seat 1 sits at the right edge) is split
// into three flat blocks — left | gap | middle | gap | right — using the same
// geometry as the ODD_EVEN split: side = floor(N / 4), middle = N - 2 * side
// (15 -> 3/9/3, 38 -> 9/20/9). Unlike ODD_EVEN the blocks are contiguous
// slices, so a 15-seat row reads 15 14 13 | 12 11 10 9 8 7 6 5 4 | 3 2 1.
// Rows with fewer than 4 seats keep the caller-provided order in a single
// block. Purely visual — seat ids, click targets, and venueSeatIds are
// unchanged.
function splitIntoBlocks(seats: SeatMapSeat[]): {
  left: SeatMapSeat[];
  middle: SeatMapSeat[];
  right: SeatMapSeat[];
} | null {
  const count = seats.length;
  if (count < MIN_ROW_FOR_BLOCKS) return null;

  const side = Math.floor(count / 4);
  return {
    left: seats.slice(0, side),
    middle: seats.slice(side, count - side),
    right: seats.slice(count - side),
  };
}

function seatTextColor(color: string): string {
  const hex = color.replace('#', '');
  if (hex.length < 6) return '#ffffff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Threshold lowered from 160 so the pending-orange status color (#f97316,
  // luminance ~145) flips to dark — white on it is only ~2.8:1, dark is
  // ~6.4:1. No palette or status color sits between 140 and 160, so all other
  // colors keep their existing text color.
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 140 ? '#18181b' : '#ffffff';
}

export function SeatMap({
  rows,
  legend,
  stageLabel = 'STAGE',
  gapEditable = false,
  readOnly = false,
  seatLayout = 'ODD_EVEN',
}: {
  rows: SeatMapRow[];
  legend?: SeatMapLegendItem[];
  stageLabel?: string;
  gapEditable?: boolean;
  readOnly?: boolean;
  seatLayout?: SeatLayout;
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

  // Compute the per-row rendering once per row so the split logic runs a
  // single time per row (it feeds both the width math and the render below).
  // ODD_EVEN rows use splitLeftMiddleRight (center-out). IN_ORDER rows are
  // mirrored right-to-left first, then split into the same three blocks.
  const rowsWithSplits = useMemo(
    () =>
      rows.map((row) => {
        if (seatLayout === 'IN_ORDER') {
          const mirrored = [...row.seats].reverse();
          const split = splitIntoBlocks(mirrored);
          return { row, split, order: split ? mirrored : row.seats };
        }
        return { row, split: splitLeftMiddleRight(row.seats), order: row.seats };
      }),
    [rows, seatLayout],
  );

  const availW = containerW > 0 ? containerW : 360;
  const availForSeats = Math.max(1, availW - LABEL_WIDTH - LABEL_GAP);
  const maxSpan = Math.max(
    1,
    ...rowsWithSplits.map(({ row, split }) => {
      const count = row.seats.length;
      // A split row renders as three blocks around two aisle spacers, and the
      // flex gap runs between every child, so there are count + 1 gaps; an
      // unsplit row has count - 1. Must match the layout below or rows won't
      // fill the container at the same seat size.
      return (
        count +
        (split ? count + 1 : count - 1) * GAP_RATIO +
        (split ? 2 * AISLE_RATIO : 0)
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
          <div className="mb-4 w-full text-center text-xs font-semibold uppercase tracking-[0.3em] text-zinc-600">
            {stageLabel}
          </div>
        ) : null}
        {rowsWithSplits.map(({ row, split, order }) => {
          return (
            <div key={row.label} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-right text-xs text-zinc-600">
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
                        readOnly={readOnly}
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
                        readOnly={readOnly}
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
                        readOnly={readOnly}
                      />
                    ))}
                  </>
                ) : (
                  order.map((seat) => (
                    <SeatNode
                      key={seat.id}
                      seat={seat}
                      seatSize={seatSize}
                      showNumbers={showNumbers}
                      numberFontSize={numberFontSize}
                      gapEditable={gapEditable}
                      readOnly={readOnly}
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
              key={item.id}
              className="flex items-center gap-1.5 text-sm text-zinc-600"
            >
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              {item.name}
              {item.price != null ? (
                <span className="text-zinc-600">· {formatPrice(item.price)}</span>
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
  readOnly,
}: {
  seat: SeatMapSeat;
  seatSize: number;
  showNumbers: boolean;
  numberFontSize: number;
  gapEditable: boolean;
  readOnly: boolean;
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
      readOnly={readOnly}
    />
  );
}

function SeatButton({
  seat,
  seatSize,
  showNumbers,
  numberFontSize,
  readOnly,
}: {
  seat: SeatMapSeat;
  seatSize: number;
  showNumbers: boolean;
  numberFontSize: number;
  readOnly: boolean;
}) {
  const isGap = Boolean(seat.gap);

  const style = isGap
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
      };

  // Read-only maps (e.g. admin booking review) are display-only: no button
  // semantics, no tab stop, no cursor. The number still picks a readable
  // text color from the seat background.
  if (readOnly) {
    return (
      <span
        role="img"
        aria-label={seat.ariaLabel}
        className={`flex shrink-0 items-center justify-center rounded-full border ${
          isGap ? 'border-dashed border-zinc-400' : 'border-zinc-300'
        }`}
        style={style}
      >
        {showNumbers && seat.number && !isGap ? (
          <span
            aria-hidden="true"
            style={{
              fontSize: numberFontSize,
              color: seatTextColor(seat.color),
            }}
          >
            {seat.number}
          </span>
        ) : null}
      </span>
    );
  }

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
            ? 'border-2 border-black ring-4 ring-offset-2 ring-black'
            : seat.disabled
              ? 'cursor-not-allowed border-zinc-300'
              : 'border-zinc-300'
      }`}
      style={style}
    >
      {showNumbers && seat.number && !isGap ? (
        <span
          aria-hidden="true"
          style={{
            fontSize: numberFontSize,
            color: seat.disabled ? '#71717a' : seatTextColor(seat.color),
          }}
        >
          {seat.number}
        </span>
      ) : null}
    </button>
  );
}
