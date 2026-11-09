/**
 * Periodische Sicherung des aktuellen Dokuments für die Wiederherstellung nach Absturz.
 * Geschrieben wird nur bei ungespeicherten Änderungen und neuer Revision.
 */
import type { MapDocument } from './mapDocument';
import { encodeProject } from './projectFile';

export interface AutosaveSnapshot {
  doc: MapDocument;
  filePath: string | null;
  dirty: boolean;
  revision: number;
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
      await opts.write(encodeProject(snap.doc, new Map(), { savedAt, filePath: snap.filePath }));
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
