/**
 * Kartendokument – Inhalt von map.json in einer .dndmap-Datei.
 * Das Format ist versioniert; Änderungen erhöhen MAP_FORMAT_VERSION und erhalten
 * eine Migration in migrations.ts. Beschreibung: docs/DATEIFORMAT.md,
 * JSON-Schema: docs/schema/map.v7.schema.json.
 */
import type { AoeShape, WallMode } from '../core/aoe';
import type { Ambient } from '../core/vision';
import { clampGridDimension } from '../core/grid';
import type { DoorState, WallKind } from '../core/walls';
import type { SizeCategory } from '../data/srd/creatures';

export const MAP_FORMAT = 'dndmap';
export const MAP_FORMAT_VERSION = 7;

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

/** Ebenen von unten nach oben. Effekte und Nebel folgen in späteren Phasen. */
export type LayerId = 'floor' | 'walls' | 'decor' | 'tokens' | 'effects' | 'gm';
export const LAYER_IDS: readonly LayerId[] = ['floor', 'walls', 'decor', 'tokens', 'effects', 'gm'];
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

export type Team = 'player' | 'ally' | 'enemy' | 'neutral';
export const TEAMS: readonly Team[] = ['player', 'ally', 'enemy', 'neutral'];
export type TokenKind = 'creature' | 'pc';

/** Eigener Marker an einem Token (zusätzlich zu den SRD-Zuständen). */
export interface TokenMarker {
  label: string;
  color: string;
}

/** Figur auf der Karte (Kreatur oder Spielercharakter). Position = linke obere Ecke in Feldern. */
export interface Token {
  id: string;
  name: string;
  kind: TokenKind;
  /** SRD-Kreatur-ID, ID einer eigenen Kreatur ("custom:…") oder eines Charakters ("pc:…"). */
  source?: string;
  size: SizeCategory;
  x: number;
  y: number;
  team: Team;
  color: string;
  /** Eigenes Bild unter assets/ (z. B. "tokens/…png"). */
  image?: string;
  hp: { current: number; max: number; temp: number };
  ac: number;
  /** Geschwindigkeit zu Fuß in ft. */
  speed: number;
  /** Nahkampfreichweite in ft. */
  reach: number;
  initiativeBonus: number;
  passivePerception: number;
  darkvision: number;
  conditions: string[];
  markers: TokenMarker[];
  deathSaves: { success: number; failure: number };
  /** Nur für die Spielleitung sichtbar. */
  hidden: boolean;
  /** Blickrichtung in Grad (0 = oben, im Uhrzeigersinn). */
  facing: number;
  /** In dieser Runde verbrauchte Bewegung (ft). */
  movementUsed: number;
  actionsUsed: { action: boolean; bonus: boolean; reaction: boolean };
  groupId?: string;
  /** Nur bei Spielercharakteren. */
  pc?: { className: string; level: number };
}

