/**
 * Migrationen alter Dateiversionen auf die aktuelle.
 * Schlüssel = Ausgangsversion; jede Migration hebt genau um eine Version an.
 */
import { ProjectFileError } from './errors';
import { MAP_FORMAT_VERSION } from './mapDocument';

export type RawDocument = Record<string, unknown>;
export type Migration = (doc: RawDocument) => RawDocument;

/** v1 → v2: Ebenen, Bodenkacheln, Objekte, Gelände, Notizen, eigene Elemente (alle leer). */
export function migrateV1toV2(doc: RawDocument): RawDocument {
  const grid = (doc.grid ?? {}) as { cols?: unknown; rows?: unknown };
  const cols = typeof grid.cols === 'number' ? grid.cols : 0;
  const rows = typeof grid.rows === 'number' ? grid.rows : 0;
  const size = Number.isInteger(cols * rows) && cols * rows > 0 ? cols * rows : 0;
  return {
    ...doc,
    version: 2,
    layers: ['floor', 'walls', 'decor', 'gm'].map((id) => ({ id, visible: true, locked: false })),
    floor: new Array<string>(size).fill(''),
    objects: [],
    terrain: {},
    notes: [],
    customElements: [],
  };
}

/** v2 → v3: Kantenwände (leer); Hintergrundbild ist optional und fehlt bei alten Karten. */
export function migrateV2toV3(doc: RawDocument): RawDocument {
  return { ...doc, version: 3, walls: [] };
}

export const migrations: Readonly<Record<number, Migration>> = {
  1: migrateV1toV2,
  2: migrateV2toV3,
};

export function migrate(
  doc: RawDocument,
  registry: Readonly<Record<number, Migration>> = migrations,
  target: number = MAP_FORMAT_VERSION,
): RawDocument {
  const start = doc.version;
  if (typeof start !== 'number' || !Number.isInteger(start) || start < 1) {
    throw new ProjectFileError('invalidContent', [`version: ${String(start)}`]);
  }
  let version: number = start;
  if (version > target) {
    throw new ProjectFileError('newerVersion', [`${version} > ${target}`]);
  }
  let current = doc;
  while (version < target) {
    const step = registry[version];
    if (!step) throw new ProjectFileError('missingMigration', [`${version} → ${version + 1}`]);
    current = step(current);
    if (current.version !== version + 1) {
      throw new ProjectFileError('missingMigration', [`Migration ${version} setzt Version falsch`]);
    }
    version += 1;
  }
  return current;
}
