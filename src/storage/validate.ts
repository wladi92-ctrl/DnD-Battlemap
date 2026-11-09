/**
 * Strikte Prüfung von map.json (ohne Schema-Compiler, da die CSP kein eval erlaubt).
 * Das JSON-Schema in docs/schema/ beschreibt dieselben Regeln; ein Test hält beide synchron.
 */
import { GRID_MAX, GRID_MIN } from '../core/grid';
import { ProjectFileError } from './errors';
import {
  FEET_PER_CELL_MAX,
  FEET_PER_CELL_MIN,
  HEX_COLOR,
  MAP_FORMAT,
  NAME_MAX,
  type MapDocument,
} from './mapDocument';
import { migrate, type RawDocument } from './migrations';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function isObject(v: unknown): v is RawDocument {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

class Checker {
  errors: string[] = [];

  object(v: unknown, path: string): RawDocument {
    if (!isObject(v)) {
      this.errors.push(`${path}: Objekt erwartet`);
      return {};
    }
    return v;
  }

  string(v: unknown, path: string, opts: { min?: number; max?: number; pattern?: RegExp } = {}) {
    if (typeof v !== 'string') return void this.errors.push(`${path}: Text erwartet`);
    if (opts.min !== undefined && v.length < opts.min) this.errors.push(`${path}: zu kurz`);
    if (opts.max !== undefined && v.length > opts.max) this.errors.push(`${path}: zu lang`);
    if (opts.pattern && !opts.pattern.test(v)) this.errors.push(`${path}: ungültiges Format`);
  }

  number(v: unknown, path: string, min: number, max: number, integer = false) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return void this.errors.push(`${path}: Zahl erwartet`);
    }
    if (integer && !Number.isInteger(v)) this.errors.push(`${path}: ganze Zahl erwartet`);
    if (v < min || v > max) this.errors.push(`${path}: außerhalb ${min}–${max}`);
  }

  boolean(v: unknown, path: string) {
    if (typeof v !== 'boolean') this.errors.push(`${path}: true/false erwartet`);
  }
}

/** Prüft, migriert und liefert ein gültiges Kartendokument. */
export function parseMapDocument(raw: unknown): MapDocument {
  if (!isObject(raw)) throw new ProjectFileError('invalidContent', ['Wurzel: Objekt erwartet']);
  if (raw.format !== MAP_FORMAT) throw new ProjectFileError('wrongFormat');
  const doc = migrate(raw);

  const c = new Checker();
  c.string(doc.id, 'id', { min: 1, max: 100 });
  c.string(doc.name, 'name', { min: 1, max: NAME_MAX });
  c.string(doc.createdAt, 'createdAt', { pattern: ISO_DATE });
  c.string(doc.modifiedAt, 'modifiedAt', { pattern: ISO_DATE });

  const grid = c.object(doc.grid, 'grid');
  c.number(grid.cols, 'grid.cols', GRID_MIN, GRID_MAX, true);
  c.number(grid.rows, 'grid.rows', GRID_MIN, GRID_MAX, true);
  c.number(grid.feetPerCell, 'grid.feetPerCell', FEET_PER_CELL_MIN, FEET_PER_CELL_MAX, true);
  c.boolean(grid.visible, 'grid.visible');
  c.string(grid.color, 'grid.color', { pattern: HEX_COLOR });
  c.number(grid.opacity, 'grid.opacity', 0, 1);

  const background = c.object(doc.background, 'background');
  c.string(background.color, 'background.color', { pattern: HEX_COLOR });

  if (c.errors.length) throw new ProjectFileError('invalidContent', c.errors);

  // Nur bekannte Felder übernehmen – unbekannte Zusatzdaten werden verworfen.
  return {
    format: MAP_FORMAT,
    version: 1,
    id: doc.id as string,
    name: doc.name as string,
    createdAt: doc.createdAt as string,
    modifiedAt: doc.modifiedAt as string,
    grid: {
      cols: grid.cols as number,
      rows: grid.rows as number,
      feetPerCell: grid.feetPerCell as number,
      visible: grid.visible as boolean,
      color: (grid.color as string).toLowerCase(),
      opacity: grid.opacity as number,
    },
    background: { color: (background.color as string).toLowerCase() },
  };
}
