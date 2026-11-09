/**
 * Kartendokument – Inhalt von map.json in einer .dndmap-Datei.
 * Das Format ist versioniert; Änderungen erhöhen MAP_FORMAT_VERSION und erhalten
 * eine Migration in migrations.ts. Beschreibung: docs/DATEIFORMAT.md,
 * JSON-Schema: docs/schema/map.v3.schema.json.
 */
import { clampGridDimension } from '../core/grid';
import type { DoorState, WallKind } from '../core/walls';

export const MAP_FORMAT = 'dndmap';
export const MAP_FORMAT_VERSION = 3;

export const FEET_PER_CELL_MIN = 1;
export const FEET_PER_CELL_MAX = 100;
export const NAME_MAX = 120;
export const NOTE_MAX = 2000;
export const ELEMENT_SIZE_MAX = 10;
export const ELEVATION_LIMIT = 1000;

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

/** Ebenen von unten nach oben. Tokens, Effekte und Nebel folgen in späteren Phasen. */
export type LayerId = 'floor' | 'walls' | 'decor' | 'gm';
export const LAYER_IDS: readonly LayerId[] = ['floor', 'walls', 'decor', 'gm'];
/** Ebenen, auf denen Objekte (statt Bodenkacheln) liegen. */
export type ObjectLayerId = 'walls' | 'decor';
export const OBJECT_LAYERS: readonly ObjectLayerId[] = ['walls', 'decor'];
/** Ebenen, auf die Elemente gemalt werden können. */
export type ElementLayerId = 'floor' | ObjectLayerId;

export interface LayerState {
  id: LayerId;
  visible: boolean;
  locked: boolean;
}

export type Rotation = 0 | 90 | 180 | 270;

/** Ein platziertes Element auf einer Objekt-Ebene. Position/Größe in Feldern. */
export interface PlacedObject {
  id: string;
  element: string;
  layer: ObjectLayerId;
  /** Linke obere Ecke des (gedrehten) Platzbedarfs; mit Raster-Snap ganzzahlig. */
  x: number;
  y: number;
  /** Ungedrehte Größe in Feldern. */
  w: number;
  h: number;
  rotation: Rotation;
  flipX: boolean;
  flipY: boolean;
}

/** Deckungsstufen nach SRD 5.1. */
export type CoverLevel = 'half' | 'threeQuarters' | 'full';
export const COVER_LEVELS: readonly CoverLevel[] = ['half', 'threeQuarters', 'full'];

/** Schadensarten nach SRD 5.1. */
export const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

/** Geländeeigenschaften eines Feldes. Nicht gesetzte Felder = Standard/keine. */
export interface TerrainProps {
  difficult?: boolean;
  cover?: CoverLevel;
  /** Höhe in Fuß (negativ = Vertiefung). */
  elevation?: number;
  damage?: DamageType;
  blocksSight?: boolean;
  blocksMovement?: boolean;
}

/** GM-Notiz an einem Feld (nur für die Spielleitung sichtbar). */
export interface MapNote {
  id: string;
  x: number;
  y: number;
  text: string;
}

/** Vom Nutzer importiertes Element; Bilddaten liegen unter assets/<asset>. */
export interface CustomElement {
  id: string;
  name: string;
  category: string;
  layer: ElementLayerId;
  w: number;
  h: number;
  /** Pfad innerhalb von assets/, z. B. "custom/3f…a1.png". */
  asset: string;
}

export type ImageRotation = 0 | 90 | 180 | 270;

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Importiertes Kartenbild als Hintergrund. Alle Pixelangaben beziehen sich auf das
 * gedrehte Bild (Breite/Höhe bei 90°/270° vertauscht).
 */
export interface BackgroundImage {
  /** Pfad innerhalb von assets/, z. B. "background/3f…a1.jpg". */
  asset: string;
  /** Größe des Originalbildes in Pixeln (ungedreht). */
  width: number;
  height: number;
  rotation: ImageRotation;
  /** Pixel pro Feld (Kalibrierung). */
  cellPx: number;
  /** Bildposition (px) der linken oberen Ecke von Feld (0, 0). */
  originX: number;
  originY: number;
  /** Sichtbarer Bildausschnitt (px). */
  crop: CropRect;
  /** Helligkeit, 1 = unverändert (0,2–3). */
  brightness: number;
  /** Kontrast, 0 = unverändert (−1…1). */
  contrast: number;
}

