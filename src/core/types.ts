/** Project file format (JSON). */
export const PROJECT_VERSION = 1 as const;

export type StitchKind = "none" | "full" | "half_tl" | "half_tr" | "half_bl" | "half_br";

export type BackstitchLine = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 1-based index into `pattern.palette` */
  paletteIndex: number;
};

export type SymmetryMode = "none" | "h" | "v" | "quad";

export type ProjectDocument = {
  version: typeof PROJECT_VERSION;
  meta: {
    title: string;
    fabricStitchesPer10cm: number;
  };
  pattern: PatternSnapshot;
  /** Optional: grid overlay visible by default in UI; stored in localStorage too. */
  ui?: { gridVisible?: boolean; theme?: "light" | "dark" };
};

export type PatternSnapshot = {
  width: number;
  height: number;
  /** DMC or custom colour codes; `palette[0]` is not used; index 0 in cells = empty. */
  palette: string[];
  /** Packed cell values; if `layerCount` > 1, length = width×height×layerCount (layers bottom→top). */
  cells: number[];
  backstitches: BackstitchLine[];
  /** Default 1. */
  layerCount?: number;
};

export type LayerMeta = { id: string; name: string; visible: boolean };
