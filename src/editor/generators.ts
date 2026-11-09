/**
 * Raumvorlagen und zufällige Verliese (deterministisch per Seed).
 * Ergebnis ist ein "Stempel", der an beliebiger Stelle in die Karte eingesetzt wird.
 */
import type { Cell } from '../core/grid';
import { pick, randInt, rngFrom, type Rng } from '../core/random';
import { floodFill } from '../core/shapes';
import { getBuiltinElement } from '../data/elements';
import {
  cellKey,
  layerState,
  type MapDocument,
  type PlacedObject,
  type Rotation,
  type TerrainProps,
} from '../storage/mapDocument';
import { footprintSize } from './footprint';
import { newId, type OpResult } from './ops';
import { isEmptyPatch, type DocPatch, type FloorChange, type TerrainChange } from './patch';

export interface StampObject {
  element: string;
  x: number;
  y: number;
  rotation: Rotation;
}

export interface Stamp {
  w: number;
  h: number;
  /** '' = Feld unverändert lassen. */
  floor: string[];
  objects: StampObject[];
  terrain: Record<string, TerrainProps>;
}

export const TEMPLATE_IDS = ['tavern', 'dungeon', 'cave', 'clearing', 'bridge'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const DUNGEON_MIN = 20;
export const DUNGEON_MAX = 120;

class Builder {
  floor: string[];
  objects: StampObject[] = [];
  terrain: Record<string, TerrainProps> = {};

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.floor = new Array<string>(w * h).fill('');
  }

  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  getFloor(x: number, y: number) {
    return this.inside(x, y) ? (this.floor[y * this.w + x] ?? '') : '';
  }

  set(x: number, y: number, id: string) {
    if (this.inside(x, y)) this.floor[y * this.w + x] = id;
  }

  fill(x: number, y: number, w: number, h: number, id: string) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, id);
  }

  place(element: string, x: number, y: number, rotation: Rotation = 0) {
    const def = getBuiltinElement(element);
    if (!def) throw new Error(`Unbekanntes Element in Vorlage: ${element}`);
    const s = footprintSize({ w: def.w, h: def.h, rotation });
    if (x < 0 || y < 0 || x + s.w > this.w || y + s.h > this.h) return;
    // Wände an dieser Stelle werden durch Türen/Fenster ersetzt.
    if (def.layer === 'walls') {
      this.objects = this.objects.filter((o) => {
        const od = getBuiltinElement(o.element);
        const os = footprintSize({ w: od?.w ?? 1, h: od?.h ?? 1, rotation: o.rotation });
        const overlap = o.x < x + s.w && o.x + os.w > x && o.y < y + s.h && o.y + os.h > y;
        return !(overlap && od?.layer === 'walls' && od.category === 'walls');
      });
    }
    this.objects.push({ element, x, y, rotation });
  }

  /** Setzt Wände auf alle leeren Felder, die an Boden grenzen (8er-Nachbarschaft). */
  autoWalls(wall: string) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.getFloor(x, y)) continue;
        let touches = false;
        for (let dy = -1; dy <= 1 && !touches; dy++) {
          for (let dx = -1; dx <= 1; dx++) if (this.getFloor(x + dx, y + dy)) touches = true;
        }
        if (touches) this.objects.push({ element: wall, x, y, rotation: 0 });
      }
    }
  }

  /** Wandumriss eines Rechtecks. */
  outline(x: number, y: number, w: number, h: number, wall: string) {
    for (let xx = x; xx < x + w; xx++) {
      this.place(wall, xx, y);
      this.place(wall, xx, y + h - 1);
    }
    for (let yy = y + 1; yy < y + h - 1; yy++) {
      this.place(wall, x, yy);
      this.place(wall, x + w - 1, yy);
    }
  }

  build(): Stamp {
    return {
      w: this.w,
      h: this.h,
      floor: this.floor,
      objects: this.objects,
      terrain: this.terrain,
    };
  }
}

// ------------------------------------------------------------------ Vorlagen

