/**
 * .dndmap = ZIP-Archiv mit
 *   map.json        – Kartendokument (siehe mapDocument.ts)
 *   assets/…        – eingebettete Dateien (ab Phase 3/4: Bilder, eigene Tiles)
 *   recovery.json   – nur in Autosave-Dateien: Zeitpunkt und ursprünglicher Pfad
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { ProjectFileError } from './errors';
import type { MapDocument } from './mapDocument';
import { parseMapDocument } from './validate';

export const MAP_JSON = 'map.json';
export const RECOVERY_JSON = 'recovery.json';
export const ASSET_DIR = 'assets/';

export interface RecoveryInfo {
  savedAt: string;
  /** Pfad der zuletzt gespeicherten Datei, falls vorhanden. */
  filePath: string | null;
}

export interface ProjectContents {
  doc: MapDocument;
  assets: Map<string, Uint8Array>;
  recovery: RecoveryInfo | null;
}

export function encodeProject(
  doc: MapDocument,
  assets: ReadonlyMap<string, Uint8Array> = new Map(),
  recovery: RecoveryInfo | null = null,
): Uint8Array {
  const files: Zippable = { [MAP_JSON]: strToU8(JSON.stringify(doc, null, 2)) };
  for (const [name, data] of assets) {
    // Bereits komprimierte Formate (PNG/JPG/WebP) nicht erneut packen.
    files[ASSET_DIR + name] = [data, { level: 0 }];
  }
  if (recovery) files[RECOVERY_JSON] = strToU8(JSON.stringify(recovery));
  return zipSync(files, { level: 6 });
}

export function decodeProject(bytes: Uint8Array): ProjectContents {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new ProjectFileError('notZip');
  }
  const mapJson = entries[MAP_JSON];
  if (!mapJson) throw new ProjectFileError('missingMapJson');

  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(mapJson));
  } catch (e) {
    throw new ProjectFileError('invalidJson', [e instanceof Error ? e.message : String(e)]);
  }
  const doc = parseMapDocument(raw);

  const assets = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(entries)) {
    if (name.startsWith(ASSET_DIR) && name.length > ASSET_DIR.length && !name.endsWith('/')) {
      assets.set(name.slice(ASSET_DIR.length), data);
    }
  }

  let recovery: RecoveryInfo | null = null;
  const rec = entries[RECOVERY_JSON];
  if (rec) {
    try {
      const r = JSON.parse(strFromU8(rec)) as Partial<RecoveryInfo>;
      recovery = {
        savedAt: typeof r.savedAt === 'string' ? r.savedAt : '',
        filePath: typeof r.filePath === 'string' ? r.filePath : null,
      };
    } catch {
      recovery = { savedAt: '', filePath: null };
    }
  }
  return { doc, assets, recovery };
}
