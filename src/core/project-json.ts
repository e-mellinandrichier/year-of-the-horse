import { createPattern, type PatternState } from "./pattern";
import { PROJECT_VERSION, type ProjectDocument, type PatternSnapshot } from "./types";

export function patternToDocument(
  s: PatternState,
  title: string,
  fabricStitchesPer10cm: number
): ProjectDocument {
  const per = s.width * s.height;
  const flat = s.layerCells.flatMap((b) => Array.from(b));
  const pattern: PatternSnapshot = {
    width: s.width,
    height: s.height,
    palette: [...s.palette],
    cells: flat,
    backstitches: s.backstitches.map((b) => ({ ...b })),
    layerCount: s.layerCells.length,
  };
  if (flat.length !== per * s.layerCells.length) {
    throw new Error("internal: layer flat size");
  }
  return {
    version: PROJECT_VERSION,
    meta: { title, fabricStitchesPer10cm },
    pattern,
  };
}

export function serializeProject(s: PatternState, title: string, fabric: number): string {
  return JSON.stringify(patternToDocument(s, title, fabric), null, 2);
}

export function parseProjectJson(text: string): ProjectDocument {
  return JSON.parse(text) as ProjectDocument;
}

export function documentToPattern(doc: ProjectDocument): PatternState {
  const p = doc.pattern;
  const per = p.width * p.height;
  const layerCount = p.layerCount ?? 1;
  if (p.cells.length !== per * layerCount) {
    throw new Error("Invalid project: cell buffer length does not match grid and layer count.");
  }
  const first = p.palette[1] ?? "310";
  const s = createPattern(p.width, p.height, first);
  s.palette = [...p.palette];
  s.backstitches = p.backstitches.map((b) => ({ ...b }));
  s.layerCells = [];
  for (let L = 0; L < layerCount; L++) {
    const src = p.cells.slice(L * per, (L + 1) * per);
    s.layerCells.push(Uint32Array.from(src));
  }
  s.cells = s.layerCells[0]!;
  s.layerMetas = Array.from({ length: layerCount }, (_, i) => ({
    id: `layer-${i + 1}`,
    name: `Layer ${i + 1}`,
    visible: true,
  }));
  s.activeLayerIndex = 0;
  return s;
}