function tavern(): Stamp {
  const b = new Builder(16, 12);
  b.fill(1, 1, 14, 10, 'floor.wood');
  b.fill(2, 2, 3, 2, 'floor.carpet_red');
  b.outline(0, 0, 16, 12, 'wall.stone');
  b.place('door.double_closed', 7, 11);
  b.place('window.glass', 4, 0);
  b.place('window.glass', 11, 0);
  b.place('window.glass', 0, 6, 90);
  b.place('light.fireplace', 2, 1);
  b.place('furniture.shelf', 10, 1);
  b.place('furniture.bar_counter', 10, 3);
  b.place('furniture.barrel', 13, 1);
  b.place('furniture.barrel', 14, 1);
  b.place('furniture.stool', 10, 4);
  b.place('furniture.stool', 12, 4);
  for (const [tx, ty] of [
    [3, 5],
    [7, 5],
    [3, 8],
    [7, 8],
  ] as const) {
    b.place('furniture.table_round', tx, ty);
    b.place('furniture.chair', tx - 1, ty, 270);
    b.place('furniture.chair', tx + 1, ty, 90);
  }
  b.place('furniture.bench', 11, 6);
  b.place('furniture.table_long', 11, 7);
  b.place('furniture.bench', 11, 8, 180);
  b.place('stairs.up', 14, 9);
  b.place('light.torch', 14, 6);
  return b.build();
}

function dungeon(): Stamp {
  const b = new Builder(14, 12);
  b.fill(1, 1, 5, 5, 'floor.dungeon');
  b.fill(8, 1, 5, 10, 'floor.dungeon');
  b.fill(6, 3, 2, 1, 'floor.flagstone');
  b.fill(1, 7, 5, 4, 'floor.dungeon');
  b.fill(3, 6, 1, 1, 'floor.flagstone');
  b.autoWalls('wall.stone');
  b.place('door.iron_closed', 6, 3, 90);
  b.place('door.wood_closed', 3, 6);
  b.place('wall.iron_bars', 3, 8, 90);
  b.place('wall.iron_bars', 3, 9, 90);
  b.place('wall.iron_bars', 3, 10, 90);
  b.place('misc.bones', 1, 10);
  b.place('misc.skulls', 5, 10);
  b.place('furniture.chest', 11, 9);
  b.place('trap.pit', 10, 5);
  b.place('light.brazier', 9, 2);
  b.place('light.brazier', 11, 2);
  b.place('furniture.altar', 9, 1);
  b.place('furniture.barrel', 1, 1);
  b.place('furniture.crate', 2, 1);
  b.place('misc.web', 5, 1);
  b.place('light.torch', 1, 3);
  b.place('stairs.down', 12, 10);
  return b.build();
}

/** Höhle per zellulärem Automaten (fester Seed), größte zusammenhängende Fläche bleibt. */
function caveShape(rng: Rng, w: number, h: number): boolean[] {
  let open = Array.from({ length: w * h }, (_, i) => {
    const x = i % w;
    const y = Math.floor(i / w);
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return false;
    return rng() > 0.42;
  });
  for (let step = 0; step < 4; step++) {
    open = open.map((_, i) => {
      const x = i % w;
      const y = Math.floor(i / w);
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return false;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && open[(y + dy) * w + x + dx]) n++;
      }
      return n >= 5 || (n >= 4 && Boolean(open[i]));
    });
  }
  // Nur die größte Fläche behalten.
  const seen = new Set<number>();
  let best: Cell[] = [];
  for (let i = 0; i < open.length; i++) {
    if (!open[i] || seen.has(i)) continue;
    const region = floodFill({ cols: w, rows: h }, { x: i % w, y: Math.floor(i / w) }, (j) =>
      Boolean(open[j]),
    );
    region.forEach((c) => seen.add(c.y * w + c.x));
    if (region.length > best.length) best = region;
  }
  const out = new Array<boolean>(w * h).fill(false);
  best.forEach((c) => (out[c.y * w + c.x] = true));
  return out;
}

