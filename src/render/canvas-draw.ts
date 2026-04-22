import { dmcIdToColor } from "@core/dmc";
import { getPaletteIndex, getStitchKind } from "@core/cell-encoding";
import { getCompositeCell } from "@core/pattern";
import type { PatternState } from "@core/pattern";
import type { Viewport } from "./viewport";
import { symbolForIndex } from "@core/symbols";
import { bresenhamLine } from "@core/draw-ops";

export function drawPatternCanvas(
  ctx: CanvasRenderingContext2D,
  s: PatternState,
  v: Viewport,
  options: { grid: boolean; showBackstitch: boolean; labelZoom?: number }
) {
  const w = s.width;
  const h = s.height;
  const cs = v.cellSize * v.zoom;
  const bg = getComputedStyle(ctx.canvas).getPropertyValue("--yoth-bg") || "#1a1a1a";
  const gline = getComputedStyle(ctx.canvas).getPropertyValue("--yoth-grid") || "#333";
  const fg = getComputedStyle(ctx.canvas).getPropertyValue("--yoth-fg") || "#e0e0e0";
  ctx.save();
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.translate(v.offsetX, v.offsetY);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cell = getCompositeCell(s, x, y);
      const p = getPaletteIndex(cell);
      if (p > 0) {
        const id = s.palette[p] ?? "310";
        ctx.fillStyle = dmcIdToColor(id);
        ctx.fillRect(x * cs, y * cs, cs + 0.5, cs + 0.5);
        const sk = getStitchKind(cell);
        if (sk !== "none" && sk !== "full") {
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          if (sk === "half_tl" || sk === "half_tr")
            ctx.fillRect(x * cs, y * cs, cs, cs / 2);
          if (sk === "half_bl" || sk === "half_br")
            ctx.fillRect(x * cs, y * cs + cs / 2, cs, cs / 2);
        }
        if (options.labelZoom && v.zoom * v.cellSize >= (options.labelZoom ?? 8)) {
          const sym = symbolForIndex(p);
          ctx.fillStyle = "#0a0a0a";
          ctx.font = `${Math.max(6, cs * 0.45)}px system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(sym, x * cs + cs / 2, y * cs + cs / 2);
        }
      } else {
        ctx.fillStyle = "transparent";
        ctx.fillRect(x * cs, y * cs, cs, cs);
      }
    }
  }
  if (options.grid) {
    ctx.strokeStyle = gline;
    ctx.lineWidth = Math.max(0.5, 1 / (v.zoom || 1));
    for (let x = 0; x <= w; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cs, 0);
      ctx.lineTo(x * cs, h * cs);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cs);
      ctx.lineTo(w * cs, y * cs);
      ctx.stroke();
    }
  }
  if (options.showBackstitch) {
    ctx.strokeStyle = fg;
    ctx.lineWidth = Math.max(1, 2 * v.zoom);
    for (const b of s.backstitches) {
      const c = s.palette[b.paletteIndex];
      if (c) ctx.strokeStyle = dmcIdToColor(c);
      const p0 = bresenhamLine(b.x0, b.y0, b.x1, b.y1);
      if (p0.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(p0[0]!.x * cs + cs / 2, p0[0]!.y * cs + cs / 2);
      for (let i = 1; i < p0.length; i++) {
        ctx.lineTo(p0[i]!.x * cs + cs / 2, p0[i]!.y * cs + cs / 2);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}
