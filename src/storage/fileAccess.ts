/**
 * Zugriff auf lokale Dateien. In der Desktop-App über eigene Tauri-Commands
 * (Binärdaten ohne JSON-Umweg) und das Dialog-Plugin; im reinen Browser-Dev-Modus
 * über Dateiauswahl, Download und IndexedDB. Es gibt keinen Netzwerkzugriff.
 */
import { invoke, isTauri } from '@tauri-apps/api/core';
import { ProjectFileError } from './errors';

export const PROJECT_EXTENSION = 'dndmap';

export interface OpenedFile {
  /** Vollständiger Pfad (Desktop) oder null (Browser). */
  path: string | null;
  name: string;
  bytes: Uint8Array;
}

export const IMAGE_EXTENSIONS = ['png', 'svg', 'webp', 'jpg', 'jpeg'] as const;
/** Obergrenze für importierte Bilder (Bytes). */
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;

export interface FileAccess {
  /** Zeigt "Öffnen"-Dialog; null bei Abbruch. */
  openProject(title: string, filterName: string): Promise<OpenedFile | null>;
  /** Bilddatei wählen und lesen; null bei Abbruch. */
  openImage(title: string, filterName: string): Promise<OpenedFile | null>;
  /**
   * Speichert unter `path`; ist `path` null, wird ein "Speichern unter"-Dialog gezeigt.
   * Liefert den verwendeten Pfad bzw. Dateinamen oder null bei Abbruch.
   */
  saveProject(
    bytes: Uint8Array,
    path: string | null,
    suggestedName: string,
    filterName: string,
  ): Promise<string | null>;
  autosaveWrite(bytes: Uint8Array): Promise<void>;
  autosaveRead(): Promise<Uint8Array | null>;
  autosaveClear(): Promise<void>;
  /** Ja/Nein-Rückfrage. */
  confirm(message: string, title: string, okLabel: string, cancelLabel: string): Promise<boolean>;
  /** Pfade lassen sich direkt wieder beschreiben (Desktop) – im Browser nicht. */
  readonly canSaveInPlace: boolean;
}

export function ensureExtension(path: string): string {
  return path.toLowerCase().endsWith(`.${PROJECT_EXTENSION}`)
    ? path
    : `${path}.${PROJECT_EXTENSION}`;
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

async function ioError<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e) {
    if (e instanceof ProjectFileError) throw e;
    throw new ProjectFileError('io', [e instanceof Error ? e.message : String(e)]);
  }
}

// ---------------------------------------------------------------- Desktop (Tauri)

function toBytes(data: ArrayBuffer | Uint8Array | number[]): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return Uint8Array.from(data);
}

const pathHeader = (path: string) => ({ headers: { 'x-path': encodeURIComponent(path) } });

export function createTauriFileAccess(): FileAccess {
  const dialog = () => import('@tauri-apps/plugin-dialog');
  return {
    canSaveInPlace: true,
    async openProject(title, filterName) {
      const { open } = await dialog();
      const path = await open({
        title,
        multiple: false,
        directory: false,
        filters: [{ name: filterName, extensions: [PROJECT_EXTENSION] }],
      });
      if (typeof path !== 'string') return null;
      const data = await ioError(() => invoke<ArrayBuffer>('read_file', { path }));
      return { path, name: baseName(path), bytes: toBytes(data) };
    },
    async openImage(title, filterName) {
      const { open } = await dialog();
      const path = await open({
        title,
        multiple: false,
        directory: false,
        filters: [{ name: filterName, extensions: [...IMAGE_EXTENSIONS] }],
      });
      if (typeof path !== 'string') return null;
      const data = await ioError(() => invoke<ArrayBuffer>('read_file', { path }));
      return { path, name: baseName(path), bytes: toBytes(data) };
    },
    async saveProject(bytes, path, suggestedName, filterName) {
      let target = path;
      if (!target) {
        const { save } = await dialog();
        const chosen = await save({
          defaultPath: suggestedName,
          filters: [{ name: filterName, extensions: [PROJECT_EXTENSION] }],
        });
        if (!chosen) return null;
        target = ensureExtension(chosen);
      }
      const finalPath = target;
      await ioError(() => invoke('write_file', bytes, pathHeader(finalPath)));
      return finalPath;
    },
    autosaveWrite: (bytes) => ioError(() => invoke('autosave_write', bytes)),
    async autosaveRead() {
      const data = toBytes(await ioError(() => invoke<ArrayBuffer>('autosave_read')));
      return data.length ? data : null;
    },
    autosaveClear: () => ioError(() => invoke('autosave_clear')),
    async confirm(message, title, okLabel, cancelLabel) {
      const { ask } = await dialog();
      return ask(message, { title, kind: 'warning', okLabel, cancelLabel });
    },
  };
}

// ---------------------------------------------------------------- Browser (Dev-Modus)

const IDB_NAME = 'dnd-battlemap';
const IDB_STORE = 'autosave';
const IDB_KEY = 'current';

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(IDB_STORE, mode);
      const r = run(tx.objectStore(IDB_STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(r.result as T);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export function createBrowserFileAccess(): FileAccess {
  return {
    canSaveInPlace: false,
    async openProject() {
      const file = await pickFile(`.${PROJECT_EXTENSION}`);
      if (!file) return null;
      return { path: null, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
    },
    async openImage() {
      const file = await pickFile(IMAGE_EXTENSIONS.map((e) => `.${e}`).join(','));
      if (!file) return null;
      return { path: null, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
    },
    async saveProject(bytes, _path, suggestedName) {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = ensureExtension(suggestedName);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return a.download;
    },
    autosaveWrite: (bytes) => ioError(() => idb('readwrite', (s) => s.put(bytes, IDB_KEY))),
    async autosaveRead() {
      const v = await ioError(() => idb<unknown>('readonly', (s) => s.get(IDB_KEY)));
      return v instanceof Uint8Array && v.length ? v : null;
    },
    autosaveClear: () => ioError(() => idb('readwrite', (s) => s.delete(IDB_KEY))),
    confirm: (message) => Promise.resolve(window.confirm(message)),
  };
}

let instance: FileAccess | null = null;

export function getFileAccess(): FileAccess {
  instance ??= isTauri() ? createTauriFileAccess() : createBrowserFileAccess();
  return instance;
}

/** Für Tests: eigene Implementierung einsetzen. */
export function setFileAccess(access: FileAccess | null): void {
  instance = access;
}
