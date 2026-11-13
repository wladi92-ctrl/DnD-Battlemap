/**
 * Periodische Sicherung des aktuellen Dokuments für die Wiederherstellung nach Absturz.
 * Geschrieben wird nur bei ungespeicherten Änderungen und neuer Revision.
 */
import type { MapDocument } from './mapDocument';
import { encodeProject, type RecoveryInfo } from './projectFile';
import type { MapSnapshot } from '../editor/snapshot';

export interface AutosaveSnapshot {
  doc: MapDocument;
  filePath: string | null;
  dirty: boolean;
  revision: number;
  /** Eingebettete Dateien, die mitgesichert werden. */
  assets?: ReadonlyMap<string, Uint8Array>;
  snapshots?: readonly MapSnapshot[];
  /** Eigene Kodierung (z. B. ganze Kampagne statt einzelner Karte). */
  encode?: (recovery: RecoveryInfo) => Uint8Array;
}

export interface AutosaveOptions {
  intervalMs: number;
  getSnapshot: () => AutosaveSnapshot | null;
  write: (bytes: Uint8Array) => Promise<void>;
  onError?: (error: unknown) => void;
  now?: () => Date;
}

export interface AutosaveHandle {
  /** Sofort sichern (falls nötig). */
  flush: () => Promise<boolean>;
  stop: () => void;
}

export function startAutosave(opts: AutosaveOptions): AutosaveHandle {
  let lastRevision = -1;
  let busy = false;

  const flush = async (): Promise<boolean> => {
    const snap = opts.getSnapshot();
    if (busy || !snap || !snap.dirty || snap.revision === lastRevision) return false;
    busy = true;
    try {
      const savedAt = (opts.now?.() ?? new Date()).toISOString();
      const recovery = { savedAt, filePath: snap.filePath };
      await opts.write(
        snap.encode
          ? snap.encode(recovery)
          : encodeProject(snap.doc, snap.assets ?? new Map(), recovery, snap.snapshots ?? []),
      );
      lastRevision = snap.revision;
      return true;
    } catch (e) {
      opts.onError?.(e);
      return false;
    } finally {
      busy = false;
    }
  };

  const timer = setInterval(() => void flush(), opts.intervalMs);
  return { flush, stop: () => clearInterval(timer) };
}