export type SaveAbility = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const SAVE_ABILITIES: readonly SaveAbility[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** Hinweis, wann ein dauerhafter Effekt eine Kreatur trifft. */
export type EffectTrigger = 'none' | 'enter' | 'turnStart' | 'both';
export const EFFECT_TRIGGERS: readonly EffectTrigger[] = ['none', 'enter', 'turnStart', 'both'];
export const EFFECTS_MAX = 500;
export const EFFECT_SIZE_MAX = 5000;
export const EFFECT_CELLS_MAX = 40000;
export const DICE_TEXT_MAX = 60;

/**
 * Dauerhafter Flächeneffekt auf der Karte (Wolke, Zone, Aura). Die betroffenen Felder werden
 * nicht gespeichert, sondern aus Form, Ursprung, Wänden und Flächenregel berechnet.
 */
export interface MapEffect {
  id: string;
  name: string;
  shape: AoeShape;
  /** Größe in ft (Radius, Länge, Kante, Abstand – je nach Form). */
  size: number;
  /** Linienbreite in ft. */
  width?: number;
  /** Ursprung in Feldkoordinaten. */
  origin: { x: number; y: number };
  /** Richtung in Grad (0 = Osten, 90 = Süden). */
  angle: number;
  /** Freie Fläche: Felder [x, y]. */
  cells?: [number, number][];
  /** Aura folgt diesem Token. */
  attachedTo?: string;
  color: string;
  damageType?: DamageType;
  wallMode: WallMode;
  /** Verbleibende Runden; null = unbegrenzt. */
  rounds: number | null;
  concentration: boolean;
  trigger: EffectTrigger;
  save?: { ability: SaveAbility; dc: number; half: boolean };
  /** Schaden als Würfelausdruck, z. B. "5d8". */
  damage?: string;
  /** Herkunft aus der Effektbibliothek (z. B. "spell.cloudkill"). */
  source?: string;
  notes?: string;
  /** Vor Spielern verborgen. */
  hidden: boolean;
}

/** Teilnehmer der Initiative (meist ein Token; ohne Token z. B. Hortaktionen). */
export interface CombatEntry {
  id: string;
  tokenId?: string;
  /** Name zum Zeitpunkt des Hinzufügens (bleibt, falls das Token gelöscht wird). */
  name: string;
  /** Initiativewert; null = noch nicht gewürfelt/eingetragen. */
  initiative: number | null;
  /** Initiativebonus (Gleichstand: höherer Bonus zuerst). */
  bonus: number;
  /** Zufallswert 1–1000 für verbleibende Gleichstände. */
  tiebreak: number;
  /** Zug verzögert: wird übersprungen, bis „Jetzt handeln“. */
  delayed: boolean;
}

/** Laufender Kampf: Reihenfolge, Runde und aktueller Zug (Index in entries). */
export interface CombatState {
  /** false = Vorbereitung (Initiative würfeln/eintragen); true = erster Zug hat begonnen. */
  started: boolean;
  round: number;
  turn: number;
  entries: CombatEntry[];
}

export type LogKind = 'combat' | 'turn' | 'roll' | 'attack' | 'damage' | 'heal' | 'effect' | 'note';
export const LOG_KINDS: readonly LogKind[] = [
  'combat',
  'turn',
  'roll',
  'attack',
  'damage',
  'heal',
  'effect',
  'note',
];
export const COMBAT_ENTRIES_MAX = 500;
export const LOG_MAX = 2000;
export const LOG_TEXT_MAX = 500;

export interface LogEntry {
  id: string;
  /** Zeitpunkt (ISO, UTC). */
  time: string;
  /** Runde, falls im Kampf. */
  round: number | null;
  kind: LogKind;
  text: string;
}

/** Nebel des Krieges: manuell aufgedeckte Felder als Lauflängen (siehe core/vision.ts). */
export interface FogState {
  enabled: boolean;
  revealed: number[];
}

/** Dynamische Sicht und Grundhelligkeit. */
export interface LightingState {
  enabled: boolean;
  ambient: Ambient;
}

export const LIGHTS_MAX = 500;
export const LIGHT_RADIUS_MAX = 1000;

/** Lichtquelle (Fackel, Laterne, Licht-Zauber …) oder magische Dunkelheit. */
export interface MapLight {
  id: string;
  name: string;
  /** Mittelpunkt in Feldkoordinaten. */
  x: number;
  y: number;
  /** Radius hellen Lichts in ft. */
  bright: number;
  /** Radius dämmrigen Lichts in ft (gesamt). */
  dim: number;
  color: string;
  darkness: boolean;
  enabled: boolean;
  /** Getragen von diesem Token (folgt ihm). */
  attachedTo?: string;
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
  /** Figuren auf der Ebene "Tokens". */
  tokens: Token[];
  /** Dauerhafte Flächeneffekte auf der Ebene "Effekte". */
  effects: MapEffect[];
  /** Laufender Kampf (null = kein Kampf). */
  combat: CombatState | null;
  /** Kampflog (nur anhängen; nicht Teil von Rückgängig/Wiederholen). */
  combatLog: LogEntry[];
  /** Nebel des Krieges (manuell). */
  fog: FogState;
  /** Je von Spielerfiguren gesehene Felder (Lauflängen; nicht im Undo-Verlauf). */
  explored: number[];
  lighting: LightingState;
  lights: MapLight[];
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
    tokens: [],
    effects: [],
    combat: null,
    combatLog: [],
    fog: { enabled: false, revealed: [] },
    explored: [],
    lighting: { enabled: false, ambient: 'bright' },
    lights: [],
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
