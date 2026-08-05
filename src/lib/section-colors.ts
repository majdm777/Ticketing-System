// A fixed, readable palette — colors are assigned to sections by a stable
// hash of the section name, not by the order names happen to appear in.
// This guarantees the same section name always maps to the same color,
// regardless of assignment order or which render first introduced it —
// important since colors are never persisted, only ever recomputed.
const PALETTE = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#a855f7', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#6366f1', // indigo
];

const GENERAL_SECTION_COLOR = '#9ca3af'; // neutral gray, reserved for "G"

/**
 * A small, deterministic string hash (djb2). Doesn't need to be
 * cryptographically strong — just stable and reasonably well-distributed
 * across the palette's length.
 */
function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return Math.abs(hash);
}

export function buildSectionColorMap(sectionNames: string[]): Map<string, string> {
  const uniqueNames = Array.from(new Set(sectionNames));
  const map = new Map<string, string>();

  for (const name of uniqueNames) {
    if (name === 'G') {
      map.set(name, GENERAL_SECTION_COLOR);
      continue;
    }
    map.set(name, PALETTE[hashString(name) % PALETTE.length]);
  }

  return map;
}