import { getDmcById, getDmcList } from "./dmc";

function srgbToLin(c: number) {
  if (c <= 0.04045) return c / 12.92;
  return ((c + 0.055) / 1.055) ** 2.4;
}

function hexToRgb(h: string): [number, number, number] {
  const c = h.replace("#", "");
  return [parseInt(c.slice(0, 2), 16) / 255, parseInt(c.slice(2, 4), 16) / 255, parseInt(c.slice(4, 6), 16) / 255];
}

function distLab(a: [number, number, number], b: [number, number, number]) {
  const r1 = srgbToLin(a[0]);
  const g1 = srgbToLin(a[1]);
  const b1 = srgbToLin(a[2]);
  const r2 = srgbToLin(b[0]);
  const g2 = srgbToLin(b[1]);
  const b2 = srgbToLin(b[2]);
  // Simple sRGB distance (faster than true Lab; good enough for mapping)
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

export function nearestDmc(hex: string): string {
  const t = [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255] as [
    number,
    number,
    number,
  ];
  const list = getDmcList();
  let best = list[0]!.id;
  let d = 1e9;
  for (const e of list) {
    const rgb = hexToRgb(e.c);
    const di = distLab(t, rgb);
    if (di < d) {
      d = di;
      best = e.id;
    }
  }
  return best;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function sampleImageRgba(
  data: ImageData,
  w: number,
  h: number,
  u: number,
  v: number
): [number, number, number, number] {
  const x = Math.min(w - 1, Math.max(0, (u * (w - 1)) | 0));
  const y = Math.min(h - 1, Math.max(0, (v * (h - 1)) | 0));
  const i = (y * w + x) * 4;
  const p = data.data;
  return [p[i]! / 255, p[i + 1]! / 255, p[i + 2]! / 255, p[i + 3]! / 255];
}

export function imageToDmcGrid(
  data: ImageData,
  outW: number,
  outH: number,
  maxColors: number,
  dither: "none" | "floyd"
): { grid: string[]; w: number; h: number } {
  const w = data.width;
  const h = data.height;
  const grid = new Array<string>(outW * outH);
  // Sample cluster centers
  const samples: [number, number, number][] = [];
  const step = Math.max(1, Math.floor((w * h) / (maxColors * 20)));
  for (let i = 0; i < w * h; i += step) {
    const x = i % w;
    const y = (i / w) | 0;
    const j = (y * w + x) * 4;
    const p = data.data;
    if ((p[j + 3] ?? 0) < 8) continue;
    samples.push([p[j]! / 255, p[j + 1]! / 255, p[j + 2]! / 255]);
    if (samples.length > 200) break;
  }
  if (samples.length < maxColors) {
    for (let k = 0; k < maxColors; k++) {
      const x = lerp(0, w - 1, k / maxColors) | 0;
      const y = lerp(0, h - 1, k / maxColors) | 0;
      const j = (y * w + x) * 4;
      const p = data.data;
      samples.push([p[j]! / 255, p[j + 1]! / 255, p[j + 2]! / 255]);
    }
  }
  // Very small k-means
  const k = Math.min(maxColors, samples.length, getDmcList().length);
  let centroids = samples.slice(0, k);
  for (let it = 0; it < 4; it++) {
    const buckets: [number, number, number][] = new Array(k)
      .fill(0)
      .map(() => [0, 0, 0]);
    const counts = new Array(k).fill(0);
    for (const s of samples) {
      let bi = 0;
      let bd = 1e9;
      for (let c = 0; c < k; c++) {
        const d = distLab(s, centroids[c]!);
        if (d < bd) {
          bd = d;
          bi = c;
        }
      }
      for (let t = 0; t < 3; t++) buckets[bi]![t] += s[t]!;
      counts[bi]!++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c]! > 0) {
        centroids[c] = [buckets[c]![0]! / counts[c]!, buckets[c]![1]! / counts[c]!, buckets[c]![2]! / counts[c]!];
      }
    }
  }
  const dmcIds = centroids.map((c) => {
    const hhex2 =
      [c[0], c[1], c[2]]
        .map((u) => Math.min(255, (u! * 255) | 0).toString(16).padStart(2, "0"))
        .join("") + "";
    return nearestDmc(hhex2);
  });
  if (dither === "floyd") {
    const eW = outW;
    const eH = outH;
    const errR = new Float32Array(eW * eH);
    const errG = new Float32Array(eW * eH);
    const errB = new Float32Array(eW * eH);
    for (let y = 0; y < eH; y++) {
      for (let x = 0; x < eW; x++) {
        const u = (x + 0.5) / eW;
        const v = (y + 0.5) / eH;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let sy = 0; sy < 1; sy += 0.5) {
          for (let sx = 0; sx < 1; sx += 0.5) {
            const c = sampleImageRgba(data, w, h, lerp(u - 0.5 / eW, u + 0.5 / eW, sx + 0.25), lerp(v - 0.5 / eH, v + 0.5 / eH, sy + 0.25));
            r += c[0];
            g += c[1];
            b += c[2];
            a += c[3];
          }
        }
        r /= 4;
        g /= 4;
        b /= 4;
        a /= 4;
        const i = y * eW + x;
        r += errR[i]!;
        g += errG[i]!;
        b += errB[i]!;
        let bi = 0;
        let bd = 1e9;
        for (let c = 0; c < k; c++) {
          const t = dmcToRgbTrio(dmcIds[c]!);
          const d = (r - t[0]) ** 2 + (g - t[1]) ** 2 + (b - t[2]) ** 2;
          if (d < bd) {
            bd = d;
            bi = c;
          }
        }
        const ch = dmcIds[bi]!;
        const t = dmcToRgbTrio(ch);
        const er = r - t[0];
        const eg = g - t[1];
        const eb = b - t[2];
        if (a < 0.1) {
          grid[i] = "";
          continue;
        }
        grid[i] = ch;
        if (x + 1 < eW) {
          const j = y * eW + (x + 1);
          errR[j] += (er * 7) / 16;
          errG[j] += (eg * 7) / 16;
          errB[j] += (eb * 7) / 16;
        }
        if (y + 1 < eH) {
          if (x > 0) {
            const j = (y + 1) * eW + (x - 1);
            errR[j] += (er * 3) / 16;
            errG[j] += (eg * 3) / 16;
            errB[j] += (eb * 3) / 16;
          }
          {
            const j = (y + 1) * eW + x;
            errR[j] += (er * 5) / 16;
            errG[j] += (eg * 5) / 16;
            errB[j] += (eb * 5) / 16;
          }
          if (x + 1 < eW) {
            const j = (y + 1) * eW + (x + 1);
            errR[j] += (er * 1) / 16;
            errG[j] += (eg * 1) / 16;
            errB[j] += (eb * 1) / 16;
          }
        }
      }
    }
  } else {
    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        const u = (x + 0.5) / outW;
        const v = (y + 0.5) / outH;
        const c = sampleImageRgba(data, w, h, u, v);
        if (c[3] < 0.1) {
          grid[y * outW + x] = "";
          continue;
        }
        let bi = 0;
        let bd = 1e9;
        for (let i = 0; i < k; i++) {
          const t = dmcToRgbTrio(dmcIds[i]!);
          const d = (c[0] - t[0]) ** 2 + (c[1] - t[1]) ** 2 + (c[2] - t[2]) ** 2;
          if (d < bd) {
            bd = d;
            bi = i;
          }
        }
        grid[y * outW + x] = dmcIds[bi]!;
      }
    }
  }
  return { grid, w: outW, h: outH };
}

function dmcToRgbTrio(id: string): [number, number, number] {
  const e = getDmcById(id);
  if (!e) return [0.5, 0.5, 0.5];
  const c = e.c;
  return [parseInt(c.slice(0, 2), 16) / 255, parseInt(c.slice(2, 4), 16) / 255, parseInt(c.slice(4, 6), 16) / 255];
}
