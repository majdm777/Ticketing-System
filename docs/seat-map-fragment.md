# Shared Seat Map Fragment

The venue seat map is drawn by **one** component, used by both the admin
venue builder and the public event page. Do not duplicate its rendering in
either panel.

- Component: `src/components/seat-map.tsx` → exports `SeatMap`
- Used by:
  - Admin venue builder — `src/app/admin/venues/new/venue-builder.tsx`
  - Public event page — `src/app/e/[slug]/seat-map.tsx` (wraps the shared
    component and feeds it the event's live seat data)

## Why it is shared

Any future **visual** change to the map (curvature, stairs, stage, spacing,
colors, ...) must be made **inside `src/components/seat-map.tsx`** so it shows
up everywhere. Editing the rendering in a page file instead silently forks the
two panels.

**Data changes** (adding/removing rows, seat counts, section assignments,
prices) need no component work — both callers read the same venue/seat records
from the database, so saving the venue immediately reflects on the event page.

## Contract

The component only draws; callers supply the seat data and click behavior.

```ts
export type SeatMapSeat = {
  id: string;
  color: string;          // rendered dot color
  selected?: boolean;
  disabled?: boolean;     // e.g. seat already taken
  onClick: () => void;
  ariaLabel: string;
};

export type SeatMapRow = {
  label: string;          // row label, drawn to the left of the seats
  seats: SeatMapSeat[];
};

export type SeatMapLegendItem = {
  name: string;           // section name
  color: string;
  price?: number | null;  // shown as "· $price" when present
};
```

`SeatMap` renders the rows stacked vertically and centered, then an optional
legend (colored dot + section name + price) below, separated by a border.

## Sizing behavior (do not break this)

- Seat dot size is calculated from the **container width** and the **row with
  the most seats**, so the whole map fits on screen — **no horizontal
  scrolling** (no `overflow-x-auto` anywhere).
- The same size is applied to **every row** for consistency.
- A `ResizeObserver` recalculates on resize, so it adapts responsively
  (especially mobile).
- Seat size is clamped to `MIN_SEAT` (24px) and `MAX_SEAT` (44px). For very
  wide rows where even 24px would overflow, the fitted size wins so nothing
  scrolls off-screen.
- Row label column is 32px + 8px gap to the seats (`LABEL_WIDTH`, `LABEL_GAP`);
  seat gap is 20% of the seat size (`GAP_RATIO`).

## Adding seat data

Callers build a `SeatMapRow[]` from their own source:

- The event page merges all sections' rows into one row-ordered grid, because
  a single venue row can hold seats from more than one section.
- A seat should be `disabled` (grey `#e5e7eb`) when it is not selectable (e.g.
  taken); the event page also marks the currently selected seat with the black
  ring.

## Verification

After touching the seat map: `npx tsc --noEmit` and `npm run lint` must pass.
Check the live page at both mobile (~375px) and desktop widths to confirm
nothing overflows horizontally.
