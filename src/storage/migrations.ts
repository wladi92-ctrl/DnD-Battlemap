/**
 * Migrationen alter Dateiversionen auf die aktuelle.
 * Schlüssel = Ausgangsversion; jede Migration hebt genau um eine Version an.
 * Beispiel für eine spätere Version 2:
 *   migrations[1] = (doc) => ({ ...doc, version: 2, layers: [] });
 */
import { ProjectFileError } from './errors';
import { MAP_FORMAT_VERSION } from './mapDocument';

export type RawDocument = Record<string, unknown>;
export type Migration = (doc: RawDocument) => RawDocument;

export const migrations: Readonly<Record<number, Migration>> = {};

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