function cave(): Stamp {
  const w = 16;
  const h = 14;
  const rng = rngFrom('cave-template');
  const open = caveShape(rng, w, h);
  const b = new Builder(w, h);
  open.forEach((o, i) => o && b.set(i % w, Math.floor(i / w), 'floor.cave'));
  const cells = open.flatMap((o, i) => (o ? [{ x: i % w, y: Math.floor(i / w) }] : []));
  // kleiner Tümpel und Deko auf freien Feldern
  const pool = cells[Math.floor(cells.length / 2)];
  if (pool) b.set(pool.x, pool.y, 'floor.water_shallow');
  b.autoWalls('wall.cave');
  const decor = [
    'nature.mushrooms',
    'nature.rock_small',
    'misc.bones',
    'nature.mushrooms',
    'misc.crystals',
    'misc.puddle',
  ];
  for (const el of decor) {
    const c = pick(rng, cells);
    b.place(el, c.x, c.y);
  }
  return b.build();
}

function clearing(): Stamp {
  const b = new Builder(18, 14);
  b.fill(0, 0, 18, 14, 'floor.grass');
  b.fill(0, 6, 9, 2, 'floor.road');
  const trees: [string, number, number][] = [
    ['nature.tree_oak', 0, 0],
    ['nature.tree_pine', 3, 0],
    ['nature.tree_oak', 7, 0],
    ['nature.tree_pine', 12, 0],
    ['nature.tree_oak', 16, 1],
    ['nature.tree_pine', 16, 5],
    ['nature.tree_oak', 16, 10],
    ['nature.tree_pine', 12, 12],
    ['nature.tree_oak', 6, 12],
    ['nature.tree_pine', 1, 11],
    ['nature.tree_dead', 0, 3],
  ];
  for (const [el, x, y] of trees) b.place(el, x, y);
  b.place('light.campfire', 9, 7);
  b.place('nature.log', 8, 5);
  b.place('nature.log', 8, 9);
  b.place('nature.stump', 11, 7);
  b.place('misc.tent', 12, 4);
  b.place('misc.firewood', 11, 9);
  for (const [x, y] of [
    [5, 3],
    [14, 8],
    [3, 9],
  ] as const) {
    b.place('nature.bush', x, y);
  }
  b.place('nature.flowers', 6, 4);
  b.place('nature.flowers', 13, 10);
  b.place('nature.rock_small', 4, 5);
  b.place('nature.mushrooms', 2, 2);
  return b.build();
}

function bridge(): Stamp {
  const b = new Builder(16, 10);
  b.fill(0, 0, 16, 3, 'floor.grass');
  b.fill(0, 3, 16, 4, 'floor.water_deep');
  b.fill(0, 3, 16, 1, 'floor.water_shallow');
  b.fill(0, 6, 16, 1, 'floor.water_shallow');
  b.fill(0, 7, 16, 3, 'floor.grass');
  b.fill(7, 2, 2, 6, 'floor.bridge');
  b.fill(7, 0, 2, 2, 'floor.road');
  b.fill(7, 8, 2, 2, 'floor.road');
  for (const y of [3, 4, 5, 6]) {
    b.place('wall.low', 6, y);
    b.place('wall.low', 9, y);
  }
  b.place('nature.reeds', 2, 2);
  b.place('nature.reeds', 13, 7);
  b.place('nature.reeds', 4, 7);
  b.place('nature.boulder', 12, 1);
  b.place('nature.rock_small', 3, 8);
  b.place('nature.tree_pine', 0, 0);
  b.place('nature.tree_oak', 13, 8);
  b.place('nature.bush', 10, 1);
  b.place('misc.signpost', 9, 9);
  return b.build();
}

const builders: Record<TemplateId, () => Stamp> = { tavern, dungeon, cave, clearing, bridge };

export function buildTemplate(id: TemplateId): Stamp {
  return builders[id]();
}

// ------------------------------------------------------------------ Zufälliges Verlies

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Room, b: Room, gap: number) =>
  a.x - gap < b.x + b.w && a.x + a.w + gap > b.x && a.y - gap < b.y + b.h && a.y + a.h + gap > b.y;

