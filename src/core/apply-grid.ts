import { findOrAddPalette, setCell, createPattern, type PatternState } from "./pattern";

export function applyDmcStringGrid(
  grid: string[],
  w: number,
  h: number
): PatternState {
  const s = createPattern(w, h, "310");
  s.palette = [""];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const id = grid[y * w + x] ?? "";
      if (!id) continue;
      const idx = findOrAddPalette(s, id);
      setCell(s, x, y, idx, "full");
    }
  }
  return s;
}
