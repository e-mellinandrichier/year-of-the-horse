import type { StitchKind } from "./types";

/** 0 = empty. Otherwise packed. */
const KIND_SHIFT = 16;

const kindMap: Record<StitchKind, number> = {
  none: 0,
  full: 1,
  half_tl: 2,
  half_tr: 3,
  half_bl: 4,
  half_br: 5,
};

const numToKind: Record<number, StitchKind> = {
  0: "none",
  1: "full",
  2: "half_tl",
  3: "half_tr",
  4: "half_bl",
  5: "half_br",
};

/** paletteIndex 0 = empty. */
export function packCell(paletteIndex: number, kind: StitchKind = "full"): number {
  if (paletteIndex <= 0) return 0;
  const k = kindMap[kind] ?? 1;
  return (k << KIND_SHIFT) | (paletteIndex & 0xffff);
}

export function getPaletteIndex(cell: number): number {
  if (cell === 0) return 0;
  return cell & 0xffff;
}

export function getStitchKind(cell: number): StitchKind {
  if (cell === 0) return "none";
  const n = (cell >>> KIND_SHIFT) & 0xff;
  return numToKind[n] ?? "full";
}

export function isEmptyCell(cell: number): boolean {
  return cell === 0 || getPaletteIndex(cell) === 0;
}