const center = (r: Room) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });

export function generateDungeon(seed: string, wRaw: number, hRaw: number): Stamp {
  const w = Math.min(DUNGEON_MAX, Math.max(DUNGEON_MIN, Math.round(wRaw)));
  const h = Math.min(DUNGEON_MAX, Math.max(DUNGEON_MIN, Math.round(hRaw)));
  const rng = rngFrom(`dungeon:${seed}:${w}x${h}`);
  const b = new Builder(w, h);

  const rooms: Room[] = [];
  const target = Math.max(3, Math.floor((w * h) / 90));
  for (let attempt = 0; attempt < target * 30 && rooms.length < target; attempt++) {
    const rw = randInt(rng, 4, 8);
    const rh = randInt(rng, 4, 7);
    const room = { x: randInt(rng, 1, w - rw - 2), y: randInt(rng, 1, h - rh - 2), w: rw, h: rh };
    if (!rooms.some((r) => overlaps(r, room, 2))) rooms.push(room);
  }
  rooms.sort((a, b2) => a.x + a.y * 0.5 - (b2.x + b2.y * 0.5));
  const isRoom = new Uint8Array(w * h);
  for (const r of rooms) {
    b.fill(r.x, r.y, r.w, r.h, 'floor.dungeon');
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) isRoom[y * w + x] = 1;
  }

  // Räume nacheinander mit L-förmigen Gängen verbinden → alles erreichbar.
  const corridor = (x: number, y: number) => {
    if (!isRoom[y * w + x]) b.set(x, y, 'floor.flagstone');
  };
  for (let i = 1; i < rooms.length; i++) {
    const a = center(rooms[i - 1] as Room);
    const c = center(rooms[i] as Room);
    const horizontalFirst = rng() > 0.5;
    const corner = horizontalFirst ? { x: c.x, y: a.y } : { x: a.x, y: c.y };
    for (let x = Math.min(a.x, corner.x); x <= Math.max(a.x, corner.x); x++)
      corridor(x, horizontalFirst ? a.y : corner.y);
    for (let y = Math.min(a.y, corner.y); y <= Math.max(a.y, corner.y); y++)
      corridor(horizontalFirst ? corner.x : a.x, y);
    for (let x = Math.min(corner.x, c.x); x <= Math.max(corner.x, c.x); x++) corridor(x, c.y);
    for (let y = Math.min(corner.y, c.y); y <= Math.max(corner.y, c.y); y++) corridor(c.x, y);
  }
  b.autoWalls('wall.stone');

  // Türen an Gangfeldern direkt am Raum, wenn links/rechts bzw. oben/unten Wand ist.
  const solid = (x: number, y: number) => !b.getFloor(x, y);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (b.getFloor(x, y) !== 'floor.flagstone') continue;
      const roomH = isRoom[y * w + x - 1] || isRoom[y * w + x + 1];
      const roomV = isRoom[(y - 1) * w + x] || isRoom[(y + 1) * w + x];
      if (roomH && solid(x, y - 1) && solid(x, y + 1) && rng() < 0.5)
        b.place('door.wood_closed', x, y, 90);
      else if (roomV && solid(x - 1, y) && solid(x + 1, y) && rng() < 0.5)
        b.place('door.wood_closed', x, y, 0);
    }
  }

  // Ausstattung
  const decor = [
    'furniture.barrel',
    'furniture.crate',
    'furniture.chest',
    'misc.bones',
    'light.brazier',
    'misc.debris',
    'furniture.table_square',
    'misc.web',
    'trap.pit',
    'misc.skulls',
  ];
  rooms.forEach((r, i) => {
    const used = new Set<string>();
    const free = () => {
      for (let k = 0; k < 20; k++) {
        const x = randInt(rng, r.x, r.x + r.w - 1);
        const y = randInt(rng, r.y, r.y + r.h - 1);
        if (!used.has(cellKey(x, y))) {
          used.add(cellKey(x, y));
          return { x, y };
        }
      }
      return null;
    };
    const special = i === 0 ? 'stairs.up' : i === rooms.length - 1 ? 'stairs.down' : null;
    if (special) {
      const c = free();
      if (c) b.place(special, c.x, c.y);
    }
    for (let k = randInt(rng, 1, 3); k > 0; k--) {
      const c = free();
      if (c) b.place(pick(rng, decor), c.x, c.y);
    }
  });
  return b.build();
}

