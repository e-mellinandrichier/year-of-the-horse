import { packCell, getPaletteIndex, getStitchKind } from "./cell-encoding";
import type { PatternState } from "./pattern";
import type { StitchKind } from "./types";

export function bresenhamLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    pts.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
}

function plotEllipsePoints(cx: number, cy: number, x: number, y: number, out: { x: number; y: number }[]) {
  out.push(
    { x: cx + x, y: cy + y },
    { x: cx - x, y: cy + y },
    { x: cx + x, y: cy - y },
    { x: cx - x, y: cy - y }
  );
}

export function rasterEllipseOutline(
  cx: number,
  cy: number,
  rx: number,
  ry: number
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let x = 0;
  let y = ry;
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const twoRx2 = 2 * rx2;
  const twoRy2 = 2 * ry2;
  let p = Math.round(ry2 - rx2 * ry + 0.25 * rx2);
  let px = 0;
  let py = twoRx2 * y;
  while (px < py) {
    x++;
    px += twoRy2;
    if (p < 0) p += px + ry2;
    else {
      y--;
      py -= twoRx2;
      p += px - py + ry2;
    }
    plotEllipsePoints(cx, cy, x, y, out);
  }
  p = Math.round(ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2);
  px = twoRy2 * x;
  py = twoRx2 * y;
  while (y > 0) {
    y--;
    py -= twoRx2;
    if (p > 0) p += rx2 - py;
    else {
      x++;
      px += twoRy2;
      p += px - py + rx2;
    }
    plotEllipsePoints(cx, cy, x, y, out);
  }
  const set = new Set<string>();
  const uniq: { x: number; y: number }[] = [];
  for (const pt of out) {
    const k = `${pt.x},${pt.y}`;
    if (!set.has(k)) {
      set.add(k);
      uniq.push(pt);
    }
  }
  return uniq;
}

export function rectOutline(x0: number, y0: number, x1: number, y1: number) {
  const a = bresenhamLine(x0, y0, x1, y0);
  const b = bresenhamLine(x1, y0, x1, y1);
  const c = bresenhamLine(x1, y1, x0, y1);
  const d = bresenhamLine(x0, y1, x0, y0);
  return [...a, ...b, ...c, ...d];
}

export function rectFillRegion(x0: number, y0: number, x1: number, y1: number) {
  const loX = Math.min(x0, x1);
  const hiX = Math.max(x0, x1);
  const loY = Math.min(y0, y1);
  const hiY = Math.max(y0, y1);
  const out: { x: number; y: number }[] = [];
  for (let y = loY; y <= hiY; y++) for (let x = loX; x <= hiX; x++) out.push({ x, y });
  return out;
}

export function floodFill(
  s: PatternState,
  startX: number,
  startY: number,
  newIdx: number,
  kind: StitchKind
) {
  const buf = s.layerCells[s.activeLayerIndex]!;
  const w = s.width;
  const h = s.height;
  if (startX < 0 || startY < 0 || startX >= w || startY >= h) return;
  const start = startY * w + startX;
  const target = buf[start]!;
  const targetIdx = getPaletteIndex(target);
  if (newIdx === targetIdx && getStitchKind(target) === kind) return;
  const stack: number[] = [start];
  const seen = new Uint8Array(w * h);
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    if (getPaletteIndex(buf[i]!) !== targetIdx) continue;
    seen[i] = 1;
    buf[i] = packCell(newIdx, kind) >>> 0;
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) stack.push(i - 1);
    if (x + 1 < w) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y + 1 < h) stack.push(i + w);
  }
}
