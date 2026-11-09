/** Fehler beim Lesen/Schreiben von Projektdateien; `code` wird in der UI übersetzt. */
export type ProjectErrorCode =
  | 'notZip'
  | 'missingMapJson'
  | 'invalidJson'
  | 'wrongFormat'
  | 'newerVersion'
  | 'missingMigration'
  | 'invalidContent'
  | 'io';

export class ProjectFileError extends Error {
  constructor(
    readonly code: ProjectErrorCode,
    readonly details: string[] = [],
  ) {
    super(details.length ? `${code}: ${details.join('; ')}` : code);
    this.name = 'ProjectFileError';
  }
}
