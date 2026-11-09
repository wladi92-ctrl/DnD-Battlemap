/**
 * Zustand des Karten-Editors (nicht gespeichert): Malquelle, Werkzeugoptionen,
 * aktive Ebene, Auswahl, Zwischenablage und Vorschau der Formwerkzeuge.
 */
import { create } from 'zustand';
import type { Cell } from '../../core/grid';
import type { LayerId, PlacedObject, Rotation, TerrainProps } from '../../storage/mapDocument';

export type PaintMode = 'element' | 'terrain';

export interface Marquee {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EditorState {
  paintMode: PaintMode;
  /** Gewähltes Element der Bibliothek (eingebaut oder eigenes). */
  elementId: string | null;
  /** Eigenschaften, die im Gelände-Modus gemalt werden. */
  terrainBrush: TerrainProps;
  rectFilled: boolean;
  /** Drehung für neu platzierte Objekte. */
  rotation: Rotation;
  /** Ebene für Radierer und Auswahl. */
  activeLayer: LayerId;
  snap: boolean;
  showTerrain: boolean;
  selection: ReadonlySet<string>;
  clipboard: PlacedObject[];
  /** Startfeld für Rechteck/Linie (Maus gedrückt oder per Eingabetaste gesetzt). */
  shapeAnchor: Cell | null;
  /** Felder der Formvorschau. */
  preview: Cell[];
  marquee: Marquee | null;
  /** Feld, dessen Notiz gerade bearbeitet wird. */
  noteCell: Cell | null;

  selectElement: (id: string, layer: LayerId) => void;
  setPaintMode: (mode: PaintMode) => void;
  setTerrainBrush: (props: TerrainProps) => void;
  setRectFilled: (filled: boolean) => void;
  rotatePlacement: (steps: number) => void;
  setActiveLayer: (layer: LayerId) => void;
  setSnap: (snap: boolean) => void;
  setShowTerrain: (show: boolean) => void;
  setSelection: (ids: Iterable<string>) => void;
  setClipboard: (objects: PlacedObject[]) => void;
  setShapeAnchor: (cell: Cell | null) => void;
  setPreview: (cells: Cell[]) => void;
  setMarquee: (m: Marquee | null) => void;
  setNoteCell: (cell: Cell | null) => void;
  reset: () => void;
}

const initial = {
  paintMode: 'element' as PaintMode,
  elementId: null,
  terrainBrush: { difficult: true } as TerrainProps,
  rectFilled: true,
  rotation: 0 as Rotation,
  activeLayer: 'floor' as LayerId,
  snap: true,
  showTerrain: false,
  selection: new Set<string>() as ReadonlySet<string>,
  clipboard: [] as PlacedObject[],
  shapeAnchor: null,
  preview: [] as Cell[],
  marquee: null,
  noteCell: null,
};

export const useEditorStore = create<EditorState>((set) => ({
  ...initial,
  selectElement: (elementId, activeLayer) =>
    set({ elementId, activeLayer, paintMode: 'element', selection: new Set() }),
  setPaintMode: (paintMode) => set({ paintMode }),
  setTerrainBrush: (terrainBrush) => set({ terrainBrush, paintMode: 'terrain' }),
  setRectFilled: (rectFilled) => set({ rectFilled }),
  rotatePlacement: (steps) =>
    set((s) => ({ rotation: ((((s.rotation + steps * 90) % 360) + 360) % 360) as Rotation })),
  setActiveLayer: (activeLayer) => set({ activeLayer, selection: new Set() }),
  setSnap: (snap) => set({ snap }),
  setShowTerrain: (showTerrain) => set({ showTerrain }),
  setSelection: (ids) => set({ selection: new Set(ids) }),
  setClipboard: (clipboard) => set({ clipboard }),
  setShapeAnchor: (shapeAnchor) => set({ shapeAnchor }),
  setPreview: (preview) => set({ preview }),
  setMarquee: (marquee) => set({ marquee }),
  setNoteCell: (noteCell) => set({ noteCell }),
  reset: () => set({ ...initial, selection: new Set(), clipboard: [], preview: [] }),
}));
