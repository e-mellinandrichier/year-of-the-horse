import { jsPDF } from "jspdf";
import { dmcIdToColor } from "./dmc";
import { getPaletteIndex } from "./cell-encoding";
import { getCompositeCell } from "./pattern";
import type { PatternState } from "./pattern";
import { symbolForIndex } from "./symbols";
import { compositeStitchStats } from "./stats";

function drawToCanvas(s: PatternState, cellPx: number, grid: boolean): HTMLCanvasElement {
  const w = s.width;
  const h = s.height;
  const c = document.createElement("canvas");
  c.width = w * cellPx;
  c.height = h * cellPx;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cell = getCompositeCell(s, x, y);
      const p = getPaletteIndex(cell);
      if (p > 0) {
        const id = s.palette[p] ?? "310";
        ctx.fillStyle = dmcIdToColor(id);
        ctx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx);
        const sym = symbolForIndex(p);
        ctx.fillStyle = "#111";
        ctx.font = `${Math.max(4, cellPx * 0.4)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(sym, x * cellPx + cellPx / 2, y * cellPx + cellPx / 2);
      }
    }
  }
  if (grid) {
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 0.2;
    for (let x = 0; x <= w; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cellPx, 0);
      ctx.lineTo(x * cellPx, h * cellPx);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellPx);
      ctx.lineTo(w * cellPx, y * cellPx);
      ctx.stroke();
    }
  }
  return c;
}

export function exportPngDataUrl(s: PatternState, cellPx = 8, grid = true): string {
  const c = drawToCanvas(s, cellPx, grid);
  return c.toDataURL("image/png");
}

export function exportPatternPdf(
  s: PatternState,
  options: { title: string; cellPx: number; grid: boolean; legend: boolean }
) {
  const { title, cellPx, grid, legend } = options;
  const w = s.width;
  const h = s.height;
  const pad = 20;
  const { byColor, total } = compositeStitchStats(s);
  const legendH = legend ? 14 + byColor.length * 5 : 0;
  const maxW = 180;
  const maxH = 250;
  const scale = Math.min((maxW * 2) / (w * cellPx + 2 * pad), (maxH * 2) / (h * cellPx + legendH + 2 * pad), 2);
  const px = cellPx * scale;
  const doc = new jsPDF({ orientation: w > h ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  let x0 = (pageW - w * px) / 2;
  let y0 = 20;
  doc.setFontSize(14);
  doc.text(title, pageW / 2, 12, { align: "center" });
  doc.setFontSize(8);
  doc.text(`Stitches: ${total}`, 10, 18);
  y0 = 25;
  if (w * px > pageW - 20) {
    const sc = (pageW - 20) / (w * px);
    const adj = px * sc;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cell = getCompositeCell(s, x, y);
        const p = getPaletteIndex(cell);
        if (p > 0) {
          const id = s.palette[p] ?? "310";
          const col = dmcIdToColor(id);
          const r = parseInt(col.slice(1, 3), 16);
          const g = parseInt(col.slice(3, 5), 16);
          const b = parseInt(col.slice(5, 7), 16);
          doc.setFillColor(r, g, b);
          doc.rect(10 + x * adj, y0 + y * adj, adj, adj, "F");
        }
      }
    }
    if (grid) {
      doc.setDrawColor(180);
      for (let x = 0; x <= w; x++) {
        doc.line(10 + x * adj, y0, 10 + x * adj, y0 + h * adj);
      }
      for (let y = 0; y <= h; y++) {
        doc.line(10, y0 + y * adj, 10 + w * adj, y0 + y * adj);
      }
    }
    if (legend) {
      let yy = y0 + h * adj + 6;
      doc.setFontSize(6);
      doc.text("Legend (DMC / symbol / count):", 10, yy);
      yy += 4;
      for (const row of byColor.slice(0, 30)) {
        const id = s.palette[row.paletteIndex] ?? "";
        const sym = symbolForIndex(row.paletteIndex);
        doc.text(`${id}  ${sym}  ${row.stitches}`, 10, yy);
        yy += 3.5;
      }
    }
  } else {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cell = getCompositeCell(s, x, y);
        const p = getPaletteIndex(cell);
        if (p > 0) {
          const id = s.palette[p] ?? "310";
          const col = dmcIdToColor(id);
          const r = parseInt(col.slice(1, 3), 16);
          const g = parseInt(col.slice(3, 5), 16);
          const b = parseInt(col.slice(5, 7), 16);
          doc.setFillColor(r, g, b);
          doc.rect(x0 + x * px, y0 + y * px, px, px, "F");
        }
      }
    }
    if (grid) {
      doc.setDrawColor(180);
      for (let x = 0; x <= w; x++) {
        doc.line(x0 + x * px, y0, x0 + x * px, y0 + h * px);
      }
      for (let y2 = 0; y2 <= h; y2++) {
        doc.line(x0, y0 + y2 * px, x0 + w * px, y0 + y2 * px);
      }
    }
    if (legend) {
      let yy = y0 + h * px + 6;
      doc.setFontSize(6);
      doc.text("Legend (DMC / symbol / count):", 10, yy);
      yy += 4;
      for (const row of byColor.slice(0, 30)) {
        const id = s.palette[row.paletteIndex] ?? "";
        const sym = symbolForIndex(row.paletteIndex);
        doc.text(`${id}  ${sym}  ${row.stitches}`, 10, yy);
        yy += 3.5;
      }
    }
  }
  return doc;
}
