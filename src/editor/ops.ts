/**
 * Bearbeitungsoperationen auf dem Kartendokument. Jede Operation ist rein und liefert
 * einen umkehrbaren Patch (oder null, wenn sich nichts ändert).
 */
import { clampGridDimension, type Cell } from '../core/grid';
import { clipCells, floodFill } from '../core/shapes';
import type { ElementInfo } from '../data/elements';
import {
  cellKey,
  layerState,
  OBJECT_LAYERS,
  parseCellKey,
  type CustomElement,
  type LayerId,
  type LayerState,
  type MapDocument,
  type MapNote,
  type PlacedObject,
  type Rotation,
  type TerrainProps,
} from '../storage/mapDocument';
import { containsPoint, coversCell, footprintSize, rotateBy } from './footprint';
import {
  isEmptyPatch,
  replaceField,
  type DocPatch,
  type FloorChange,
  type TerrainChange,
} from './patch';

export type PaintSource =
  { kind: 'element'; element: ElementInfo } | { kind: 'terrain'; props: TerrainProps };

export interface PlacementOptions {
  rotation?: Rotation;
  flipX?: boolean;
  flipY?: boolean;
}

/** Ergebnis einer Operation: Patch oder Grund, warum nichts passiert ist. */
export type OpResult =
  | { ok: true; patch: DocPatch }
  | { ok: false; reason: 'nothing' | 'locked' | 'fillObjects' | 'outside' };

const nothing: OpResult = { ok: false, reason: 'nothing' };
const done = (patch: DocPatch): OpResult => (isEmptyPatch(patch) ? nothing : { ok: true, patch });

export const newId = () => crypto.randomUUID();

/** Ziel-Ebene einer Malquelle (Gelände hat keine Ebene). */
export function sourceLayer(source: PaintSource): LayerId | null {
  return source.kind === 'element' ? source.element.layer : null;
}

function isLocked(doc: MapDocument, layer: LayerId | null): boolean {
  return layer !== null && layerState(doc, layer).locked;
}

function normalizeTerrain(p: TerrainProps): TerrainProps | null {
  const out: TerrainProps = {};
  if (p.difficult) out.difficult = true;
  if (p.blocksSight) out.blocksSight = true;
  if (p.blocksMovement) out.blocksMovement = true;
  if (p.cover) out.cover = p.cover;
  if (p.damage) out.damage = p.damage;
  if (p.elevation) out.elevation = p.elevation;
  return Object.keys(out).length ? out : null;
}

const sameTerrain = (a: TerrainProps | null | undefined, b: TerrainProps | null) =>
  JSON.stringify(a ?? null) === JSON.stringify(b);

// ------------------------------------------------------------------ Malen & Radieren

export function paintCells(
  doc: MapDocument,
  rawCells: readonly Cell[],
  source: PaintSource,
  placement: PlacementOptions = {},
): OpResult {
  const cells = clipCells(rawCells, doc.grid);
  if (!cells.length) return nothing;
  const layer = sourceLayer(source);
  if (isLocked(doc, layer)) return { ok: false, reason: 'locked' };

  if (source.kind === 'terrain') {
    const value = normalizeTerrain(source.props);
    const changes: TerrainChange[] = [];
    for (const c of cells) {
      const key = cellKey(c.x, c.y);
      const before = doc.terrain[key] ?? null;
      if (!sameTerrain(before, value)) changes.push([key, before, value]);
    }
    return done({ terrain: changes });
  }

  const el = source.element;
  if (el.layer === 'floor') {
    const changes: FloorChange[] = [];
    for (const c of cells) {
      const i = c.y * doc.grid.cols + c.x;
      const before = doc.floor[i] ?? '';
      if (before !== el.id) changes.push([i, before, el.id]);
    }
    return done({ floor: changes });
  }

  // Objekt-Elemente
  const objLayer = el.layer;
  const rotation = placement.rotation ?? 0;
  const proto = { w: el.w, h: el.h, rotation };
  const size = footprintSize(proto);
  let objects = doc.objects.slice();
  let changed = false;
  for (const c of cells) {
    // Kein zweites gleiches Element über einem bereits belegten Feld.
    if (objects.some((o) => o.layer === objLayer && o.element === el.id && coversCell(o, c)))
      continue;
    if (objLayer === 'walls') {
      // Auf der Wand-Ebene ersetzt Neues kleine Objekte an dieser Stelle (z. B. Tür statt Wand).
      const before = objects.length;
      objects = objects.filter(
        (o) => !(o.layer === 'walls' && o.w * o.h === 1 && coversCell(o, c)),
      );
      if (objects.length !== before) changed = true;
    }
    objects.push({
      id: newId(),
      element: el.id,
      layer: objLayer,
      x: Math.min(c.x, doc.grid.cols - size.w),
      y: Math.min(c.y, doc.grid.rows - size.h),
      w: el.w,
      h: el.h,
      rotation,
      flipX: placement.flipX ?? false,
      flipY: placement.flipY ?? false,
    });
    changed = true;
  }
  return changed ? done(replaceField(doc, 'objects', objects)) : nothing;
}

