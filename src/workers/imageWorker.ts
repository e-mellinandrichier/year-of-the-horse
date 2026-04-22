import { imageToDmcGrid } from "../core/image-convert";

export type WorkerIn = {
  data: { width: number; height: number; data: Uint8ClampedArray };
  outW: number;
  outH: number;
  maxColors: number;
  dither: "none" | "floyd";
};

self.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const { data, outW, outH, maxColors, dither } = ev.data;
  const d = new Uint8ClampedArray(data.data);
  const id = new ImageData(d, data.width, data.height);
  const r = imageToDmcGrid(id, outW, outH, maxColors, dither);
  (self as unknown as Worker).postMessage(r);
};
