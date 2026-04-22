import { getPaletteIndex } from "./cell-encoding";
import type { PatternState } from "./pattern";
import { getCompositeCell } from "./pattern";

export type ColorStat = { paletteIndex: number; stitches: number };

export function compositeStitchStats(s: PatternState): { total: number; byColor: ColorStat[] } {
  const m = new Map<number, number>();
  let total = 0;
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      const cell = getCompositeCell(s, x, y);
      const p = getPaletteIndex(cell);
      if (p <= 0) continue;
      total++;
      m.set(p, (m.get(p) ?? 0) + 1);
    }
  }
  const byColor: ColorStat[] = [...m.entries()]
    .map(([paletteIndex, stitches]) => ({ paletteIndex, stitches }))
    .sort((a, b) => b.stitches - a.stitches);
  return { total, byColor };
}

/**
 * Approximate metres of 6-strand floss for full crosses (very rough: ~0.004 m per full stitch @ 2 strands).
 */
export function estimateThreadMetres(stitchCount: number, strands = 2): number {
  const metresPerFullStitch = 0.004 * (strands / 2);
  return stitchCount * metresPerFullStitch;
}

/** Real width/height in mm from stitch count and stitches per 10 cm (e.g. 14 count ≈ 14 stitches / 4 per cm). */
export function stitchesToMm(stitches: number, stitchesPer10cm: number): number {
  if (stitchesPer10cm <= 0) return 0;
  return (stitches / stitchesPer10cm) * 100;
}