export type EraseTarget = LayerId | 'terrain';

export function eraseCells(
  doc: MapDocument,
  rawCells: readonly Cell[],
  target: EraseTarget,
): OpResult {
  const cells = clipCells(rawCells, doc.grid);
  if (!cells.length) return nothing;
  if (target !== 'terrain' && isLocked(doc, target)) return { ok: false, reason: 'locked' };

  switch (target) {
    case 'terrain': {
      const changes: TerrainChange[] = [];
      for (const c of cells) {
        const key = cellKey(c.x, c.y);
        const before = doc.terrain[key];
        if (before) changes.push([key, before, null]);
      }
      return done({ terrain: changes });
    }
    case 'floor': {
      const changes: FloorChange[] = [];
      for (const c of cells) {
        const i = c.y * doc.grid.cols + c.x;
        const before = doc.floor[i] ?? '';
        if (before) changes.push([i, before, '']);
      }
      return done({ floor: changes });
    }
    case 'gm': {
      const notes = doc.notes.filter((n) => !cells.some((c) => c.x === n.x && c.y === n.y));
      return notes.length === doc.notes.length ? nothing : done(replaceField(doc, 'notes', notes));
    }
    default: {
      const objects = doc.objects.filter(
        (o) => !(o.layer === target && cells.some((c) => coversCell(o, c))),
      );
      return objects.length === doc.objects.length
        ? nothing
        : done(replaceField(doc, 'objects', objects));
    }
  }
}

/** Füllt zusammenhängende Felder mit gleichem Boden (Boden-Elemente oder Gelände). */
export function fillArea(doc: MapDocument, start: Cell, source: PaintSource): OpResult {
  if (source.kind === 'element' && source.element.layer !== 'floor') {
    return { ok: false, reason: 'fillObjects' };
  }
  const startId = doc.floor[start.y * doc.grid.cols + start.x];
  if (startId === undefined) return { ok: false, reason: 'outside' };
  const region = floodFill(doc.grid, start, (i) => doc.floor[i] === startId);
  return paintCells(doc, region, source);
}

// ------------------------------------------------------------------ Auswahl & Objekte

/** Objekte unter einem Punkt (in Feldern), oberstes zuerst; ignoriert ausgeblendete/gesperrte Ebenen. */
export function objectsAt(doc: MapDocument, px: number, py: number): PlacedObject[] {
  const order = [...OBJECT_LAYERS].reverse();
  const out: PlacedObject[] = [];
  for (const layer of order) {
    const st = layerState(doc, layer);
    if (!st.visible || st.locked) continue;
    const onLayer = doc.objects.filter((o) => o.layer === layer && containsPoint(o, px, py));
    out.push(...onLayer.reverse());
  }
  return out;
}

