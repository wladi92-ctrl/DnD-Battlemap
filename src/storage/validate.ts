/**
 * Strikte Prüfung von map.json (ohne Schema-Compiler, da die CSP kein eval erlaubt).
 * Das JSON-Schema in docs/schema/ beschreibt dieselben Regeln; ein Test hält beide synchron.
 */
import { GRID_MAX, GRID_MIN } from '../core/grid';
import { isCategoryId } from '../data/elements/categories';
import type { DoorState, WallKind } from '../core/walls';
import { ProjectFileError } from './errors';
import {
  COVER_LEVELS,
  DAMAGE_TYPES,
  DOOR_STATES,
  IMAGE_MAX_SIDE,
  WALL_KINDS,
  type BackgroundImage,
  type EdgeWall,
  type ImageRotation,
  ELEMENT_SIZE_MAX,
  ELEVATION_LIMIT,
  FEET_PER_CELL_MAX,
  FEET_PER_CELL_MIN,
  HEX_COLOR,
  LAYER_IDS,
  MAP_FORMAT,
  NAME_MAX,
  NOTE_MAX,
  parseCellKey,
  type CoverLevel,
  type CustomElement,
  type DamageType,
  type ElementLayerId,
  type LayerId,
  type LayerState,
  type MapDocument,
  type MapNote,
  type ObjectLayerId,
  type PlacedObject,
  type Rotation,
  type TerrainProps,
} from './mapDocument';
import { migrate, type RawDocument } from './migrations';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const ASSET_PATH = /^custom\/[A-Za-z0-9._-]{1,100}$/;
const BACKGROUND_PATH = /^background\/[A-Za-z0-9._-]{1,100}$/;
const WALLS_MAX = 50_000;
const ID_MAX = 100;
const OBJECTS_MAX = 100_000;
/** Maximale Anzahl gemeldeter Einzelfehler (große Karten sollen nicht tausende liefern). */
const MAX_ERRORS = 25;
const ROTATIONS: readonly number[] = [0, 90, 180, 270];

