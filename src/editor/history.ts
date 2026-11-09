/**
 * Undo/Redo-Verlauf aus Patches. Begrenzt auf HISTORY_LIMIT Schritte (Vorgabe: mind. 200).
 * Aufeinanderfolgende Änderungen mit gleichem mergeKey innerhalb MERGE_WINDOW_MS werden
 * zu einem Schritt zusammengefasst (z. B. Schieberegler, Farbwähler).
 */
import { invertPatch, mergePatches, type DocPatch } from './patch';

export const HISTORY_LIMIT = 500;
export const MERGE_WINDOW_MS = 1000;

export interface HistoryEntry {
  /** i18n-Schlüssel der Aktion, z. B. "action.paint". */
  label: string;
  patch: DocPatch;
  mergeKey?: string;
  time: number;
}

export interface History {
  undo: HistoryEntry[];
  redo: HistoryEntry[];
}

export const emptyHistory: History = { undo: [], redo: [] };

export function pushHistory(
  h: History,
  entry: HistoryEntry,
  limit: number = HISTORY_LIMIT,
): History {
  const top = h.undo[h.undo.length - 1];
  if (
    top &&
    entry.mergeKey &&
    top.mergeKey === entry.mergeKey &&
    entry.time - top.time <= MERGE_WINDOW_MS
  ) {
    const merged = { ...top, patch: mergePatches(top.patch, entry.patch), time: entry.time };
    return { undo: [...h.undo.slice(0, -1), merged], redo: [] };
  }
  const undo = [...h.undo, entry];
  return { undo: undo.length > limit ? undo.slice(undo.length - limit) : undo, redo: [] };
}

/** Liefert den rückgängig zu machenden Patch (bereits invertiert) und den neuen Verlauf. */
export function popUndo(
  h: History,
): { patch: DocPatch; entry: HistoryEntry; history: History } | null {
  const entry = h.undo[h.undo.length - 1];
  if (!entry) return null;
  return {
    patch: invertPatch(entry.patch),
    entry,
    history: { undo: h.undo.slice(0, -1), redo: [...h.redo, entry] },
  };
}

export function popRedo(
  h: History,
): { patch: DocPatch; entry: HistoryEntry; history: History } | null {
  const entry = h.redo[h.redo.length - 1];
  if (!entry) return null;
  return {
    patch: entry.patch,
    entry,
    history: { undo: [...h.undo, entry], redo: h.redo.slice(0, -1) },
  };
}
