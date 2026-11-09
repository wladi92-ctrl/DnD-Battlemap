/**
 * Kartendokument – Inhalt von map.json in einer .dndmap-Datei.
 * Das Format ist versioniert; Änderungen erhöhen MAP_FORMAT_VERSION und erhalten
 * eine Migration in migrations.ts. Beschreibung: docs/DATEIFORMAT.md,
 * JSON-Schema: docs/schema/map.v1.schema.json.
 */
import { clampGridDimension } from '../core/grid';

export const MAP_FORMAT = 'dndmap';
export const MAP_FORMAT_VERSION = 1;

export const FEET_PER_CELL_MIN = 1;
export const FEET_PER_CELL_MAX = 100;
export const NAME_MAX = 120;

export interface GridSettings {
  cols: number;
  rows: number;
  /** Fuß pro Feld, Standard 5. */
  feetPerCell: number;
  visible: boolean;
  /** Linienfarbe als #rrggbb. */
  color: string;
  /** Deckkraft der Linien, 0–1. */
  opacity: number;
}

export interface MapDocument {
  format: typeof MAP_FORMAT;
  version: typeof MAP_FORMAT_VERSION;
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  grid: GridSettings;
  background: { color: string };
}

export interface NewMapOptions {
  name: string;
  cols: number;
  rows: number;
  feetPerCell?: number;
  backgroundColor?: string;
}

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const defaultGrid: Omit<GridSettings, 'cols' | 'rows'> = {
  feetPerCell: 5,
  visible: true,
  color: '#000000',
  opacity: 0.35,
};

export const DEFAULT_BACKGROUND = '#d9cfb8';

export function clampFeetPerCell(n: number): number {
  if (!Number.isFinite(n)) return defaultGrid.feetPerCell;
  return Math.min(FEET_PER_CELL_MAX, Math.max(FEET_PER_CELL_MIN, Math.round(n)));
}

export function clampOpacity(n: number): number {
  if (!Number.isFinite(n)) return defaultGrid.opacity;
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

export function normalizeName(name: string, fallback: string): string {
  const trimmed = name.trim().slice(0, NAME_MAX);
  return trimmed || fallback;
}

export function createMap(opts: NewMapOptions, now = new Date()): MapDocument {
  const ts = now.toISOString();
  return {
    format: MAP_FORMAT,
    version: MAP_FORMAT_VERSION,
    id: crypto.randomUUID(),
    name: normalizeName(opts.name, 'Neue Karte'),
    createdAt: ts,
    modifiedAt: ts,
    grid: {
      ...defaultGrid,
      cols: clampGridDimension(opts.cols),
      rows: clampGridDimension(opts.rows),
      feetPerCell: clampFeetPerCell(opts.feetPerCell ?? defaultGrid.feetPerCell),
    },
    background: {
      color:
        opts.backgroundColor && HEX_COLOR.test(opts.backgroundColor)
          ? opts.backgroundColor.toLowerCase()
          : DEFAULT_BACKGROUND,
    },
  };
}

/** Wendet Rastereinstellungen geprüft und begrenzt an. */
export function applyGridChanges(grid: GridSettings, changes: Partial<GridSettings>): GridSettings {
  const next = { ...grid, ...changes };
  return {
    cols: clampGridDimension(next.cols),
    rows: clampGridDimension(next.rows),
    feetPerCell: clampFeetPerCell(next.feetPerCell),
    visible: Boolean(next.visible),
    color: HEX_COLOR.test(next.color) ? next.color.toLowerCase() : grid.color,
    opacity: clampOpacity(next.opacity),
  };
}

/** Dateiname ohne verbotene Zeichen, z. B. für "Speichern unter". */
export function suggestFileName(name: string): string {
  // Steuerzeichen sind in Dateinamen unter Windows verboten – bewusst im Muster enthalten.
  // eslint-disable-next-line no-control-regex
  const base = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim() || 'Karte';
  return `${base}.dndmap`;
}