function isObject(v: unknown): v is RawDocument {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

class Checker {
  errors: string[] = [];

  fail(msg: string) {
    if (this.errors.length < MAX_ERRORS) this.errors.push(msg);
    return false;
  }

  object(v: unknown, path: string): RawDocument {
    if (!isObject(v)) {
      this.fail(`${path}: Objekt erwartet`);
      return {};
    }
    return v;
  }

  array(v: unknown, path: string, max: number): unknown[] {
    if (!Array.isArray(v)) {
      this.fail(`${path}: Liste erwartet`);
      return [];
    }
    if (v.length > max) this.fail(`${path}: zu viele Einträge`);
    return v;
  }

  string(
    v: unknown,
    path: string,
    opts: { min?: number; max?: number; pattern?: RegExp } = {},
  ): boolean {
    if (typeof v !== 'string') return this.fail(`${path}: Text erwartet`);
    if (opts.min !== undefined && v.length < opts.min) return this.fail(`${path}: zu kurz`);
    if (opts.max !== undefined && v.length > opts.max) return this.fail(`${path}: zu lang`);
    if (opts.pattern && !opts.pattern.test(v)) return this.fail(`${path}: ungültiges Format`);
    return true;
  }

  number(v: unknown, path: string, min: number, max: number, integer = false): boolean {
    if (typeof v !== 'number' || !Number.isFinite(v)) return this.fail(`${path}: Zahl erwartet`);
    if (integer && !Number.isInteger(v)) return this.fail(`${path}: ganze Zahl erwartet`);
    if (v < min || v > max) return this.fail(`${path}: außerhalb ${min}–${max}`);
    return true;
  }

  boolean(v: unknown, path: string): boolean {
    return typeof v === 'boolean' || this.fail(`${path}: true/false erwartet`);
  }

  oneOf<T extends string | number>(v: unknown, path: string, values: readonly T[]): boolean {
    return values.includes(v as T) || this.fail(`${path}: ungültiger Wert`);
  }
}

function checkLayers(c: Checker, raw: unknown): LayerState[] {
  const list = c.array(raw, 'layers', LAYER_IDS.length);
  const byId = new Map<string, LayerState>();
  list.forEach((entry, i) => {
    const l = c.object(entry, `layers[${i}]`);
    const okId = c.oneOf(l.id, `layers[${i}].id`, LAYER_IDS);
    const okV = c.boolean(l.visible, `layers[${i}].visible`);
    const okL = c.boolean(l.locked, `layers[${i}].locked`);
    if (okId && byId.has(l.id as string)) c.fail(`layers[${i}].id: doppelt`);
    if (okId && okV && okL) {
      byId.set(l.id as string, {
        id: l.id as LayerId,
        visible: l.visible as boolean,
        locked: l.locked as boolean,
      });
    }
  });
  for (const id of LAYER_IDS) if (!byId.has(id)) c.fail(`layers: Ebene "${id}" fehlt`);
  return LAYER_IDS.map((id) => byId.get(id) ?? { id, visible: true, locked: false });
}

function checkObjects(c: Checker, raw: unknown, cols: number, rows: number): PlacedObject[] {
  const list = c.array(raw, 'objects', OBJECTS_MAX);
  const ids = new Set<string>();
  const out: PlacedObject[] = [];
  list.forEach((entry, i) => {
    const p = `objects[${i}]`;
    const o = c.object(entry, p);
    const ok = [
      c.string(o.id, `${p}.id`, { min: 1, max: ID_MAX }),
      c.string(o.element, `${p}.element`, { min: 1, max: ID_MAX }),
      c.oneOf(o.layer, `${p}.layer`, ['walls', 'decor']),
      c.number(o.x, `${p}.x`, -ELEMENT_SIZE_MAX, cols, false),
      c.number(o.y, `${p}.y`, -ELEMENT_SIZE_MAX, rows, false),
      c.number(o.w, `${p}.w`, 1, ELEMENT_SIZE_MAX, true),
      c.number(o.h, `${p}.h`, 1, ELEMENT_SIZE_MAX, true),
      c.oneOf(o.rotation, `${p}.rotation`, ROTATIONS),
      c.boolean(o.flipX, `${p}.flipX`),
      c.boolean(o.flipY, `${p}.flipY`),
    ].every(Boolean);
    if (ok && ids.has(o.id as string)) return void c.fail(`${p}.id: doppelt`);
    if (!ok) return;
    ids.add(o.id as string);
    out.push({
      id: o.id as string,
      element: o.element as string,
      layer: o.layer as ObjectLayerId,
      x: o.x as number,
      y: o.y as number,
      w: o.w as number,
      h: o.h as number,
      rotation: o.rotation as Rotation,
      flipX: o.flipX as boolean,
      flipY: o.flipY as boolean,
    });
  });
  return out;
}

function checkTerrainProps(c: Checker, raw: unknown, p: string): TerrainProps {
  const t = c.object(raw, p);
  const out: TerrainProps = {};
  for (const key of Object.keys(t)) {
    const v = t[key];
    switch (key) {
      case 'difficult':
      case 'blocksSight':
      case 'blocksMovement':
        if (c.boolean(v, `${p}.${key}`) && v) out[key] = true;
        break;
      case 'cover':
        if (c.oneOf(v, `${p}.cover`, COVER_LEVELS)) out.cover = v as CoverLevel;
        break;
      case 'damage':
        if (c.oneOf(v, `${p}.damage`, DAMAGE_TYPES)) out.damage = v as DamageType;
        break;
      case 'elevation':
        if (c.number(v, `${p}.elevation`, -ELEVATION_LIMIT, ELEVATION_LIMIT) && v !== 0) {
          out.elevation = v as number;
        }
        break;
      default:
        c.fail(`${p}.${key}: unbekannte Eigenschaft`);
    }
  }
  return out;
}

function checkTerrain(c: Checker, raw: unknown, cols: number, rows: number) {
  const t = c.object(raw, 'terrain');
  const out: Record<string, TerrainProps> = {};
  for (const [key, value] of Object.entries(t)) {
    const cell = parseCellKey(key);
    if (!cell || cell.x < 0 || cell.y < 0 || cell.x >= cols || cell.y >= rows) {
      c.fail(`terrain["${key}"]: ungültiges Feld`);
      continue;
    }
    const props = checkTerrainProps(c, value, `terrain["${key}"]`);
    if (Object.keys(props).length) out[key] = props;
  }
  return out;
}

function checkNotes(c: Checker, raw: unknown, cols: number, rows: number): MapNote[] {
  const list = c.array(raw, 'notes', OBJECTS_MAX);
  const out: MapNote[] = [];
  list.forEach((entry, i) => {
    const p = `notes[${i}]`;
    const n = c.object(entry, p);
    const ok = [
      c.string(n.id, `${p}.id`, { min: 1, max: ID_MAX }),
      c.number(n.x, `${p}.x`, 0, cols - 1, true),
      c.number(n.y, `${p}.y`, 0, rows - 1, true),
      c.string(n.text, `${p}.text`, { max: NOTE_MAX }),
    ].every(Boolean);
    if (ok) {
      out.push({ id: n.id as string, x: n.x as number, y: n.y as number, text: n.text as string });
    }
  });
  return out;
}

function checkCustomElements(c: Checker, raw: unknown): CustomElement[] {
  const list = c.array(raw, 'customElements', 1000);
  const out: CustomElement[] = [];
  list.forEach((entry, i) => {
    const p = `customElements[${i}]`;
    const e = c.object(entry, p);
    const ok = [
      c.string(e.id, `${p}.id`, { min: 8, max: ID_MAX, pattern: /^custom\./ }),
      c.string(e.name, `${p}.name`, { min: 1, max: NAME_MAX }),
      isCategoryId(e.category) || c.fail(`${p}.category: ungültiger Wert`),
      c.oneOf(e.layer, `${p}.layer`, ['floor', 'walls', 'decor']),
      c.number(e.w, `${p}.w`, 1, ELEMENT_SIZE_MAX, true),
      c.number(e.h, `${p}.h`, 1, ELEMENT_SIZE_MAX, true),
      c.string(e.asset, `${p}.asset`, { pattern: ASSET_PATH }),
    ].every(Boolean);
    if (ok) {
      out.push({
        id: e.id as string,
        name: e.name as string,
        category: e.category as string,
        layer: e.layer as ElementLayerId,
        w: e.w as number,
        h: e.h as number,
        asset: e.asset as string,
      });
    }
  });
  return out;
}

function checkBackgroundImage(c: Checker, raw: unknown): BackgroundImage | undefined {
  if (raw === undefined) return undefined;
  const p = 'background.image';
  const i = c.object(raw, p);
  const crop = c.object(i.crop, `${p}.crop`);
  const ok = [
    c.string(i.asset, `${p}.asset`, { pattern: BACKGROUND_PATH }),
    c.number(i.width, `${p}.width`, 1, IMAGE_MAX_SIDE, true),
    c.number(i.height, `${p}.height`, 1, IMAGE_MAX_SIDE, true),
    c.oneOf(i.rotation, `${p}.rotation`, ROTATIONS),
    c.number(i.cellPx, `${p}.cellPx`, 2, 4000),
    c.number(i.originX, `${p}.originX`, -IMAGE_MAX_SIDE, IMAGE_MAX_SIDE),
    c.number(i.originY, `${p}.originY`, -IMAGE_MAX_SIDE, IMAGE_MAX_SIDE),
    c.number(crop.x, `${p}.crop.x`, 0, IMAGE_MAX_SIDE),
    c.number(crop.y, `${p}.crop.y`, 0, IMAGE_MAX_SIDE),
    c.number(crop.w, `${p}.crop.w`, 1, IMAGE_MAX_SIDE),
    c.number(crop.h, `${p}.crop.h`, 1, IMAGE_MAX_SIDE),
    c.number(i.brightness, `${p}.brightness`, 0.2, 3),
    c.number(i.contrast, `${p}.contrast`, -1, 1),
  ].every(Boolean);
  if (!ok) return undefined;
  return {
    asset: i.asset as string,
    width: i.width as number,
    height: i.height as number,
    rotation: i.rotation as ImageRotation,
    cellPx: i.cellPx as number,
    originX: i.originX as number,
    originY: i.originY as number,
    crop: { x: crop.x as number, y: crop.y as number, w: crop.w as number, h: crop.h as number },
    brightness: i.brightness as number,
    contrast: i.contrast as number,
  };
}

function checkWalls(c: Checker, raw: unknown, cols: number, rows: number): EdgeWall[] {
  const list = c.array(raw, 'walls', WALLS_MAX);
  const ids = new Set<string>();
  const out: EdgeWall[] = [];
  list.forEach((entry, i) => {
    const p = `walls[${i}]`;
    const w = c.object(entry, p);
    const door = w.kind === 'door' || w.kind === 'secret';
    const ok = [
      c.string(w.id, `${p}.id`, { min: 1, max: ID_MAX }),
      c.number(w.x1, `${p}.x1`, 0, cols),
      c.number(w.y1, `${p}.y1`, 0, rows),
      c.number(w.x2, `${p}.x2`, 0, cols),
      c.number(w.y2, `${p}.y2`, 0, rows),
      c.oneOf(w.kind, `${p}.kind`, WALL_KINDS),
      w.state === undefined ||
        (door ? c.oneOf(w.state, `${p}.state`, DOOR_STATES) : c.fail(`${p}.state: nur bei Türen`)),
    ].every(Boolean);
    if (ok && ids.has(w.id as string)) return void c.fail(`${p}.id: doppelt`);
    if (!ok) return;
    ids.add(w.id as string);
    out.push({
      id: w.id as string,
      x1: w.x1 as number,
      y1: w.y1 as number,
      x2: w.x2 as number,
      y2: w.y2 as number,
      kind: w.kind as WallKind,
      ...(w.state !== undefined ? { state: w.state as DoorState } : {}),
    });
  });
  return out;
}

/** Prüft, migriert und liefert ein gültiges Kartendokument. */
export function parseMapDocument(raw: unknown): MapDocument {
  if (!isObject(raw)) throw new ProjectFileError('invalidContent', ['Wurzel: Objekt erwartet']);
  if (raw.format !== MAP_FORMAT) throw new ProjectFileError('wrongFormat');
  const doc = migrate(raw);

  const c = new Checker();
  c.string(doc.id, 'id', { min: 1, max: ID_MAX });
  c.string(doc.name, 'name', { min: 1, max: NAME_MAX });
  c.string(doc.createdAt, 'createdAt', { pattern: ISO_DATE });
  c.string(doc.modifiedAt, 'modifiedAt', { pattern: ISO_DATE });

  const grid = c.object(doc.grid, 'grid');
  const colsOk = c.number(grid.cols, 'grid.cols', GRID_MIN, GRID_MAX, true);
  const rowsOk = c.number(grid.rows, 'grid.rows', GRID_MIN, GRID_MAX, true);
  c.number(grid.feetPerCell, 'grid.feetPerCell', FEET_PER_CELL_MIN, FEET_PER_CELL_MAX, true);
  c.boolean(grid.visible, 'grid.visible');
  c.string(grid.color, 'grid.color', { pattern: HEX_COLOR });
  c.number(grid.opacity, 'grid.opacity', 0, 1);

  const background = c.object(doc.background, 'background');
  c.string(background.color, 'background.color', { pattern: HEX_COLOR });
  const image = checkBackgroundImage(c, background.image);

  // Inhalte nur prüfen, wenn die Rastergröße stimmt (sonst Folgefehler).
  if (c.errors.length || !colsOk || !rowsOk) {
    throw new ProjectFileError('invalidContent', c.errors);
  }
  const cols = grid.cols as number;
  const rows = grid.rows as number;

  const layers = checkLayers(c, doc.layers);
  const floor = c.array(doc.floor, 'floor', cols * rows);
  if (floor.length !== cols * rows) c.fail(`floor: ${cols * rows} Einträge erwartet`);
  floor.forEach((v, i) => {
    if (typeof v !== 'string' || v.length > ID_MAX) c.fail(`floor[${i}]: Element-ID erwartet`);
  });
  const objects = checkObjects(c, doc.objects, cols, rows);
  const terrain = checkTerrain(c, doc.terrain, cols, rows);
  const notes = checkNotes(c, doc.notes, cols, rows);
  const customElements = checkCustomElements(c, doc.customElements);
  const walls = checkWalls(c, doc.walls, cols, rows);

  if (c.errors.length) throw new ProjectFileError('invalidContent', c.errors);

  // Nur bekannte Felder übernehmen – unbekannte Zusatzdaten werden verworfen.
  return {
    format: MAP_FORMAT,
    version: 3,
    id: doc.id as string,
    name: doc.name as string,
    createdAt: doc.createdAt as string,
    modifiedAt: doc.modifiedAt as string,
    grid: {
      cols,
      rows,
      feetPerCell: grid.feetPerCell as number,
      visible: grid.visible as boolean,
      color: (grid.color as string).toLowerCase(),
      opacity: grid.opacity as number,
    },
    background: {
      color: (background.color as string).toLowerCase(),
      ...(image ? { image } : {}),
    },
    layers,
    floor: floor as string[],
    objects,
    terrain,
    notes,
    customElements,
    walls,
  };
}
