import type { PatternState } from "./pattern";
import { getCell } from "./pattern";
export type SelectionBuffer = {
  w: number;
  h: number;
  /** relative to min corner */
  cells: number[];
  empty: boolean;
};

export function copyRegion(
  s: PatternState,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): SelectionBuffer {
  const loX = Math.min(x0, x1);
  const hiX = Math.max(x0, x1);
  const loY = Math.min(y0, y1);
  const hiY = Math.max(y0, y1);
  const w = hiX - loX + 1;
  const h = hiY - loY + 1;
  const cells = new Array<number>(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      cells[j * w + i] = getCell(s, loX + i, loY + j) | 0;
    }
  }
  return { w, h, cells, empty: cells.every((c) => c === 0) };
}

export function pasteRegion(
  s: PatternState,
  src: SelectionBuffer,
  destX: number,
  destY: number
) {
  const buf = s.layerCells[s.activeLayerIndex]!;
  for (let j = 0; j < src.h; j++) {
    for (let i = 0; i < src.w; i++) {
      const raw = src.cells[j * src.w + i]!;
      if (raw === 0) continue;
      const x = destX + i;
      const y = destY + j;
      if (x < 0 || y < 0 || x >= s.width || y >= s.height) continue;
      const idx = y * s.width + x;
      buf[idx] = raw >>> 0;
    }
  }
}

export function copyRegionToString(buf: SelectionBuffer): string {
  return JSON.stringify(buf);
}

export function parseSelectionFromString(t: string): SelectionBuffer {
  return JSON.parse(t) as SelectionBuffer;
}
