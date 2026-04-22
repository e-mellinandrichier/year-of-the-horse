import { clonePattern, type PatternState } from "./pattern";
import type { BackstitchLine } from "./types";

export type PatternSnapshotUndo = {
  pattern: PatternState;
  backstitches: BackstitchLine[];
};

const MAX = 80;

export class UndoStack {
  private past: PatternSnapshotUndo[] = [];
  private future: PatternSnapshotUndo[] = [];

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  push(p: PatternState) {
    this.past.push({
      pattern: clonePattern(p),
      backstitches: p.backstitches.map((b) => ({ ...b })),
    });
    if (this.past.length > MAX) this.past.shift();
    this.future = [];
  }

  undo(current: PatternState): PatternState | null {
    if (this.past.length === 0) return null;
    this.future.push({
      pattern: clonePattern(current),
      backstitches: current.backstitches.map((b) => ({ ...b })),
    });
    const snap = this.past.pop()!;
    return snap.pattern;
  }

  redo(current: PatternState): PatternState | null {
    if (this.future.length === 0) return null;
    this.past.push({
      pattern: clonePattern(current),
      backstitches: current.backstitches.map((b) => ({ ...b })),
    });
    const snap = this.future.pop()!;
    return snap.pattern;
  }

  clear() {
    this.past = [];
    this.future = [];
  }
}