/** Objekte, deren Platzbedarf ein Rechteck (in Feldern) schneidet. */
export function objectsInRect(
  doc: MapDocument,
  r: { x: number; y: number; w: number; h: number },
): PlacedObject[] {
  return doc.objects.filter((o) => {
    const st = layerState(doc, o.layer);
    if (!st.visible || st.locked) return false;
    const s = footprintSize(o);
    return o.x < r.x + r.w && o.x + s.w > r.x && o.y < r.y + r.h && o.y + s.h > r.y;
  });
}

function updateObjects(
  doc: MapDocument,
  ids: ReadonlySet<string>,
  fn: (o: PlacedObject) => PlacedObject,
): OpResult {
  if (!ids.size) return nothing;
  let changed = false;
  const objects = doc.objects.map((o) => {
    if (!ids.has(o.id) || layerState(doc, o.layer).locked) return o;
    const next = fn(o);
    if (next !== o) changed = true;
    return next;
  });
  return changed ? done(replaceField(doc, 'objects', objects)) : nothing;
}

function clampPos(doc: MapDocument, o: PlacedObject, x: number, y: number) {
  const s = footprintSize(o);
  return {
    x: Math.min(doc.grid.cols - s.w, Math.max(0, x)),
    y: Math.min(doc.grid.rows - s.h, Math.max(0, y)),
  };
}

export function moveObjects(
  doc: MapDocument,
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
): OpResult {
  if (dx === 0 && dy === 0) return nothing;
  return updateObjects(doc, ids, (o) => {
    const p = clampPos(doc, o, o.x + dx, o.y + dy);
    return p.x === o.x && p.y === o.y ? o : { ...o, ...p };
  });
}

/** Dreht jedes Objekt um 90°-Schritte um seine eigene Mitte. */
export function rotateObjects(
  doc: MapDocument,
  ids: ReadonlySet<string>,
  steps: number,
  snap: boolean,
): OpResult {
  return updateObjects(doc, ids, (o) => {
    const before = footprintSize(o);
    const rotation = rotateBy(o.rotation, steps);
    const after = footprintSize({ ...o, rotation });
    let x = o.x + (before.w - after.w) / 2;
    let y = o.y + (before.h - after.h) / 2;
    if (snap) {
      x = Math.floor(x);
      y = Math.floor(y);
    }
    return { ...o, rotation, ...clampPos(doc, { ...o, rotation }, x, y) };
  });
}

export function flipObjects(doc: MapDocument, ids: ReadonlySet<string>, axis: 'x' | 'y'): OpResult {
  return updateObjects(doc, ids, (o) =>
    axis === 'x' ? { ...o, flipX: !o.flipX } : { ...o, flipY: !o.flipY },
  );
}

export function deleteObjects(doc: MapDocument, ids: ReadonlySet<string>): OpResult {
  const objects = doc.objects.filter((o) => !ids.has(o.id) || layerState(doc, o.layer).locked);
  return objects.length === doc.objects.length
    ? nothing
    : done(replaceField(doc, 'objects', objects));
}

/** Fügt Kopien ein, verschoben um (dx, dy); liefert die neuen IDs. */
export function pasteObjects(
  doc: MapDocument,
  templates: readonly PlacedObject[],
  dx: number,
  dy: number,
): { result: OpResult; ids: string[] } {
  const ids: string[] = [];
  const added: PlacedObject[] = [];
  for (const t of templates) {
    if (layerState(doc, t.layer).locked) continue;
    const id = newId();
    ids.push(id);
    const copy = { ...t, id };
    added.push({ ...copy, ...clampPos(doc, copy, t.x + dx, t.y + dy) });
  }
  if (!added.length)
    return { result: { ok: false, reason: templates.length ? 'locked' : 'nothing' }, ids };
  return { result: done(replaceField(doc, 'objects', [...doc.objects, ...added])), ids };
}

export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY';