export interface MapBackground {
  color: string;
  image?: BackgroundImage;
}

/** Wand entlang von Kanten (Feldkoordinaten; ganzzahlig = Rasterlinien). */
export interface EdgeWall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: WallKind;
  /** Nur bei Türen und Geheimtüren. */
  state?: DoorState;
}

export const WALL_KINDS: readonly WallKind[] = ['wall', 'door', 'window', 'secret'];
export const DOOR_STATES: readonly DoorState[] = ['closed', 'open', 'locked'];
export const IMAGE_MAX_SIDE = 16384;

export interface MapDocument {
  format: typeof MAP_FORMAT;
  version: typeof MAP_FORMAT_VERSION;
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  grid: GridSettings;
  background: MapBackground;
  layers: LayerState[];
  /** Bodenkachel je Feld (Index y·cols+x), '' = leer. */
  floor: string[];
  objects: PlacedObject[];
  /** Geländeeigenschaften, Schlüssel "x,y". */
  terrain: Record<string, TerrainProps>;
  notes: MapNote[];
  customElements: CustomElement[];
  /** Kantenwände, Türen und Fenster (gehören zur Ebene "Wände/Objekte"). */
  walls: EdgeWall[];
}

export interface NewMapOptions {
  name: string;
  cols: number;
  rows: number;
  feetPerCell?: number;
  backgroundColor?: string;
  backgroundImage?: BackgroundImage;
}

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const defaultGrid: Omit<GridSettings, 'cols' | 'rows'> = {
  feetPerCell: 5,
  visible: true,
  color: '#000000',
  opacity: 0.35,
};

export const DEFAULT_BACKGROUND = '#d9cfb8';

export function defaultLayers(): LayerState[] {
  return LAYER_IDS.map((id) => ({ id, visible: true, locked: false }));
}

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseCellKey(key: string): { x: number; y: number } | null {
  const m = /^(-?\d+),(-?\d+)$/.exec(key);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

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
  const cols = clampGridDimension(opts.cols);
  const rows = clampGridDimension(opts.rows);
  return {
    format: MAP_FORMAT,
    version: MAP_FORMAT_VERSION,
    id: crypto.randomUUID(),
    name: normalizeName(opts.name, 'Neue Karte'),
    createdAt: ts,
    modifiedAt: ts,
    grid: {
      ...defaultGrid,
      cols,
      rows,
      feetPerCell: clampFeetPerCell(opts.feetPerCell ?? defaultGrid.feetPerCell),
    },
    background: {
      color:
        opts.backgroundColor && HEX_COLOR.test(opts.backgroundColor)
          ? opts.backgroundColor.toLowerCase()
          : DEFAULT_BACKGROUND,
      ...(opts.backgroundImage ? { image: opts.backgroundImage } : {}),
    },
    layers: defaultLayers(),
    floor: new Array<string>(cols * rows).fill(''),
    objects: [],
    terrain: {},
    notes: [],
    customElements: [],
    walls: [],
  };
}

/** Größe des gedrehten Bildes in Pixeln. */
export function rotatedSize(img: Pick<BackgroundImage, 'width' | 'height' | 'rotation'>) {
  return img.rotation === 90 || img.rotation === 270
    ? { w: img.height, h: img.width }
    : { w: img.width, h: img.height };
}

/** Anzahl ganzer Felder, die der Bildausschnitt ab dem Ursprung abdeckt. */
export function imageGridSize(
  img: Pick<BackgroundImage, 'cellPx' | 'originX' | 'originY' | 'crop'>,
) {
  const cols = Math.floor((img.crop.x + img.crop.w - img.originX) / img.cellPx + 1e-6);
  const rows = Math.floor((img.crop.y + img.crop.h - img.originY) / img.cellPx + 1e-6);
  return { cols: Math.max(1, cols), rows: Math.max(1, rows) };
}

/** Wendet Rastereinstellungen geprüft und begrenzt an (ohne Inhalte anzupassen). */
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

export function layerState(doc: MapDocument, id: LayerId): LayerState {
  return doc.layers.find((l) => l.id === id) ?? { id, visible: true, locked: false };
}
