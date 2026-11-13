/**
 * Bibliothek teilen: Export aller (oder ausgewählter) Einträge als JSON-Datei und Import mit
 * Prüfung. Jeder importierte Eintrag läuft durch dieselbe Normalisierung wie beim Speichern;
 * ungültige Einträge werden übersprungen und gezählt.
 *
 * Format:
 * { "format": "dndbattlemap-library", "version": 1, "exportedAt": "…",
 *   "entries": [ { "kind": "pc" | "creature" | "effect" | "portrait",
 *                  "id": "…", "name": "…", "data": { … } } ] }
 */
import {
  getLibrary,
  normalizeCreature,
  normalizeEffect,
  normalizePc,
  saveHomebrew,
  saveHomebrewEffect,
  savePc,
  savePortrait,
  IMAGE_DATA_URL,
  LIBRARY_IMAGE_MAX,
  type LibraryBackend,
  type LibraryKind,
} from './library';

export const LIBRARY_FORMAT = 'dndbattlemap-library';
export const LIBRARY_FORMAT_VERSION = 1;
export const LIBRARY_KINDS: readonly LibraryKind[] = ['pc', 'creature', 'effect', 'portrait'];
/** Obergrenze für Importdateien (Bilder sind als Data-URL enthalten). */
export const LIBRARY_FILE_MAX = 200 * 1024 * 1024;
const ENTRY_MAX = 5000;

export interface TransferEntry {
  kind: LibraryKind;
  id: string;
  name: string;
  data: Record<string, unknown>;
}

export class LibraryImportError extends Error {
  constructor(readonly code: 'notJson' | 'wrongFormat' | 'newerVersion' | 'tooLarge') {
    super(code);
  }
}

/** Alle Einträge der gewählten Arten als JSON-Text. */
export async function exportLibrary(
  kinds: readonly LibraryKind[],
  lib: LibraryBackend = getLibrary(),
  now = new Date(),
): Promise<{ text: string; count: number }> {
  const entries: TransferEntry[] = [];
  for (const kind of kinds) {
    for (const e of await lib.list(kind)) {
      let data: unknown;
      try {
        data = JSON.parse(e.data);
      } catch {
        continue;
      }
      if (data && typeof data === 'object' && !Array.isArray(data))
        entries.push({ kind, id: e.id, name: e.name, data: data as Record<string, unknown> });
    }
  }
  const doc = {
    format: LIBRARY_FORMAT,
    version: LIBRARY_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    entries,
  };
  return { text: `${JSON.stringify(doc, null, 2)}\n`, count: entries.length };
}

export interface ParsedImport {
  entries: TransferEntry[];
  /** Ungültige oder unbekannte Einträge. */
  skipped: number;
}

const ID = /^[A-Za-z0-9:_\-.]{1,100}$/;

/** Prüft eine Importdatei; wirft LibraryImportError bei falschem Format. */
export function parseLibraryImport(bytes: Uint8Array): ParsedImport {
  if (bytes.length > LIBRARY_FILE_MAX) throw new LibraryImportError('tooLarge');
  let doc: unknown;
  try {
    doc = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new LibraryImportError('notJson');
  }
  const o = (doc && typeof doc === 'object' ? doc : {}) as Record<string, unknown>;
  if (o.format !== LIBRARY_FORMAT || !Array.isArray(o.entries))
    throw new LibraryImportError('wrongFormat');
  if (typeof o.version !== 'number' || o.version > LIBRARY_FORMAT_VERSION)
    throw new LibraryImportError('newerVersion');

  const entries: TransferEntry[] = [];
  let skipped = 0;
  for (const raw of o.entries.slice(0, ENTRY_MAX)) {
    const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const kind = e.kind as LibraryKind;
    const ok =
      LIBRARY_KINDS.includes(kind) &&
      typeof e.id === 'string' &&
      ID.test(e.id) &&
      typeof e.name === 'string' &&
      e.name.trim().length > 0 &&
      e.data !== null &&
      typeof e.data === 'object' &&
      !Array.isArray(e.data) &&
      (kind !== 'portrait' || validImage((e.data as Record<string, unknown>).image));
    if (!ok) {
      skipped++;
      continue;
    }
    entries.push({
      kind,
      id: e.id as string,
      name: (e.name as string).trim().slice(0, 120),
      data: e.data as Record<string, unknown>,
    });
  }
  skipped += Math.max(0, o.entries.length - ENTRY_MAX);
  return { entries, skipped };
}

function validImage(v: unknown): boolean {
  return typeof v === 'string' && v.length <= LIBRARY_IMAGE_MAX && IMAGE_DATA_URL.test(v);
}

/** IDs, die beim Import vorhandene Einträge ersetzen würden. */
export async function conflictingEntries(
  entries: readonly TransferEntry[],
  lib: LibraryBackend = getLibrary(),
): Promise<TransferEntry[]> {
  const existing = new Set<string>();
  for (const kind of LIBRARY_KINDS)
    for (const e of await lib.list(kind)) existing.add(`${kind}:${e.id}`);
  return entries.filter((e) => existing.has(`${e.kind}:${e.id}`));
}

/** Speichert die Einträge (normalisiert) in der Bibliothek; liefert die Anzahl. */
export async function importEntries(
  entries: readonly TransferEntry[],
  lib: LibraryBackend = getLibrary(),
): Promise<number> {
  let n = 0;
  for (const e of entries) {
    const raw = { ...e.data, name: e.name };
    if (e.kind === 'pc') await savePc(normalizePc(e.id, e.name, raw), lib);
    else if (e.kind === 'creature') await saveHomebrew(normalizeCreature(e.id, e.name, raw), lib);
    else if (e.kind === 'effect') await saveHomebrewEffect(normalizeEffect(e.id, e.name, raw), lib);
    else await savePortrait({ id: e.id, name: e.name, image: e.data.image as string }, lib);
    n++;
  }
  return n;
}
