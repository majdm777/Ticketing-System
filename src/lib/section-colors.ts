// A fixed, readable palette — colors are assigned to sections by the order
// they're first seen, so the same section name always gets the same color
// within a single render (not persisted, purely a display concern).
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

export function buildSectionColorMap(sectionNames: string[]): Map<string, string> {
  const uniqueNames = Array.from(new Set(sectionNames));
  const map = new Map<string, string>();
  let paletteIndex = 0;

  for (const name of uniqueNames) {
    if (name === 'G') {
      map.set(name, GENERAL_SECTION_COLOR);
      continue;
    }
    map.set(name, PALETTE[paletteIndex % PALETTE.length]);
    paletteIndex++;
  }

  return map;
}