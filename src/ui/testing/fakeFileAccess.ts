/** In-Memory-Dateizugriff für UI-Tests (simuliert Desktop-Verhalten mit Pfaden). */
import type { FileAccess } from '../../storage/fileAccess';

export interface FakeFileAccess extends FileAccess {
  files: Map<string, Uint8Array>;
  autosave: Uint8Array | null;
  /** Antwort auf Rückfragen. */
  confirmAnswer: boolean;
  confirmCalls: string[];
  /** Pfad, den der nächste Öffnen-/Speichern-Dialog liefert (null = Abbruch). */
  nextDialogPath: string | null;
}

export function createFakeFileAccess(): FakeFileAccess {
  const fake: FakeFileAccess = {
    canSaveInPlace: true,
    files: new Map(),
    autosave: null,
    confirmAnswer: true,
    confirmCalls: [],
    nextDialogPath: null,
    async openProject() {
      const path = fake.nextDialogPath;
      if (!path) return null;
      const bytes = fake.files.get(path);
      if (!bytes) throw new Error(`nicht gefunden: ${path}`);
      return { path, name: path.split('\\').pop()!, bytes };
    },
    async saveProject(bytes, path) {
      const target = path ?? fake.nextDialogPath;
      if (!target) return null;
      fake.files.set(target, bytes);
      return target;
    },
    async autosaveWrite(bytes) {
      fake.autosave = bytes;
    },
    async autosaveRead() {
      return fake.autosave;
    },
    async autosaveClear() {
      fake.autosave = null;
    },
    async confirm(message) {
      fake.confirmCalls.push(message);
      return fake.confirmAnswer;
    },
  };
  return fake;
}
