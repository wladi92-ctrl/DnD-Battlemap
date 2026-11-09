/**
 * Kantenwände: Liniensegmente in Feldkoordinaten (ganzzahlig = Rasterlinien).
 * Sie trennen Felder entlang von Kanten – z. B. nachgezeichnete Wände auf importierten Karten.
 * Reine Geometrie; Bewegung (A*) und Sichtlinie nutzen sie in späteren Phasen.
 */
import type { Cell, Point } from './grid';

export type WallKind = 'wall' | 'door' | 'window' | 'secret';
export type DoorState = 'closed' | 'open' | 'locked';

export interface WallLike {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: WallKind;
  state?: DoorState;
}

/** Bewegung blockiert: Wände, Fenster, geschlossene/verschlossene Türen und Geheimtüren. */
export function wallBlocksMovement(w: WallLike): boolean {
  if (w.kind === 'door' || w.kind === 'secret') return w.state !== 'open';
  return true;
}

/** Sicht blockiert: Wände und nicht geöffnete Türen; Fenster lassen Sicht durch. */
export function wallBlocksSight(w: WallLike): boolean {
  if (w.kind === 'window') return false;
  return wallBlocksMovement(w);
}

const EPS = 1e-9;

function orient(a: Point, b: Point, c: Point): number {
  const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return Math.abs(v) < EPS ? 0 : Math.sign(v);
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.min(a.x, b.x) - EPS <= p.x &&
    p.x <= Math.max(a.x, b.x) + EPS &&
    Math.min(a.y, b.y) - EPS <= p.y &&
    p.y <= Math.max(a.y, b.y) + EPS
  );
}

/** Schneiden sich die Strecken p1–p2 und q1–q2 (Berührung an Endpunkten zählt)? */
export function segmentsIntersect(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const o1 = orient(p1, p2, q1);
  const o2 = orient(p1, p2, q2);
  const o3 = orient(q1, q2, p1);
  const o4 = orient(q1, q2, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, p2, q2)) return true;
  if (o3 === 0 && onSegment(q1, q2, p1)) return true;
  if (o4 === 0 && onSegment(q1, q2, p2)) return true;
  return false;
}

/** Abstand eines Punktes zu einer Strecke. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const center = (c: Cell): Point => ({ x: c.x + 0.5, y: c.y + 0.5 });

function crosses(walls: readonly WallLike[], a: Point, b: Point, test: (w: WallLike) => boolean) {
  return walls.some(
    (w) => test(w) && segmentsIntersect(a, b, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }),
  );
}

/**
 * Darf man von Feld `from` in das benachbarte Feld `to` ziehen?
 * Geprüft wird die Strecke zwischen den Feldmitten. Bei diagonalen Schritten blockiert auch
 * eine Wand, die nur die Ecke berührt (kein "Durchquetschen" an Wandecken).
 */
export function movementBlocked(walls: readonly WallLike[], from: Cell, to: Cell): boolean {
  return crosses(walls, center(from), center(to), wallBlocksMovement);
}

/** Sichtlinie zwischen zwei Punkten (in Feldkoordinaten) durch Wände unterbrochen? */
export function sightBlocked(walls: readonly WallLike[], a: Point, b: Point): boolean {
  return crosses(walls, a, b, wallBlocksSight);
}
