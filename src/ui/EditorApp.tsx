import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { readTextFile, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import {
  addBackstitch,
  addLayer,
  createPattern,
  findOrAddPalette,
  replacePaletteIndexEverywhere,
  resizePattern,
  setActiveLayer,
  setCell,
  setRawCell,
  type PatternState,
} from "../core/pattern";
import type { SymmetryMode, StitchKind } from "../core/types";
import { mirrorPoints } from "../core/symmetry";
import {
  bresenhamLine,
  floodFill,
  rasterEllipseOutline,
  rectFillRegion,
  rectOutline,
} from "../core/draw-ops";
import { drawPatternCanvas } from "../render/canvas-draw";
import { createViewport, screenToGrid, type Viewport, centerPattern } from "../render/viewport";
import { serializeProject, documentToPattern } from "../core/project-json";
import { dmcIdToColor } from "../core/dmc";
import { compositeStitchStats } from "../core/stats";
import { copyRegion, parseSelectionFromString, pasteRegion, type SelectionBuffer } from "../core/clipboard";
import { findIsolatedStitches } from "../core/validation";
import { applyDmcStringGrid } from "../core/apply-grid";
import { exportPngDataUrl, exportPatternPdf } from "../core/export-files";
import { UndoStack } from "../core/undo";
import { useTheme } from "./ThemeContext";

type Tool =
  | "pencil"
  | "eraser"
  | "fill"
  | "line"
  | "rect"
  | "rect_fill"
  | "ellipse"
  | "select"
  | "backstitch";

type ShapeDrag = {
  kind: Tool;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export function EditorApp() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const pat = useRef<PatternState>(createPattern(64, 64, "310"));
  const undo = useRef(new UndoStack());
  const [renderVersion, bumpRender] = useReducer((n: number) => n + 1, 0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const vp = useRef<Viewport>(createViewport());
  const lastGrid = useRef<{ x: number; y: number } | null>(null);
  const backAnchor = useRef<{ x: number; y: number } | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const [tool, setTool] = useState<Tool>("pencil");
  const [stitchKind, setStitchKind] = useState<StitchKind>("full");
  const [colorIdx, setColorIdx] = useState(1);
  const [grid, setGrid] = useState(true);
  const [title, setTitle] = useState("Untitled");
  const [fabric, setFabric] = useState(14);
  const [sym, setSym] = useState<SymmetryMode>("none");
  const [drag, setDrag] = useState<ShapeDrag | { kind: "draw" } | { kind: "pan" } | null>(null);
  const [selBuf, setSelBuf] = useState<SelectionBuffer | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [isoMsg, setIsoMsg] = useState("");
  const [gridW, setGridW] = useState(64);
  const [gridH, setGridH] = useState(64);
  const [pickerColor, setPickerColor] = useState("#000000");
  const lastPatSize = useRef({ w: 64, h: 64 });

  const panLast = useRef({ x: 0, y: 0 });

  const refresh = useCallback(() => {
    bumpRender();
  }, []);

  const commit = useCallback(() => {
    undo.current.push(pat.current);
  }, []);

  const withPat = (fn: (p: PatternState) => void) => {
    commit();
    fn(pat.current);
    refresh();
  };

  useEffect(() => {
    if (lastPatSize.current.w !== pat.current.width || lastPatSize.current.h !== pat.current.height) {
      lastPatSize.current = { w: pat.current.width, h: pat.current.height };
      setGridW(pat.current.width);
      setGridH(pat.current.height);
    }
  }, [renderVersion]);

  useEffect(() => {
    const cur = pat.current.palette[colorIdx];
    if (cur) {
      setPickerColor(dmcIdToColor(cur));
    }
  }, [colorIdx]);

  const applyZoomAtPoint = useCallback(
    (clientX: number, clientY: number, zoomMultiplier: number) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const v = vp.current;
      const oldZoom = v.zoom;
      const newZoom = Math.max(0.2, Math.min(8, oldZoom * zoomMultiplier));
      if (newZoom === oldZoom) return;
      const cs0 = v.cellSize * oldZoom;
      const cs1 = v.cellSize * newZoom;
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      const worldX = (localX - v.offsetX) / cs0;
      const worldY = (localY - v.offsetY) / cs0;
      v.zoom = newZoom;
      v.offsetX = localX - worldX * cs1;
      v.offsetY = localY - worldY * cs1;
      refresh();
    },
    [refresh]
  );

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const v = vp.current;
    const dpr = window.devicePixelRatio;
    const raf = requestAnimationFrame(() => {
      const ctx = c.getContext("2d");
      if (!ctx) return;
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPatternCanvas(ctx, pat.current, v, { grid, showBackstitch: true, labelZoom: 6 });
      if (
        drag &&
        "x0" in drag &&
        (drag.kind === "rect" || drag.kind === "rect_fill" || drag.kind === "ellipse" || drag.kind === "select")
      ) {
        const d = drag as ShapeDrag;
        const r = c.getBoundingClientRect();
        const g0 = screenToGrid(v, pat.current.width, pat.current.height, d.x0, d.y0, r);
        const g1 = screenToGrid(v, pat.current.width, pat.current.height, d.x1, d.y1, r);
        const cs = v.cellSize * v.zoom;
        const x0 = v.offsetX + Math.min(g0.x, g1.x) * cs;
        const y0 = v.offsetY + Math.min(g0.y, g1.y) * cs;
        const rw = (Math.abs(g0.x - g1.x) + 1) * cs;
        const rh = (Math.abs(g0.y - g1.y) + 1) * cs;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.strokeStyle = "#0af";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x0, y0, rw, rh);
        ctx.restore();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [grid, tool, drag, renderVersion]);

  const getIdx = (useEraser: boolean) => (useEraser ? 0 : colorIdx);
  const getActiveColorIndex = useCallback(
    (p: PatternState): number => {
      const hex = (pickerColor.startsWith("#") ? pickerColor : `#${pickerColor}`).toLowerCase();
      const idx = findOrAddPalette(p, hex);
      if (idx !== colorIdx) setColorIdx(idx);
      return idx;
    },
    [pickerColor, colorIdx]
  );

  const paint = (gx: number, gy: number, er: boolean) => {
    const p = pat.current;
    const idx = er ? getIdx(true) : getActiveColorIndex(p);
    const kind = er ? "full" : stitchKind;
    const pts = mirrorPoints(p.width, p.height, gx, gy, sym);
    for (const q of pts) {
      if (er) setRawCell(p, q.x, q.y, 0);
      else setCell(p, q.x, q.y, idx, kind);
    }
  };

  const onDown = (e: React.PointerEvent) => {
    lastPointer.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const r = canvasRef.current!.getBoundingClientRect();
    const g = screenToGrid(vp.current, pat.current.width, pat.current.height, e.clientX, e.clientY, r);
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      panLast.current = { x: e.clientX, y: e.clientY };
      setDrag({ kind: "pan" });
      return;
    }
    if (tool === "pencil" || tool === "eraser") {
      if (!g.inside) return;
      commit();
      lastGrid.current = { x: g.x, y: g.y };
      paint(g.x, g.y, tool === "eraser");
      setDrag({ kind: "draw" });
      return;
    }
    if (tool === "fill" && g.inside) {
      withPat((p) => {
        floodFill(p, g.x, g.y, getActiveColorIndex(p), stitchKind);
      });
      return;
    }
    if (["line", "rect", "rect_fill", "ellipse", "select"].includes(tool) && g.inside) {
      setDrag({ kind: tool, x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY } as ShapeDrag);
      return;
    }
    if (tool === "backstitch" && g.inside) {
      if (!backAnchor.current) {
        backAnchor.current = { x: g.x, y: g.y };
      } else {
        withPat((p) =>
          addBackstitch(p, {
            x0: backAnchor.current!.x,
            y0: backAnchor.current!.y,
            x1: g.x,
            y1: g.y,
            paletteIndex: getActiveColorIndex(p),
          })
        );
        backAnchor.current = null;
      }
    }
  };

  const onMove = (e: React.PointerEvent) => {
    lastPointer.current = { x: e.clientX, y: e.clientY };
    const d = drag;
    if (!d) return;
    if (d.kind === "pan") {
      const dx = e.clientX - panLast.current.x;
      const dy = e.clientY - panLast.current.y;
      panLast.current = { x: e.clientX, y: e.clientY };
      vp.current.offsetX += dx;
      vp.current.offsetY += dy;
      refresh();
      return;
    }
    if (d.kind === "draw") {
      const r = canvasRef.current!.getBoundingClientRect();
      const g = screenToGrid(vp.current, pat.current.width, pat.current.height, e.clientX, e.clientY, r);
      const lg = lastGrid.current;
      if (g.inside && lg) {
        for (const q of bresenhamLine(lg.x, lg.y, g.x, g.y)) {
          if (q.x >= 0 && q.y >= 0 && q.x < pat.current.width && q.y < pat.current.height) {
            paint(q.x, q.y, tool === "eraser");
          }
        }
        lastGrid.current = { x: g.x, y: g.y };
        refresh();
      }
      return;
    }
    if (
      d.kind === "line" ||
      d.kind === "rect" ||
      d.kind === "rect_fill" ||
      d.kind === "ellipse" ||
      d.kind === "select"
    ) {
      setDrag({ ...d, x1: e.clientX, y1: e.clientY });
    }
  };

  const onUp = () => {
    const d = drag;
    setDrag(null);
    lastGrid.current = null;
    if (!d) return;
    if (d.kind === "draw" || d.kind === "pan") return;
    if (!("x0" in d)) return;
    const p = pat.current;
    const cEl = canvasRef.current!;
    const r = cEl.getBoundingClientRect();
    const g0 = screenToGrid(vp.current, p.width, p.height, d.x0, d.y0, r);
    const g1 = screenToGrid(vp.current, p.width, p.height, d.x1, d.y1, r);
    if (d.kind === "line" && g0.inside && g1.inside) {
      withPat(() => {
        const drawIdx = getActiveColorIndex(p);
        for (const q of bresenhamLine(g0.x, g0.y, g1.x, g1.y)) {
          for (const m of mirrorPoints(p.width, p.height, q.x, q.y, sym)) {
            if (m.x >= 0 && m.y >= 0 && m.x < p.width && m.y < p.height) {
              setCell(p, m.x, m.y, drawIdx, stitchKind);
            }
          }
        }
      });
    }
    if (
      (d.kind === "rect" || d.kind === "rect_fill" || d.kind === "ellipse") &&
      (g0.inside || g1.inside)
    ) {
      const x0 = Math.min(g0.x, g1.x);
      const y0 = Math.min(g0.y, g1.y);
      const x1 = Math.max(g0.x, g1.x);
      const y1 = Math.max(g0.y, g1.y);
      withPat(() => {
        const drawIdx = getActiveColorIndex(p);
        if (d.kind === "rect") {
          for (const q of rectOutline(x0, y0, x1, y1)) {
            for (const m of mirrorPoints(p.width, p.height, q.x, q.y, sym)) {
              setCell(p, m.x, m.y, drawIdx, stitchKind);
            }
          }
        } else if (d.kind === "rect_fill") {
          for (const q of rectFillRegion(x0, y0, x1, y1)) {
            for (const m of mirrorPoints(p.width, p.height, q.x, q.y, sym)) {
              setCell(p, m.x, m.y, drawIdx, stitchKind);
            }
          }
        } else {
          const cx = (x0 + x1) / 2;
          const cy = (y0 + y1) / 2;
          const rx = (x1 - x0) / 2;
          const ry = (y1 - y0) / 2;
          for (const q of rasterEllipseOutline(cx, cy, Math.max(1, rx), Math.max(1, ry))) {
            for (const m of mirrorPoints(p.width, p.height, q.x, q.y, sym)) {
              if (m.x >= 0 && m.y >= 0 && m.x < p.width && m.y < p.height) {
                setCell(p, m.x, m.y, drawIdx, stitchKind);
              }
            }
          }
        }
      });
    }
    if (d.kind === "select") {
      setSelBuf(
        copyRegion(
          p,
          Math.min(g0.x, g1.x),
          Math.min(g0.y, g1.y),
          Math.max(g0.x, g1.x),
          Math.max(g0.y, g1.y)
        )
      );
    }
  };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onPointerInGrid = (ev: PointerEvent) => {
      if (!el.contains(ev.target as Node)) return;
      lastPointer.current = { x: ev.clientX, y: ev.clientY };
    };
    const onWheel = (ev: WheelEvent) => {
      if (!el.contains(ev.target as Node)) return;
      ev.preventDefault();
      ev.stopPropagation();
      const r = el.getBoundingClientRect();
      let x = ev.clientX;
      let y = ev.clientY;
      if (x === 0 && y === 0) {
        if (lastPointer.current) {
          x = lastPointer.current.x;
          y = lastPointer.current.y;
        } else {
          x = r.left + r.width / 2;
          y = r.top + r.height / 2;
        }
      }
      const s = Math.exp(-ev.deltaY * 0.0015);
      applyZoomAtPoint(x, y, s);
    };
    el.addEventListener("pointermove", onPointerInGrid, { passive: true, capture: true });
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      el.removeEventListener("pointermove", onPointerInGrid, true);
      el.removeEventListener("wheel", onWheel, true);
    };
  }, [applyZoomAtPoint]);

  useEffect(() => {
    const w = () => {
      if (wrapRef.current && pat.current) {
        centerPattern(
          wrapRef.current.clientWidth,
          wrapRef.current.clientHeight,
          pat.current.width,
          pat.current.height,
          vp.current
        );
        refresh();
      }
    };
    w();
    window.addEventListener("resize", w);
    return () => window.removeEventListener("resize", w);
  }, [refresh, renderVersion]);

  const saveFile = useCallback(async () => {
    const j = serializeProject(pat.current, title, fabric);
    if (isTauri()) {
      const p = await save({ defaultPath: `${title || "pattern"}.yoth.json` });
      if (p) await writeTextFile(p, j);
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([j], { type: "application/json" }));
      a.download = `${title || "pattern"}.yoth.json`;
      a.click();
    }
  }, [title, fabric]);

  const openFile = useCallback(async () => {
    if (isTauri()) {
      const f = await open({ filters: [{ name: "Project", extensions: ["json", "yoth.json"] }] });
      if (typeof f === "string" && f) {
        const text = await readTextFile(f);
        pat.current = documentToPattern(JSON.parse(text));
        refresh();
      }
    } else {
      (document.getElementById("file-open") as HTMLInputElement)?.click();
    }
  }, [refresh]);

  const onGlobalKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "z" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        const r = undo.current.redo(pat.current);
        if (r) {
          pat.current = r;
          refresh();
        }
      } else if (e.key === "z" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        const u = undo.current.undo(pat.current);
        if (u) {
          pat.current = u;
          refresh();
        }
      } else if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void saveFile();
      } else if (e.key === "o" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void openFile();
      } else if (e.key === "c" && (e.metaKey || e.ctrlKey) && selBuf) {
        void navigator.clipboard.writeText(JSON.stringify(selBuf));
      } else if (e.key === "v" && (e.metaKey || e.ctrlKey)) {
        void navigator.clipboard.readText().then((tx) => {
          try {
            const buf = parseSelectionFromString(tx);
            commit();
            pasteRegion(pat.current, buf, 0, 0);
            refresh();
          } catch {
            /* */
          }
        });
      } else if (e.key === "b") setTool("pencil");
      else if (e.key === "e") setTool("eraser");
      else if (e.key === "g" && !e.metaKey) setTool("fill");
      else if (e.key === "l") setTool("line");
      else if (e.key === "r" && !e.metaKey) setTool("rect");
      else if (e.key === "o" && !e.metaKey) setTool("ellipse");
    },
    [commit, openFile, refresh, saveFile, selBuf]
  );

  useEffect(() => {
    window.addEventListener("keydown", onGlobalKey);
    return () => window.removeEventListener("keydown", onGlobalKey);
  }, [onGlobalKey]);

  const stats = compositeStitchStats(pat.current);
  const canUndo = undo.current.canUndo();
  const onImported = useCallback(
    (next: PatternState) => {
      pat.current = next;
      refresh();
    },
    [refresh]
  );

  return (
    <div className="yoth-root">
      <header className="yoth-toolbar" role="toolbar">
        <span style={{ fontWeight: 600, marginRight: 6 }}>Year of the Horse</span>
        <button
          type="button"
          onClick={() => {
            commit();
            pat.current = createPattern(64, 64, "310");
            refresh();
          }}
        >
          {t("file.new")}
        </button>
        <button type="button" onClick={() => void openFile()}>
          {t("file.open")}
        </button>
        <input
          type="file"
          id="file-open"
          accept="application/json,.json"
          hidden
          onChange={async (ev) => {
            const f = ev.target.files?.[0];
            if (f) {
              const text = await f.text();
              pat.current = documentToPattern(JSON.parse(text));
              refresh();
            }
          }}
        />
        <button type="button" onClick={() => void saveFile()}>
          {t("file.save")}
        </button>
        <button
          type="button"
          disabled={!canUndo}
          onClick={() => {
            const u = undo.current.undo(pat.current);
            if (u) {
              pat.current = u;
              refresh();
            }
          }}
          title="Revert last change (Cmd/Ctrl+Z)"
        >
          Revert
        </button>
        <button
          type="button"
          onClick={async () => {
            const u = exportPngDataUrl(pat.current);
            if (isTauri()) {
              const p = await save({ defaultPath: "pattern.png" });
              if (p) {
                const b64 = u.split(",")[1]!;
                const raw = atob(b64);
                const bytes = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
                await writeFile(p, bytes);
              }
            } else {
              const a = document.createElement("a");
              a.href = u;
              a.download = "pattern.png";
              a.click();
            }
          }}
        >
          {t("file.exportPng")}
        </button>
        <button
          type="button"
          onClick={async () => {
            const doc = exportPatternPdf(pat.current, {
              title: title || "Pattern",
              cellPx: 2,
              grid: true,
              legend: true,
            });
            if (isTauri()) {
              const p = await save({ defaultPath: "pattern.pdf" });
              if (p) {
                const b = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
                await writeFile(p, b);
              }
            } else {
              doc.save("pattern.pdf");
            }
          }}
        >
          {t("file.exportPdf")}
        </button>
        <span style={{ width: 1, height: 20, background: "var(--yoth-border)" }} />
        {(
          [
            ["pencil", t("tools.pencil")],
            ["eraser", t("tools.eraser")],
            ["fill", t("tools.fill")],
            ["line", t("tools.line")],
            ["rect", t("tools.rect")],
            ["rect_fill", t("tools.rect") + " ■"],
            ["ellipse", t("tools.ellipse")],
            ["select", t("tools.select")],
            ["backstitch", t("tools.backstitch")],
          ] as [Tool, string][]
        ).map(([k, la]) => (
          <button key={k} className={tool === k ? "is-active" : ""} type="button" onClick={() => setTool(k)}>
            {la}
          </button>
        ))}
        <label>
          {t("view.grid")}
          <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} style={{ marginLeft: 4 }} />
        </label>
        <select
          value={stitchKind}
          onChange={(e) => setStitchKind(e.target.value as StitchKind)}
          title="Stitch"
        >
          <option value="full">Full</option>
          <option value="half_tl">Half TL</option>
          <option value="half_tr">Half TR</option>
          <option value="half_bl">Half BL</option>
          <option value="half_br">Half BR</option>
        </select>
        <select value={sym} onChange={(e) => setSym(e.target.value as SymmetryMode)} title="Symmetry">
          <option value="none">Sym: none</option>
          <option value="h">H</option>
          <option value="v">V</option>
          <option value="quad">Quad</option>
        </select>
        <button type="button" onClick={() => setImportOpen(true)}>
          Import image
        </button>
        <button
          type="button"
          onClick={() => {
            const a = window.prompt("Replace palette index from (number)", "1");
            const b = window.prompt("to (number)", "2");
            if (a && b) {
              const f = +a;
              const tt = +b;
              if (f > 0 && tt > 0) {
                withPat((p) => {
                  replacePaletteIndexEverywhere(p, f, tt);
                });
              }
            }
          }}
        >
          Replace colour
        </button>
        <button
          type="button"
          onClick={() => {
            addLayer(pat.current, `Layer ${pat.current.layerMetas.length + 1}`);
            refresh();
          }}
        >
          + Layer
        </button>
        <select
          value={pat.current.activeLayerIndex}
          onChange={(e) => {
            setActiveLayer(pat.current, +e.target.value);
            refresh();
          }}
        >
          {pat.current.layerMetas.map((m, i) => (
            <option key={m.id} value={i}>
              {m.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setIsoMsg(`${findIsolatedStitches(pat.current).length} isolated`);
          }}
        >
          Validate
        </button>
        <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme}
        </button>
      </header>
      <div className="yoth-body">
        <div
          className="yoth-canvas-wrap"
          ref={wrapRef}
          tabIndex={-1}
          onPointerDown={(e) => {
            lastPointer.current = { x: e.clientX, y: e.clientY };
          }}
        >
          <canvas
            ref={canvasRef}
            className="yoth-canvas"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerEnter={(e) => {
              lastPointer.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerLeave={() => {
              setDrag(null);
            }}
          />
        </div>
        <aside className="yoth-sidebar">
          <div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ width: "100%", marginBottom: 4 }}
            />
            <label>
              Fabric (stitches / 10cm)
              <input
                type="number"
                value={fabric}
                min={1}
                onChange={(e) => setFabric(+e.target.value || 14)}
                style={{ width: "100%" }}
              />
            </label>
            <div style={{ marginTop: 8 }}>
              <strong>Grid (stitches)</strong>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                <label style={{ flex: 1, margin: 0 }}>
                  W
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={gridW}
                    onChange={(e) => setGridW(Math.max(1, +e.target.value || 1))}
                    style={{ width: "100%" }}
                  />
                </label>
                <label style={{ flex: 1, margin: 0 }}>
                  H
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={gridH}
                    onChange={(e) => setGridH(Math.max(1, +e.target.value || 1))}
                    style={{ width: "100%" }}
                  />
                </label>
              </div>
              <button
                type="button"
                style={{ width: "100%", marginTop: 6 }}
                onClick={() => {
                  if (gridW === pat.current.width && gridH === pat.current.height) return;
                  withPat((p) => {
                    resizePattern(p, gridW, gridH);
                  });
                }}
              >
                Apply grid size
              </button>
            </div>
          </div>
          <div>
            <strong>Palette (active)</strong>
            <div className="yoth-palette">
              {pat.current.palette
                .map((id, i) => (i > 0 ? { id, i } : null))
                .filter((x): x is { id: string; i: number } => x !== null)
                .map(({ id, i }) => (
                  <div className="yoth-pal-row" key={i}>
                    <div
                      className={`yoth-swatch ${colorIdx === i ? "is-cur" : ""}`}
                      style={{ background: dmcIdToColor(id) }}
                      onClick={() => {
                        setColorIdx(i);
                        setPickerColor(dmcIdToColor(id));
                      }}
                      title={id}
                    />
                    {id}
                  </div>
                ))}
            </div>
            <label>
              Color
              <input
                type="color"
                value={pickerColor}
                onChange={(e) => {
                  setPickerColor(e.target.value.toLowerCase());
                }}
                style={{ width: "100%", height: 34, padding: 0, border: "none", background: "transparent" }}
              />
            </label>
          </div>
          <div>
            <strong>By colour</strong>
            <pre className="yoth-stats">
              {stats.byColor
                .slice(0, 20)
                .map((b) => `${pat.current.palette[b.paletteIndex] ?? "?"}: ${b.stitches}`)
                .join("\n")}
            </pre>
          </div>
          {isoMsg ? <p>{isoMsg}</p> : null}
        </aside>
      </div>
      {importOpen ? <ImportImageDlg onClose={() => setImportOpen(false)} onImported={onImported} /> : null}
    </div>
  );
}

