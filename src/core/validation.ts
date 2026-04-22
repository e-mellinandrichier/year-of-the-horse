import { getPaletteIndex } from "./cell-encoding";
import { getCompositeCell } from "./pattern";
import type { PatternState } from "./pattern";

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

/** Cells that are non-empty in composite but have no same-colour 8-neighbour. */
export function findIsolatedStitches(s: PatternState): { x: number; y: number }[] {
  const w = s.width;
  const h = s.height;
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = getCompositeCell(s, x, y);
      const p = getPaletteIndex(c);
      if (p <= 0) continue;
      let neighbor = false;
      for (let d = 0; d < 8; d++) {
        const nx = x + DX[d]!;
        const ny = y + DY[d]!;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const c2 = getCompositeCell(s, nx, ny);
        if (getPaletteIndex(c2) === p) {
          neighbor = true;
          break;
        }
      }
      if (!neighbor) out.push({ x, y });
    }
  }
  return out;
}
