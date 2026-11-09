/**
 * Das aktuell geöffnete Kartendokument samt Datei-Zustand und Undo/Redo-Verlauf.
 * Jede Änderung läuft als Patch durch `apply` (bzw. als Strich über begin/stroke/endStroke),
 * erhöht `revision` und setzt `dirty` (Basis für Autosave).
 */
import { create } from 'zustand';
import {
  emptyHistory,
  popRedo,
  popUndo,
  pushHistory,
  type History,
  type HistoryEntry,
} from '../../editor/history';
import { resizeGrid, type OpResult } from '../../editor/ops';
import {
  applyPatch,
  isEmptyPatch,
  mergePatches,
  replaceField,
  type DocPatch,
} from '../../editor/patch';
import {
  applyGridChanges,
  createMap,
  HEX_COLOR,
  normalizeName,
  LOG_MAX,
  LOG_TEXT_MAX,
  type GridSettings,
  type LogEntry,
  type MapDocument,
  type NewMapOptions,
} from '../../storage/mapDocument';

export type FileRef = { path: string | null; name: string | null };

interface Stroke {
  label: string;
  patch: DocPatch;
}

export interface MapState {
  doc: MapDocument | null;
  /** Pfad der Datei (Desktop) – null, wenn noch nie gespeichert oder im Browser. */
  filePath: string | null;
  /** Anzeigename der Datei, z. B. "verlies.dndmap". */
  fileName: string | null;
  dirty: boolean;
  revision: number;
  history: History;
  /** Eingebettete Dateien (assets/…), z. B. Bilder eigener Elemente. */
  assets: ReadonlyMap<string, Uint8Array>;
  stroke: Stroke | null;

  newMap: (opts: NewMapOptions) => void;
  loadMap: (
    doc: MapDocument,
    file: FileRef,
    dirty?: boolean,
    assets?: ReadonlyMap<string, Uint8Array>,
  ) => void;
  /** Wendet einen Patch an und legt einen Undo-Schritt an. */
  apply: (patch: DocPatch, label: string, mergeKey?: string) => void;
  /** Wendet das Ergebnis einer Operation an; liefert den Grund, falls nichts passiert. */
  run: (result: OpResult, label: string, mergeKey?: string) => string | null;
  beginStroke: (label: string) => void;
  /** Teiländerung während eines Strichs (sofort sichtbar, ein Undo-Schritt am Ende). */
  strokeApply: (result: OpResult) => string | null;
  endStroke: () => void;
  undo: () => string | null;
  redo: () => string | null;
  updateGrid: (changes: Partial<GridSettings>) => void;
  setBackgroundColor: (color: string) => void;
  rename: (name: string) => void;
  addAsset: (path: string, bytes: Uint8Array) => void;
  /** Kampflog ergänzen (kein Undo-Schritt; ältere Einträge fallen über dem Limit weg). */
  appendLog: (entries: readonly Omit<LogEntry, 'id' | 'time' | 'round'>[]) => void;
  clearLog: () => void;
  markSaved: (file: FileRef) => void;
  closeMap: () => void;
}

const touch = (doc: MapDocument): MapDocument => ({ ...doc, modifiedAt: new Date().toISOString() });

