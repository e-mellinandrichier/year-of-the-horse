import { packCell, getPaletteIndex, getStitchKind } from "./cell-encoding";
import type { BackstitchLine, LayerMeta, StitchKind } from "./types";

export type PatternState = {
  width: number;
  height: number;
  /** index 0 unused; `palette[1]` = first real thread */
  palette: string[];
  cells: Uint32Array;
  backstitches: BackstitchLine[];
  /** Stacked from bottom to top; each layer has its own cell buffer, same width×height. */
  layerCells: Uint32Array[];
  layerMetas: LayerMeta[];
  activeLayerIndex: number;
};

const LAYER_ID_MAIN = "main";

function makeLayerArray(width: number, height: number) {
  return new Uint32Array(width * height);
}

export function createPattern(
  width: number,
  height: number,
  firstThread: string
): PatternState {
  const L0 = makeLayerArray(width, height);
  const palette: string[] = [""];
  if (firstThread) {
    palette.push(firstThread);
  }
  return {
    width,
    height,
    palette,
    cells: L0,
    backstitches: [],
    layerCells: [L0],
    layerMetas: [{ id: LAYER_ID_MAIN, name: "Layer 1", visible: true }],
    activeLayerIndex: 0,
  };
}

function activeBuffer(s: PatternState): Uint32Array {
  return s.layerCells[s.activeLayerIndex] ?? s.cells;
}

export function getCell(s: PatternState, x: number, y: number, layer = s.activeLayerIndex): number {
  if (x < 0 || y < 0 || x >= s.width || y >= s.height) return 0;
  const buf = s.layerCells[layer] ?? s.layerCells[0]!;
  return buf[y * s.width + x] | 0;
}

export function getCompositeCell(s: PatternState, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= s.width || y >= s.height) return 0;
  for (let L = s.layerCells.length - 1; L >= 0; L--) {
    if (!s.layerMetas[L]?.visible) continue;
    const v = s.layerCells[L]![y * s.width + x] | 0;
    if (v !== 0) return v;
  }
  return 0;
}

export function setCell(
  s: PatternState,
  x: number,
  y: number,
  paletteIndex: number,
  kind: StitchKind
): void {
  if (x < 0 || y < 0 || x >= s.width || y >= s.height) return;
  const buf = activeBuffer(s);
  buf[y * s.width + x] = packCell(paletteIndex, kind) >>> 0;
}

export function setRawCell(s: PatternState, x: number, y: number, raw: number): void {
  if (x < 0 || y < 0 || x >= s.width || y >= s.height) return;
  const buf = activeBuffer(s);
  buf[y * s.width + x] = raw >>> 0;
}

export function findOrAddPalette(s: PatternState, dmcId: string): number {
  const i = s.palette.indexOf(dmcId);
  if (i > 0) return i;
  s.palette.push(dmcId);
  return s.palette.length - 1;
}

export function replacePaletteIndexEverywhere(
  s: PatternState,
  fromIdx: number,
  toIdx: number
): void {
  for (const buf of s.layerCells) {
    for (let i = 0; i < buf.length; i++) {
      if (getPaletteIndex(buf[i]!) === fromIdx) {
        const k = getStitchKind(buf[i]!);
        buf[i] = packCell(toIdx, k) >>> 0;
      }
    }
  }
  for (const bs of s.backstitches) {
    if (bs.paletteIndex === fromIdx) bs.paletteIndex = toIdx;
  }
}

export function addBackstitch(
  s: PatternState,
  a: { x0: number; y0: number; x1: number; y1: number; paletteIndex: number }
) {
  s.backstitches.push({ ...a });
}

export function clonePattern(s: PatternState): PatternState {
  const layerCells = s.layerCells.map((b) => new Uint32Array(b));
  return {
    width: s.width,
    height: s.height,
    palette: [...s.palette],
    cells: layerCells[0]!,
    backstitches: s.backstitches.map((b) => ({ ...b })),
    layerCells,
    layerMetas: s.layerMetas.map((m) => ({ ...m })),
    activeLayerIndex: s.activeLayerIndex,
  };
}

export function addLayer(s: PatternState, name: string) {
  const b = makeLayerArray(s.width, s.height);
  s.layerCells.push(b);
  s.layerMetas.push({
    id: `L${s.layerMetas.length + 1}`,
    name,
    visible: true,
  });
  s.activeLayerIndex = s.layerCells.length - 1;
}

export function setActiveLayer(s: PatternState, index: number) {
  if (index < 0 || index >= s.layerCells.length) return;
  s.activeLayerIndex = index;
}

/**
 * Resizes the grid, copying the overlap region (top-left) into a new width×height. Other cells are empty.
 * Backstitches are removed if any endpoint lies outside the new grid.
 */
export function resizePattern(s: PatternState, newW: number, newH: number): void {
  const w = Math.max(1, Math.min(10_000, Math.floor(newW)));
  const h = Math.max(1, Math.min(10_000, Math.floor(newH)));
  if (w === s.width && h === s.height) return;
  const ow = s.width;
  const oh = s.height;
  const copyW = Math.min(ow, w);
  const copyH = Math.min(oh, h);
  for (let li = 0; li < s.layerCells.length; li++) {
    const old = s.layerCells[li]!;
    const next = new Uint32Array(w * h);
    for (let y = 0; y < copyH; y++) {
      for (let x = 0; x < copyW; x++) {
        next[y * w + x] = old[y * ow + x]!;
      }
    }
    s.layerCells[li] = next;
  }
  s.width = w;
  s.height = h;
  s.cells = s.layerCells[0]!;
  s.backstitches = s.backstitches.filter(
    (b) =>
      b.x0 >= 0 &&
      b.x0 < w &&
      b.y0 >= 0 &&
      b.y0 < h &&
      b.x1 >= 0 &&
      b.x1 < w &&
      b.y1 >= 0 &&
      b.y1 < h
  );
}

export { getStitchKind, getPaletteIndex, LAYER_ID_MAIN };
