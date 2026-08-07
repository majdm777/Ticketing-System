'use client';

import { useEffect, useRef, useState } from 'react';

import { formatPrice } from '@/lib/currency';

// Single source of truth for rendering a venue's seat map. Both the admin
// venue builder and the attendee event page feed rows into this component,
// so any future visual change (curvature, stairs, spacing, stage, ...) made
// here shows up everywhere. Callers supply the seat data and click behavior;
// this component only draws.
//
// One seat size is calculated for the whole map: the container width is
// divided by the seat count of the widest row (gaps included), so every row
// fits the container width and the map never scrolls horizontally. The size is
// capped at MAX_SEAT so sparse rows stay compact on wide screens; there is no
// minimum, because the map must always fit. The same size is used for every
// seat in every row, and a ResizeObserver recalculates it on resize so it
// adapts responsively (especially mobile).
const MAX_SEAT = 44;
const GAP_RATIO = 0.2;
const LABEL_WIDTH = 32;
const LABEL_GAP = 8;

export type SeatMapSeat = {
  id: string;
  color: string;
  selected?: boolean;
  disabled?: boolean;
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

export function SeatMap({
  rows,
  legend,
}: {
  rows: SeatMapRow[];
  legend?: SeatMapLegendItem[];
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
  const maxSeats = Math.max(1, ...rows.map((row) => row.seats.length));
  const availForSeats = Math.max(1, availW - LABEL_WIDTH - LABEL_GAP);
  const exactSize =
    availForSeats / (maxSeats + (maxSeats - 1) * GAP_RATIO);
  const seatSize = Math.min(MAX_SEAT, exactSize);
  const seatGap = seatSize * GAP_RATIO;

  return (
    <div ref={containerRef} className="space-y-4">
      <div className="flex w-full max-w-full flex-col items-center gap-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <span className="w-8 shrink-0 text-right text-xs text-zinc-500">
              {row.label}
            </span>
            <div className="flex" style={{ gap: seatGap }}>
              {row.seats.map((seat) => (
                <button
                  key={seat.id}
                  type="button"
                  disabled={seat.disabled}
                  onClick={seat.onClick}
                  aria-pressed={seat.selected}
                  aria-label={seat.ariaLabel}
                  className={`shrink-0 rounded-full border transition-colors ${
                    seat.selected
                      ? 'border-black ring-2 ring-offset-1 ring-black'
                      : seat.disabled
                        ? 'cursor-not-allowed border-zinc-300'
                        : 'border-zinc-300'
                  }`}
                  style={{
                    width: seatSize,
                    height: seatSize,
                    backgroundColor: seat.color,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
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
