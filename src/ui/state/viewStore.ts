/**
 * Ansichtszustand der Karte (nicht gespeichert): Werkzeug, Kamera, Hover/Cursor, Lineal.
 */
import { create } from 'zustand';
import {
  clampCamera,
  fitToView,
  identityCamera,
  panBy,
  zoomAt,
  type Camera,
  type Size,
} from '../../core/camera';
import { sameCell, type Cell, type Point } from '../../core/grid';

export type Tool = 'pan' | 'ruler';

export interface RulerState {
  /** Feste Punkte (Start + Wegpunkte). */
  points: Cell[];
  /** Aktuelles Ende während der Messung. */
  preview: Cell | null;
  active: boolean;
}

export const emptyRuler: RulerState = { points: [], preview: null, active: false };

/** Alle Punkte des gemessenen Weges inkl. Vorschau-Ende. */
export function rulerPath(r: RulerState): Cell[] {
  const last = r.points[r.points.length - 1] ?? null;
  return r.preview && !sameCell(last, r.preview) ? [...r.points, r.preview] : r.points;
}

export interface ViewState {
  tool: Tool;
  camera: Camera;
  viewport: Size;
  hoverCell: Cell | null;
  /** Tastatur-Fokusfeld (Pfeiltasten). */
  cursorCell: Cell | null;
  ruler: RulerState;

  setTool: (tool: Tool) => void;
  setViewport: (size: Size) => void;
  setCamera: (camera: Camera) => void;
  panBy: (dx: number, dy: number, world: Size) => void;
  zoomAt: (screen: Point, factor: number, world: Size) => void;
  fit: (world: Size) => void;
  setHoverCell: (cell: Cell | null) => void;
  setCursorCell: (cell: Cell | null) => void;

  rulerBegin: (cell: Cell) => void;
  rulerMove: (cell: Cell) => void;
  rulerAddWaypoint: () => void;
  rulerEnd: () => void;
  rulerClear: () => void;
  reset: () => void;
}

export const useViewStore = create<ViewState>((set, get) => ({
  tool: 'pan',
  camera: identityCamera,
  viewport: { width: 0, height: 0 },
  hoverCell: null,
  cursorCell: null,
  ruler: emptyRuler,

  setTool: (tool) => set({ tool }),
  setViewport: (viewport) => set({ viewport }),
  setCamera: (camera) => set({ camera }),
  panBy: (dx, dy, world) => {
    const { camera, viewport } = get();
    set({ camera: clampCamera(panBy(camera, dx, dy), viewport, world) });
  },
  zoomAt: (screen, factor, world) => {
    const { camera, viewport } = get();
    set({ camera: clampCamera(zoomAt(camera, screen, factor), viewport, world) });
  },
  fit: (world) => set({ camera: fitToView(get().viewport, world) }),
  setHoverCell: (hoverCell) => {
    if (!sameCell(hoverCell, get().hoverCell)) set({ hoverCell });
  },
  setCursorCell: (cursorCell) => set({ cursorCell }),

  rulerBegin: (cell) => set({ ruler: { points: [cell], preview: cell, active: true } }),
  rulerMove: (cell) => {
    const { ruler } = get();
    if (ruler.active && !sameCell(ruler.preview, cell)) set({ ruler: { ...ruler, preview: cell } });
  },
  rulerAddWaypoint: () => {
    const { ruler } = get();
    if (!ruler.active || !ruler.preview) return;
    set({ ruler: { ...ruler, points: rulerPath(ruler) } });
  },
  rulerEnd: () => {
    const { ruler } = get();
    if (!ruler.active) return;
    set({ ruler: { points: rulerPath(ruler), preview: null, active: false } });
  },
  rulerClear: () => set({ ruler: emptyRuler }),
  reset: () =>
    set({
      tool: 'pan',
      camera: identityCamera,
      hoverCell: null,
      cursorCell: null,
      ruler: emptyRuler,
    }),
}));