function ImportImageDlg({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (p: PatternState) => void;
}) {
  const [w, setW] = useState(40);
  const [h, setH] = useState(40);
  const [mc, setMc] = useState(20);
  const [d, setD] = useState<"none" | "floyd">("none");
  const [st, setSt] = useState("idle");
  const cvs = useRef<HTMLCanvasElement>(null);
  const run = useCallback(
    (file: File) => {
      setSt("busy");
      const im = new Image();
      im.onload = () => {
        const c = cvs.current;
        if (!c) return;
        c.width = w;
        c.height = h;
        const x2 = c.getContext("2d")!;
        x2.drawImage(im, 0, 0, w, h);
        const id = x2.getImageData(0, 0, w, h);
        const W = new Worker(new URL("../workers/imageWorker.ts", import.meta.url), { type: "module" });
        W.onmessage = (ev) => {
          setSt("idle");
          W.terminate();
          const { grid, w: gw, h: gh } = ev.data as { grid: string[]; w: number; h: number };
          onImported(applyDmcStringGrid(grid, gw, gh));
          onClose();
        };
        W.onerror = () => {
          setSt("idle");
        };
        W.postMessage({
          data: { width: w, height: h, data: new Uint8ClampedArray(id.data) },
          outW: w,
          outH: h,
          maxColors: mc,
          dither: d,
        });
      };
      im.src = URL.createObjectURL(file);
    },
    [w, h, mc, d, onClose, onImported]
  );
  return (
    <div className="yoth-dlg" onMouseDown={onClose}>
      <div className="yoth-dlg-box" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Import</h3>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void run(f);
          }}
        />
        <label>Width (stitches)</label>
        <input type="number" value={w} min={1} onChange={(e) => setW(+e.target.value || 1)} />
        <label>Height (stitches)</label>
        <input type="number" value={h} min={1} onChange={(e) => setH(+e.target.value || 1)} />
        <label>Max colours</label>
        <input type="number" value={mc} min={2} onChange={(e) => setMc(+e.target.value || 2)} />
        <label>Dithering</label>
        <select value={d} onChange={(e) => setD(e.target.value as "none" | "floyd")}>
          <option value="none">None</option>
          <option value="floyd">Floyd–Steinberg</option>
        </select>
        {st === "busy" ? <p>Converting…</p> : null}
        <canvas ref={cvs} style={{ maxWidth: "100%" }} />
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
