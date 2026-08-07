# Shared Seat Map Fragment

The venue seat map is drawn by **one** component, used by both the admin
venue builder and the public event page. Do not duplicate its rendering in
either panel.

- Component: `src/components/seat-map.tsx` → exports `SeatMap`
- Data builder: `src/lib/seat-map-data.ts` → exports `buildSeatMapData`
  (flattens seats into one row-ordered grid, merged across sections, with
  section colors and selectability)
- Used by:
  - Admin venue builder — `src/app/admin/venues/new/venue-builder.tsx`
  - Public event page — `src/app/e/[slug]/seat-map.tsx` (wraps the shared
    component and feeds it the event's live seat data)
  - Admin guest booking — `src/app/admin/bookings/new/guest-booking-form.tsx`
    (uses the shared component and the data builder)

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
  number?: string;        // seat number, drawn inside the seat
  gap?: boolean;          // blocked-out position (no section, not bookable)
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

### Built-in rendering (do not fork in pages)

All of this lives in the shared component, so it shows up in every caller:

- **Stage bar**: a full-width labeled bar above the rows. `stageLabel`
  defaults to `"STAGE"`; pass `""` to hide it.
- **Three flat blocks (left | middle | right)**: a contiguous `1..N` row is
  drawn as three flat blocks separated by two gaps, numbered center-out so
  seat 1 and 2 sit at the middle's center:
  `15 13 11 | 9 7 5 3 1 2 4 6 8 | 10 12 14` (a 15-seat row).
  The sides are always equal and smaller than the middle:
  `side = floor(N / 4)`, `middle = N - 2 * side` — 38 seats → `9/20/9`,
  41 seats → `10/21/10`. Rows with fewer than 4 seats, or numbers that
  aren't exactly `1..N`, stay in the caller-provided order as one block.
  Purely visual — seat ids, click targets, and `venueSeatId`s are unchanged.
- **Seat numbers**: `number` is drawn inside the seat (scaled to the seat
  size, hidden below ~20px). Text color is picked from the seat color for
  contrast.
- **Gap seats**: a `gap` seat keeps its numbered position in the row (so
  numbering and the three-block split stay intact) but renders as an **empty
  slot** — no border, no number, not clickable, never bookable. In the venue
  builder, `gapEditable` turns them into dashed, hatched placeholders so they
  can be selected and restored. Gap seats are always included in the row width
  math.

## Data builder

`buildSeatMapData(seats)` takes a flat `SeatMapDataInput[]` (one entry per
EventSeat: `id`, `venueSeatId`, `row`, `number`, `section`, `status`) and
returns `{ rows, sectionColors }`:

- rows merged across sections into one grid (keyed by row label), sorted in
  row order then by seat number
- colors assigned via `buildSectionColorMap` (stable per section name)
- `available` derived from `status === 'AVAILABLE'`
- `gap` derived from `status === 'GAP'`; gap seats carry an empty section and
  render as empty slots (see above)

The public event page and the guest-booking form both flatten their seat data
into this shape; the venue builder passes raw builder rows directly (it has
no EventSeats yet).

## Sizing behavior (do not break this)

- **One seat size for the whole map**: the container width (minus the row
  label column) is divided by the seat count of the **widest row**, gaps and
  the two block gaps (1 seat-width each) included, and that single size is
  applied to **every seat in every row**.
- The map is capped at `MAX_SEAT` (44px) so sparse rows stay compact on wide
  screens. There is **no minimum** — the map must always fit, so on a narrow
  screen a long row simply uses smaller seats.
- The entire map shares the **container width** (`w-full`); by construction no
  row is ever wider than the container, so there is **no horizontal
  scrolling** and **no `overflow-x-auto` anywhere**.
- A `ResizeObserver` recalculates the size on resize, so it adapts
  responsively (especially mobile).
- Row label column is 32px + 8px gap to the seats (`LABEL_WIDTH`, `LABEL_GAP`);
  seat gap is 20% of the seat size (`GAP_RATIO`); each block gap is one seat
  width (`AISLE_RATIO`), two per split row.

## Adding seat data

Callers build a `SeatMapRow[]` from their own source:

- The event page and guest-booking form use `buildSeatMapData` (which merges
  all sections' rows into one row-ordered grid, because a single venue row can
  hold seats from more than one section).
- A seat should be `disabled` (grey `#e5e7eb`) when it is not selectable (e.g.
  taken); the event page also marks the currently selected seat with the black
  ring.

## Verification

After touching the seat map: `npx tsc --noEmit` and `npm run lint` must pass.
Check the live page at both mobile (~375px) and desktop widths to confirm the
whole map fits the container, all rows use the same seat size, and nothing
overflows horizontally.