/** Richtet mehrere Objekte aneinander aus (Ausrichtungshilfe). */
export function alignObjects(
  doc: MapDocument,
  ids: ReadonlySet<string>,
  mode: AlignMode,
): OpResult {
  const sel = doc.objects.filter((o) => ids.has(o.id));
  if (sel.length < 2) return nothing;
  const boxes = sel.map((o) => ({ o, ...footprintSize(o) }));
  const minX = Math.min(...boxes.map((b) => b.o.x));
  const maxX = Math.max(...boxes.map((b) => b.o.x + b.w));
  const minY = Math.min(...boxes.map((b) => b.o.y));
  const maxY = Math.max(...boxes.map((b) => b.o.y + b.h));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return updateObjects(doc, ids, (o) => {
    const s = footprintSize(o);
    const target: Record<AlignMode, { x: number; y: number }> = {
      left: { x: minX, y: o.y },
      right: { x: maxX - s.w, y: o.y },
      top: { x: o.x, y: minY },
      bottom: { x: o.x, y: maxY - s.h },
      centerX: { x: Math.round((cx - s.w / 2) * 2) / 2, y: o.y },
      centerY: { x: o.x, y: Math.round((cy - s.h / 2) * 2) / 2 },
    };
    const t = target[mode];
    return t.x === o.x && t.y === o.y ? o : { ...o, x: t.x, y: t.y };
  });
}

// ------------------------------------------------------------------ Ebenen, Notizen, Karte

export function setLayerState(
  doc: MapDocument,
  id: LayerId,
  changes: Partial<Omit<LayerState, 'id'>>,
): OpResult {
  const layers = doc.layers.map((l) => (l.id === id ? { ...l, ...changes } : l));
  return done(replaceField(doc, 'layers', layers));
}

export function upsertNote(
  doc: MapDocument,
  note: Omit<MapNote, 'id'> & { id?: string },
): OpResult {
  if (isLocked(doc, 'gm')) return { ok: false, reason: 'locked' };
  const text = note.text.trim();
  const existing = doc.notes.find((n) =>
    note.id ? n.id === note.id : n.x === note.x && n.y === note.y,
  );
  if (!text) {
    return existing
      ? done(
          replaceField(
            doc,
            'notes',
            doc.notes.filter((n) => n !== existing),
          ),
        )
      : nothing;
  }
  const next: MapNote = { id: existing?.id ?? newId(), x: note.x, y: note.y, text };
  const notes = existing ? doc.notes.map((n) => (n === existing ? next : n)) : [...doc.notes, next];
  return done(replaceField(doc, 'notes', notes));
}

export function addCustomElement(doc: MapDocument, el: CustomElement): OpResult {
  return done(replaceField(doc, 'customElements', [...doc.customElements, el]));
}

/** Ändert die Kartengröße; Inhalte außerhalb werden entfernt (rückgängig machbar). */
export function resizeGrid(doc: MapDocument, colsRaw: number, rowsRaw: number): OpResult {
  const cols = clampGridDimension(colsRaw);
  const rows = clampGridDimension(rowsRaw);
  if (cols === doc.grid.cols && rows === doc.grid.rows) return nothing;
  const floor = new Array<string>(cols * rows).fill('');
  for (let y = 0; y < Math.min(rows, doc.grid.rows); y++) {
    for (let x = 0; x < Math.min(cols, doc.grid.cols); x++) {
      floor[y * cols + x] = doc.floor[y * doc.grid.cols + x] ?? '';
    }
  }
  const objects = doc.objects.filter((o) => {
    const s = footprintSize(o);
    return o.x + s.w <= cols && o.y + s.h <= rows;
  });
  const terrain = Object.fromEntries(
    Object.entries(doc.terrain).filter(([k]) => {
      const c = parseCellKey(k);
      return c !== null && c.x < cols && c.y < rows;
    }),
  );
  const notes = doc.notes.filter((n) => n.x < cols && n.y < rows);
  const walls = doc.walls.filter(
    (w) => Math.max(w.x1, w.x2) <= cols && Math.max(w.y1, w.y2) <= rows,
  );
  return done({
    whole: {
      grid: { b: doc.grid, a: { ...doc.grid, cols, rows } },
      floor: { b: doc.floor, a: floor },
      objects: { b: doc.objects, a: objects },
      terrain: { b: doc.terrain, a: terrain },
      notes: { b: doc.notes, a: notes },
      walls: { b: doc.walls, a: walls },
    },
  });
}
