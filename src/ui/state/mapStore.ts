/**
 * Das aktuell geöffnete Kartendokument samt Datei-Zustand.
 * Jede inhaltliche Änderung erhöht `revision` und setzt `dirty` (Basis für Autosave).
 * Undo/Redo folgt in Phase 3 als Command-Schicht über diesen Aktionen.
 */
import { create } from 'zustand';
import { deepEqual } from '../../core/deepEqual';
import {
  applyGridChanges,
  createMap,
  HEX_COLOR,
  normalizeName,
  type GridSettings,
  type MapDocument,
  type NewMapOptions,
} from '../../storage/mapDocument';

export interface MapState {
  doc: MapDocument | null;
  /** Pfad der Datei (Desktop) – null, wenn noch nie gespeichert oder im Browser. */
  filePath: string | null;
  /** Anzeigename der Datei, z. B. "verlies.dndmap". */
  fileName: string | null;
  dirty: boolean;
  revision: number;

  newMap: (opts: NewMapOptions) => void;
  loadMap: (
    doc: MapDocument,
    file: { path: string | null; name: string | null },
    dirty?: boolean,
  ) => void;
  updateGrid: (changes: Partial<GridSettings>) => void;
  setBackgroundColor: (color: string) => void;
  rename: (name: string) => void;
  markSaved: (file: { path: string | null; name: string | null }) => void;
  closeMap: () => void;
}

const touch = (doc: MapDocument): MapDocument => ({ ...doc, modifiedAt: new Date().toISOString() });

export const useMapStore = create<MapState>((set, get) => {
  /** Ändert das Dokument nur, wenn `fn` tatsächlich etwas anderes liefert. */
  const change = (fn: (doc: MapDocument) => MapDocument) => {
    const { doc, revision } = get();
    if (!doc) return;
    const next = fn(doc);
    if (deepEqual(next, doc)) return;
    set({ doc: touch(next), dirty: true, revision: revision + 1 });
  };

  return {
    doc: null,
    filePath: null,
    fileName: null,
    dirty: false,
    revision: 0,

    newMap: (opts) =>
      set((s) => ({
        doc: createMap(opts),
        filePath: null,
        fileName: null,
        dirty: true,
        revision: s.revision + 1,
      })),
    loadMap: (doc, file, dirty = false) =>
      set((s) => ({
        doc,
        filePath: file.path,
        fileName: file.name,
        dirty,
        revision: s.revision + 1,
      })),
    updateGrid: (changes) => change((d) => ({ ...d, grid: applyGridChanges(d.grid, changes) })),
    setBackgroundColor: (color) =>
      change((d) =>
        HEX_COLOR.test(color) ? { ...d, background: { color: color.toLowerCase() } } : d,
      ),
    rename: (name) => change((d) => ({ ...d, name: normalizeName(name, d.name) })),
    markSaved: (file) => set({ filePath: file.path, fileName: file.name, dirty: false }),
    closeMap: () =>
      set((s) => ({
        doc: null,
        filePath: null,
        fileName: null,
        dirty: false,
        revision: s.revision + 1,
      })),
  };
});
