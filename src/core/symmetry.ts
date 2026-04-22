import type { SymmetryMode } from "./types";

export function mirrorPoints(
  w: number,
  h: number,
  x: number,
  y: number,
  mode: SymmetryMode
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [{ x, y }];
  if (mode === "none") return out;
  if (mode === "h" || mode === "quad") {
    out.push({ x: w - 1 - x, y });
  }
  if (mode === "v" || mode === "quad") {
    out.push({ x, y: h - 1 - y });
  }
  if (mode === "quad") {
    out.push({ x: w - 1 - x, y: h - 1 - y });
  }
  const key = (a: { x: number; y: number }) => `${a.x},${a.y}`;
  const s = new Set<string>();
  return out.filter((p) => {
    const k = key(p);
    if (s.has(k)) return false;
    s.add(k);
    return true;
  });
}
