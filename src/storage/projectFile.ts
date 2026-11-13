/**
 * .dndmap = ZIP-Archiv mit
 *   map.json        – Kartendokument (siehe mapDocument.ts)
 *   assets/…        – eingebettete Dateien (ab Phase 3/4: Bilder, eigene Tiles)
 *   recovery.json   – nur in Autosave-Dateien: Zeitpunkt und ursprünglicher Pfad
 *   snapshots.json  – optional: Schnappschüsse [{ id, name, createdAt, doc }] (doc wie map.json)
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { ProjectFileError } from './errors';
import type { MapDocument } from './mapDocument';
import { parseMapDocument } from './validate';
import { SNAPSHOTS_MAX, type MapSnapshot } from '../editor/snapshot';

export const MAP_JSON = 'map.json';
export const RECOVERY_JSON = 'recovery.json';
export const ASSET_DIR = 'assets/';
export const SNAPSHOTS_JSON = 'snapshots.json';

export interface RecoveryInfo {
  savedAt: string;
  /** Pfad der zuletzt gespeicherten Datei, falls vorhanden. */
  filePath: string | null;
}

export interface ProjectContents {
  doc: MapDocument;
  assets: Map<string, Uint8Array>;
  recovery: RecoveryInfo | null;
  /** Schnappschüsse (ungültige werden beim Laden übersprungen). */
  snapshots: MapSnapshot[];
}

export function encodeProject(
  doc: MapDocument,
  assets: ReadonlyMap<string, Uint8Array> = new Map(),
  recovery: RecoveryInfo | null = null,
  snapshots: readonly MapSnapshot[] = [],
): Uint8Array {
  const files: Zippable = { [MAP_JSON]: strToU8(JSON.stringify(doc, null, 2)) };
  for (const [name, data] of assets) {
    // Bereits komprimierte Formate (PNG/JPG/WebP) nicht erneut packen.
    files[ASSET_DIR + name] = [data, { level: 0 }];
  }
  if (recovery) files[RECOVERY_JSON] = strToU8(JSON.stringify(recovery));
  if (snapshots.length) files[SNAPSHOTS_JSON] = strToU8(JSON.stringify(snapshots));
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
  return { doc, assets, recovery, snapshots: parseSnapshots(entries[SNAPSHOTS_JSON]) };
}

/** Schnappschüsse lesen; jeder Stand wird wie map.json geprüft (und ggf. migriert). */
function parseSnapshots(bytes: Uint8Array | undefined): MapSnapshot[] {
  if (!bytes) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(bytes));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: MapSnapshot[] = [];
  for (const s of raw.slice(0, SNAPSHOTS_MAX)) {
    const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.name !== 'string') continue;
    try {
      out.push({
        id: o.id.slice(0, 100),
        name: o.name.slice(0, 80),
        createdAt: typeof o.createdAt === 'string' ? o.createdAt : '',
        doc: parseMapDocument(o.doc),
      });
    } catch {
      // ungültiger Stand: überspringen, die Karte selbst bleibt lesbar
    }
  }
  return out;
}