// ------------------------------------------------------------------ Einsetzen

/**
 * Setzt einen Stempel mit linker oberer Ecke `at` ein. Mit `replace` werden Objekte,
 * Gelände und GM-Notizen im Zielbereich zuvor entfernt.
 */
export function placeStamp(doc: MapDocument, stamp: Stamp, at: Cell, replace: boolean): OpResult {
  const { cols, rows } = doc.grid;
  if (at.x < 0 || at.y < 0 || at.x + stamp.w > cols || at.y + stamp.h > rows) {
    return { ok: false, reason: 'outside' };
  }
  if (['floor', 'walls', 'decor'].some((l) => layerState(doc, l as 'floor').locked)) {
    return { ok: false, reason: 'locked' };
  }
  const inArea = (x: number, y: number, w = 1, h = 1) =>
    x < at.x + stamp.w && x + w > at.x && y < at.y + stamp.h && y + h > at.y;

  const floor: FloorChange[] = [];
  stamp.floor.forEach((id, i) => {
    const x = at.x + (i % stamp.w);
    const y = at.y + Math.floor(i / stamp.w);
    const index = y * cols + x;
    const before = doc.floor[index] ?? '';
    const after = id || (replace ? '' : before);
    if (after !== before) floor.push([index, before, after]);
  });

  const kept = replace
    ? doc.objects.filter((o) => {
        const s = footprintSize(o);
        return !inArea(o.x, o.y, s.w, s.h);
      })
    : doc.objects;
  const added: PlacedObject[] = stamp.objects.flatMap((o) => {
    const def = getBuiltinElement(o.element);
    if (!def || def.layer === 'floor') return [];
    return [
      {
        id: newId(),
        element: o.element,
        layer: def.layer,
        x: at.x + o.x,
        y: at.y + o.y,
        w: def.w,
        h: def.h,
        rotation: o.rotation,
        flipX: false,
        flipY: false,
      },
    ];
  });

  const terrain: TerrainChange[] = [];
  if (replace) {
    for (const [key, before] of Object.entries(doc.terrain)) {
      const [x, y] = key.split(',').map(Number);
      if (inArea(x ?? -1, y ?? -1)) terrain.push([key, before, null]);
    }
  }
  for (const [key, props] of Object.entries(stamp.terrain)) {
    const [x, y] = key.split(',').map(Number);
    const target = cellKey(at.x + (x ?? 0), at.y + (y ?? 0));
    terrain.push([target, doc.terrain[target] ?? null, props]);
  }

  const patch: DocPatch = { floor, terrain };
  const objects = [...kept, ...added];
  if (objects.length !== doc.objects.length || added.length) {
    patch.whole = { objects: { b: doc.objects, a: objects } };
  }
  if (replace) {
    const notes = doc.notes.filter((n) => !inArea(n.x, n.y));
    if (notes.length !== doc.notes.length) {
      patch.whole = { ...patch.whole, notes: { b: doc.notes, a: notes } };
    }
    // Kantenwände vollständig im Bereich entfernen.
    const inside = (x: number, y: number) =>
      x >= at.x && x <= at.x + stamp.w && y >= at.y && y <= at.y + stamp.h;
    const walls = doc.walls.filter((w) => !(inside(w.x1, w.y1) && inside(w.x2, w.y2)));
    if (walls.length !== doc.walls.length) {
      patch.whole = { ...patch.whole, walls: { b: doc.walls, a: walls } };
    }
  }
  return isEmptyPatch(patch) ? { ok: false, reason: 'nothing' } : { ok: true, patch };
}
