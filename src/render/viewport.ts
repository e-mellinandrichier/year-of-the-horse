export type Viewport = {
  /** CSS pixels: cell width at zoom 1 = base (e.g. 12) */
  cellSize: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export function createViewport(): Viewport {
  return { cellSize: 12, zoom: 1, offsetX: 0, offsetY: 0 };
}

export function screenToGrid(
  v: Viewport,
  width: number,
  height: number,
  clientX: number,
  clientY: number,
  rect: DOMRect
): { x: number; y: number; inside: boolean } {
  const cs = v.cellSize * v.zoom;
  const lx = clientX - rect.left;
  const ly = clientY - rect.top;
  const wx = (lx - v.offsetX) / cs;
  const wy = (ly - v.offsetY) / cs;
  const x = Math.floor(wx);
  const y = Math.floor(wy);
  return {
    x,
    y,
    inside: x >= 0 && y >= 0 && x < width && y < height,
  };
}

export function centerPattern(viewW: number, viewH: number, gridW: number, gridH: number, v: Viewport) {
  const cs = v.cellSize * v.zoom;
  v.offsetX = (viewW - gridW * cs) / 2;
  v.offsetY = (viewH - gridH * cs) / 2;
}
