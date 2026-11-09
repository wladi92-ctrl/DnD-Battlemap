/**
 * Operationen für Kantenwände, gemischte Auswahlen (Objekte + Wände) und das Hintergrundbild.
 */
import type { Point } from '../core/grid';
import { distanceToSegment, type DoorState, type WallKind } from '../core/walls';
import {
  imageGridSize,
  layerState,
  type BackgroundImage,
  type EdgeWall,
  type MapDocument,
} from '../storage/mapDocument';
import { deleteObjects, moveObjects, newId, resizeGrid, type OpResult } from './ops';
import { isEmptyPatch, mergePatches, replaceField, type DocPatch } from './patch';
import { deleteTokens, shiftTokens } from './tokens';

const nothing: OpResult = { ok: false, reason: 'nothing' };
const done = (patch: DocPatch): OpResult => (isEmptyPatch(patch) ? nothing : { ok: true, patch });
const wallsLocked = (doc: MapDocument) => layerState(doc, 'walls').locked;

export type NewWall = Omit<EdgeWall, 'id'>;

/** Türen/Geheimtüren haben immer einen Zustand, andere Arten keinen. */
export function normalizeWall<T extends NewWall>(w: T): T {
  const door = w.kind === 'door' || w.kind === 'secret';
  const { state, ...rest } = w;
  return (door ? { ...rest, state: state ?? 'closed' } : rest) as T;
}

/** Fügt Wandsegmente hinzu (Länge 0 und Duplikate werden übersprungen). */
export function addWalls(doc: MapDocument, segments: readonly NewWall[]): OpResult {
  if (wallsLocked(doc)) return { ok: false, reason: 'locked' };
  const { cols, rows } = doc.grid;
  const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));
  const key = (w: NewWall) => {
    const a = `${w.x1},${w.y1}`;
    const b = `${w.x2},${w.y2}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  };
  const existing = new Set(doc.walls.map(key));
  const added: EdgeWall[] = [];
  for (const s of segments) {
    const seg = normalizeWall({
      ...s,
      x1: clamp(s.x1, cols),
      y1: clamp(s.y1, rows),
      x2: clamp(s.x2, cols),
      y2: clamp(s.y2, rows),
    });
    if (seg.x1 === seg.x2 && seg.y1 === seg.y2) continue;
    if (existing.has(key(seg))) continue;
    existing.add(key(seg));
    added.push({ id: newId(), ...seg });
  }
  return added.length ? done(replaceField(doc, 'walls', [...doc.walls, ...added])) : nothing;
}

/** Wände in Reichweite eines Punktes (in Feldern), nächste zuerst. */
export function wallsNear(doc: MapDocument, p: Point, tolerance: number): EdgeWall[] {
  const st = layerState(doc, 'walls');
  if (!st.visible || st.locked) return [];
  return doc.walls
    .map((w) => ({ w, d: distanceToSegment(p, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }) }))
    .filter((e) => e.d <= tolerance)
    .sort((a, b) => a.d - b.d)
    .map((e) => e.w);
}

/** Wände, die vollständig in einem Rechteck liegen. */
export function wallsInRect(doc: MapDocument, r: { x: number; y: number; w: number; h: number }) {
  const st = layerState(doc, 'walls');
  if (!st.visible || st.locked) return [];
  const inside = (x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  return doc.walls.filter((w) => inside(w.x1, w.y1) && inside(w.x2, w.y2));
}

export function updateWalls(
  doc: MapDocument,
  ids: ReadonlySet<string>,
  changes: { kind?: WallKind; state?: DoorState },
): OpResult {
  if (wallsLocked(doc)) return { ok: false, reason: 'locked' };
  let changed = false;
  const walls = doc.walls.map((w) => {
    if (!ids.has(w.id)) return w;
    const next = normalizeWall({ ...w, ...changes });
    if (JSON.stringify(next) === JSON.stringify(w)) return w;
    changed = true;
    return next;
  });
  return changed ? done(replaceField(doc, 'walls', walls)) : nothing;
}

export function deleteWalls(doc: MapDocument, ids: ReadonlySet<string>): OpResult {
  if (wallsLocked(doc)) return { ok: false, reason: 'locked' };
  const walls = doc.walls.filter((w) => !ids.has(w.id));
  return walls.length === doc.walls.length ? nothing : done(replaceField(doc, 'walls', walls));
}

export function moveWalls(
  doc: MapDocument,
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
): OpResult {
  if (wallsLocked(doc) || (dx === 0 && dy === 0)) return nothing;
  const sel = doc.walls.filter((w) => ids.has(w.id));
  if (!sel.length) return nothing;
  // Gemeinsam begrenzen, damit die Form der Auswahl erhalten bleibt.
  const xs = sel.flatMap((w) => [w.x1, w.x2]);
  const ys = sel.flatMap((w) => [w.y1, w.y2]);
  const cdx = Math.min(doc.grid.cols - Math.max(...xs), Math.max(-Math.min(...xs), dx));
  const cdy = Math.min(doc.grid.rows - Math.max(...ys), Math.max(-Math.min(...ys), dy));
  if (cdx === 0 && cdy === 0) return nothing;
  const walls = doc.walls.map((w) =>
    ids.has(w.id) ? { ...w, x1: w.x1 + cdx, y1: w.y1 + cdy, x2: w.x2 + cdx, y2: w.y2 + cdy } : w,
  );
  return done(replaceField(doc, 'walls', walls));
}

function combine(...results: OpResult[]): OpResult {
  const ok = results.filter((r): r is { ok: true; patch: DocPatch } => r.ok);
  if (ok.length) return done(ok.map((r) => r.patch).reduce(mergePatches));
  return results.find((r) => !r.ok && r.reason === 'locked') ?? nothing;
}

/** Verschiebt ausgewählte Objekte, Wände und Tokens gemeinsam. */
export function moveItems(
  doc: MapDocument,
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
): OpResult {
  return combine(
    moveObjects(doc, ids, dx, dy),
    moveWalls(doc, ids, dx, dy),
    shiftTokens(doc, ids, dx, dy),
  );
}

export function deleteItems(doc: MapDocument, ids: ReadonlySet<string>): OpResult {
  const tokens = doc.tokens.some((t) => ids.has(t.id)) ? deleteTokens(doc, ids) : nothing;
  return combine(deleteObjects(doc, ids), deleteWalls(doc, ids), tokens);
}

// ------------------------------------------------------------------ Hintergrundbild

/**
 * Setzt (oder entfernt) das Hintergrundbild. Mit `fitGrid` wird die Rastergröße an den
 * kalibrierten Bildausschnitt angepasst – beides ist ein einziger Undo-Schritt.
 */
export function setBackgroundImage(
  doc: MapDocument,
  image: BackgroundImage | undefined,
  fitGrid: boolean,
): OpResult {
  const { image: _old, ...rest } = doc.background;
  const background = image ? { ...rest, image } : rest;
  let patch = replaceField(doc, 'background', background);
  if (image && fitGrid) {
    const size = imageGridSize(image);
    const r = resizeGrid(doc, size.cols, size.rows);
    if (r.ok) patch = mergePatches(r.patch, patch);
  }
  return done(patch);
}

export function updateBackgroundImage(
  doc: MapDocument,
  changes: Partial<BackgroundImage>,
): OpResult {
  const image = doc.background.image;
  if (!image) return nothing;
  const next = { ...image, ...changes };
  if (JSON.stringify(next) === JSON.stringify(image)) return nothing;
  return done(replaceField(doc, 'background', { ...doc.background, image: next }));
}