export const useMapStore = create<MapState>((set, get) => {
  const changed = (doc: MapDocument, history: History) =>
    set((s) => ({ doc: touch(doc), history, dirty: true, revision: s.revision + 1 }));

  const apply: MapState['apply'] = (patch, label, mergeKey) => {
    const { doc, history } = get();
    if (!doc || isEmptyPatch(patch)) return;
    const entry: HistoryEntry = {
      label,
      patch,
      time: Date.now(),
      ...(mergeKey ? { mergeKey } : {}),
    };
    changed(applyPatch(doc, patch), pushHistory(history, entry));
  };

  const resetDoc = (
    doc: MapDocument | null,
    file: FileRef,
    dirty: boolean,
    assets: ReadonlyMap<string, Uint8Array>,
  ) =>
    set((s) => ({
      doc,
      filePath: file.path,
      fileName: file.name,
      dirty,
      revision: s.revision + 1,
      history: emptyHistory,
      assets,
      stroke: null,
    }));

  return {
    doc: null,
    filePath: null,
    fileName: null,
    dirty: false,
    revision: 0,
    history: emptyHistory,
    assets: new Map(),
    stroke: null,

    newMap: (opts) => resetDoc(createMap(opts), { path: null, name: null }, true, new Map()),
    loadMap: (doc, file, dirty = false, assets = new Map()) => resetDoc(doc, file, dirty, assets),

    apply,
    run: (result, label, mergeKey) => {
      if (!result.ok) return result.reason;
      apply(result.patch, label, mergeKey);
      return null;
    },

    beginStroke: (label) => set({ stroke: { label, patch: {} } }),
    strokeApply: (result) => {
      const { doc, stroke } = get();
      if (!result.ok) return result.reason;
      if (!doc) return 'nothing';
      if (!stroke) {
        apply(result.patch, 'action.edit');
        return null;
      }
      set((s) => ({
        doc: applyPatch(doc, result.patch),
        stroke: { label: stroke.label, patch: mergePatches(stroke.patch, result.patch) },
        dirty: true,
        revision: s.revision + 1,
      }));
      return null;
    },
    endStroke: () => {
      const { stroke, doc, history } = get();
      set({ stroke: null });
      if (!stroke || !doc || isEmptyPatch(stroke.patch)) return;
      set({
        doc: touch(doc),
        history: pushHistory(history, {
          label: stroke.label,
          patch: stroke.patch,
          time: Date.now(),
        }),
      });
    },

    undo: () => {
      const { doc, history } = get();
      const step = doc && popUndo(history);
      if (!doc || !step) return null;
      changed(applyPatch(doc, step.patch), step.history);
      return step.entry.label;
    },
    redo: () => {
      const { doc, history } = get();
      const step = doc && popRedo(history);
      if (!doc || !step) return null;
      changed(applyPatch(doc, step.patch), step.history);
      return step.entry.label;
    },

    updateGrid: (changes) => {
      const { doc, run } = get();
      if (!doc) return;
      const { cols, rows, ...rest } = changes;
      if (cols !== undefined || rows !== undefined) {
        run(resizeGrid(doc, cols ?? doc.grid.cols, rows ?? doc.grid.rows), 'action.resize');
      }
      const current = get().doc;
      if (!current || !Object.keys(rest).length) return;
      const grid = applyGridChanges(current.grid, rest);
      if (JSON.stringify(grid) !== JSON.stringify(current.grid)) {
        apply(
          replaceField(current, 'grid', grid),
          'action.grid',
          `grid:${Object.keys(rest).join(',')}`,
        );
      }
    },
    setBackgroundColor: (color) => {
      const { doc } = get();
      if (!doc || !HEX_COLOR.test(color) || color.toLowerCase() === doc.background.color) return;
      apply(
        replaceField(doc, 'background', { color: color.toLowerCase() }),
        'action.background',
        'background',
      );
    },
    rename: (name) => {
      const { doc } = get();
      if (!doc) return;
      const next = normalizeName(name, doc.name);
      if (next !== doc.name) apply(replaceField(doc, 'name', next), 'action.rename', 'name');
    },
    addAsset: (path, bytes) => set((s) => ({ assets: new Map(s.assets).set(path, bytes) })),
    appendLog: (entries) => {
      const { doc } = get();
      if (!doc || !entries.length) return;
      const time = new Date().toISOString();
      const round = doc.combat?.round ?? null;
      const added = entries.map((e) => ({
        id: crypto.randomUUID(),
        time,
        round,
        kind: e.kind,
        text: e.text.slice(0, LOG_TEXT_MAX),
      }));
      const combatLog = [...doc.combatLog, ...added].slice(-LOG_MAX);
      set((s) => ({ doc: { ...doc, combatLog }, dirty: true, revision: s.revision + 1 }));
    },
    clearLog: () => {
      const { doc } = get();
      if (!doc || !doc.combatLog.length) return;
      set((s) => ({ doc: { ...doc, combatLog: [] }, dirty: true, revision: s.revision + 1 }));
    },
    markSaved: (file) => set({ filePath: file.path, fileName: file.name, dirty: false }),
    closeMap: () => resetDoc(null, { path: null, name: null }, false, new Map()),
  };
});

/** Nur die Assets, die das Dokument tatsächlich referenziert (für Speichern/Autosave). */
export function referencedAssets(
  doc: MapDocument,
  assets: ReadonlyMap<string, Uint8Array>,
): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const paths = doc.customElements.map((el) => el.asset);
  if (doc.background.image) paths.push(doc.background.image.asset);
  for (const t of doc.tokens) if (t.image) paths.push(t.image);
  for (const path of paths) {
    const bytes = assets.get(path);
    if (bytes) out.set(path, bytes);
  }
  return out;
}
