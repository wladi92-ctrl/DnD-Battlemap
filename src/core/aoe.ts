/**
 * Flächeneffekte (Area of Effect) nach D&D 5e auf dem Quadratraster.
 *
 * Geometrie in Feldkoordinaten (1 Feld = feetPerCell ft). Die Formen sind echte geometrische
 * Figuren (Schablonen-Methode des Spielleiterhandbuchs); ein Feld gilt als betroffen nach der
 * gewählten Flächenregel (Strategie):
 *  - 'half'   (Standard): der Bereich deckt mindestens die Hälfte des Feldes ab
 *                         (gemessen mit 8×8 Stichproben je Feld),
 *  - 'center':            die Feldmitte liegt im Bereich.
 *
 * Wände: 'line' = Wirkungslinie vom Ursprung (Kantenwände/feste Hindernisse blockieren),
 * 'spread' = wie 'line', zusätzlich breitet sich der Effekt um Ecken aus (Weglänge um
 * Hindernisse herum ≤ Größe, z. B. Feuerball), 'ignore' = Wände werden ignoriert.
 */
import type { Cell, Point } from './grid';
import { segmentsIntersect, wallBlocksMovement, type WallLike } from './walls';

export type AoeShape =
  'sphere' | 'cylinder' | 'cone' | 'cube' | 'line' | 'emanation' | 'square' | 'free';
export const AOE_SHAPES: readonly AoeShape[] = [
  'sphere',
  'cylinder',
  'cone',
  'cube',
  'line',
  'emanation',
  'square',
  'free',
];
/** Formen mit Richtung (Ursprung + Winkel). */
export const DIRECTIONAL: readonly AoeShape[] = ['cone', 'cube', 'line'];

export type CoverageRule = 'half' | 'center';
export const COVERAGE_RULES: readonly CoverageRule[] = ['half', 'center'];
export type WallMode = 'line' | 'spread' | 'ignore';
export const WALL_MODES: readonly WallMode[] = ['line', 'spread', 'ignore'];

/** Halber Öffnungswinkel eines 5e-Kegels: Breite = Abstand vom Ursprung → atan(1/2). */
export const CONE_HALF_ANGLE = Math.atan(0.5);

export interface AoeSpec {
  shape: AoeShape;
  /** Größe in ft: Radius (Kugel/Zylinder), Länge (Kegel/Linie), Kante (Würfel/Quadrat), Abstand (Aura). */
  size: number;
  /** Breite der Linie in ft (Standard 5). */
  width?: number;
}

export interface Footprint {
  x: number;
  y: number;
  /** Kantenlänge in Feldern. */
  size: number;
}

export interface AoePlacement {
  /** Ursprung in Feldkoordinaten (ganzzahlig = Rasterkreuzung, .5 = Feldmitte). */
  origin: Point;
  /** Richtung in Grad, 0 = rechts (Osten), 90 = unten (Süden). */
  angle: number;
  /** Aura um eine Kreatur: deren Platzbedarf (Ursprung wird dann ignoriert). */
  around?: Footprint;
  /** Freie Fläche: Felder. */
  cells?: readonly Cell[];
}

export interface AoeEnvironment {
  cols: number;
  rows: number;
  feetPerCell: number;
  walls: readonly WallLike[];
  /** Feld ist ein festes Hindernis (blockiert Bewegung und Sicht, z. B. Mauerwerk). */
  solid: (index: number) => boolean;
}

export interface AoeOptions {
  rule: CoverageRule;
  wallMode: WallMode;
}

const SAMPLES = 8;
const EPS = 1e-9;

/** Punkt-in-Form-Test in Feldkoordinaten (ohne Wände). */
export function shapeContains(spec: AoeSpec, pl: AoePlacement, fpc: number, p: Point): boolean {
  const size = spec.size / fpc;
  const dx = p.x - pl.origin.x;
  const dy = p.y - pl.origin.y;
  const rad = (pl.angle * Math.PI) / 180;
  const along = dx * Math.cos(rad) + dy * Math.sin(rad);
  const across = -dx * Math.sin(rad) + dy * Math.cos(rad);
  switch (spec.shape) {
    case 'sphere':
    case 'cylinder':
      return dx * dx + dy * dy <= size * size + EPS;
    case 'cone': {
      if (along <= EPS || dx * dx + dy * dy > size * size + EPS) return false;
      return Math.abs(across) <= along * Math.tan(CONE_HALF_ANGLE) + EPS;
    }
    case 'cube':
      // Ursprung liegt auf der Mitte einer Würfelseite; der Würfel erstreckt sich in Richtung.
      return along >= -EPS && along <= size + EPS && Math.abs(across) <= size / 2 + EPS;
    case 'line': {
      const half = (spec.width ?? 5) / fpc / 2;
      return along >= -EPS && along <= size + EPS && Math.abs(across) <= half + EPS;
    }
    case 'emanation': {
      const f = pl.around ?? { x: pl.origin.x, y: pl.origin.y, size: 0 };
      const gx = Math.max(f.x - p.x, 0, p.x - (f.x + f.size));
      const gy = Math.max(f.y - p.y, 0, p.y - (f.y + f.size));
      return gx * gx + gy * gy <= size * size + EPS;
    }
    case 'square': {
      // Ursprung = linke obere Ecke, achsenparallel.
      return dx >= -EPS && dy >= -EPS && dx <= size + EPS && dy <= size + EPS;
    }
    case 'free':
      return Boolean(
        pl.cells?.some((c) => p.x >= c.x && p.x < c.x + 1 && p.y >= c.y && p.y < c.y + 1),
      );
  }
}

/** Umschließendes Rechteck (Felder) der Form. */
function bounds(spec: AoeSpec, pl: AoePlacement, fpc: number, cols: number, rows: number) {
  const r = Math.max(spec.size, spec.width ?? 0) / fpc + 1;
  let x0: number;
  let y0: number;
  let x1: number;
  let y1: number;
  if (spec.shape === 'free') {
    const cs = pl.cells ?? [];
    x0 = Math.min(...cs.map((c) => c.x), cols);
    y0 = Math.min(...cs.map((c) => c.y), rows);
    x1 = Math.max(...cs.map((c) => c.x + 1), 0);
    y1 = Math.max(...cs.map((c) => c.y + 1), 0);
  } else if (spec.shape === 'emanation' && pl.around) {
    const f = pl.around;
    x0 = f.x - r;
    y0 = f.y - r;
    x1 = f.x + f.size + r;
    y1 = f.y + f.size + r;
  } else {
    x0 = pl.origin.x - r;
    y0 = pl.origin.y - r;
    x1 = pl.origin.x + r;
    y1 = pl.origin.y + r;
  }
  return {
    x0: Math.max(0, Math.floor(x0)),
    y0: Math.max(0, Math.floor(y0)),
    x1: Math.min(cols - 1, Math.ceil(x1)),
    y1: Math.min(rows - 1, Math.ceil(y1)),
  };
}

/** Deckungsgrad eines Feldes (0…1) bzw. 0/1 nach Feldmitte. */
export function coverage(
  spec: AoeSpec,
  pl: AoePlacement,
  fpc: number,
  c: Cell,
  rule: CoverageRule,
): number {
  if (spec.shape === 'free') {
    return pl.cells?.some((q) => q.x === c.x && q.y === c.y) ? 1 : 0;
  }
  if (rule === 'center')
    return shapeContains(spec, pl, fpc, { x: c.x + 0.5, y: c.y + 0.5 }) ? 1 : 0;
  let hits = 0;
  for (let i = 0; i < SAMPLES; i++) {
    for (let j = 0; j < SAMPLES; j++) {
      const p = { x: c.x + (i + 0.5) / SAMPLES, y: c.y + (j + 0.5) / SAMPLES };
      if (shapeContains(spec, pl, fpc, p)) hits++;
    }
  }
  return hits / (SAMPLES * SAMPLES);
}

/** Ursprung, von dem aus die Wirkungslinie gezogen wird (Aura: Mitte des Trägers). */
function effectOrigin(spec: AoeSpec, pl: AoePlacement): Point {
  if (spec.shape === 'emanation' && pl.around) {
    return { x: pl.around.x + pl.around.size / 2, y: pl.around.y + pl.around.size / 2 };
  }
  if (DIRECTIONAL.includes(spec.shape)) {
    // Minimal in Wirkrichtung versetzt, damit eine Wand direkt am Ursprung nicht alles sperrt.
    const rad = (pl.angle * Math.PI) / 180;
    return { x: pl.origin.x + Math.cos(rad) * 0.01, y: pl.origin.y + Math.sin(rad) * 0.01 };
  }
  return pl.origin;
}

/** Hilfsstruktur für Sicht-/Wirkungslinien gegen Kantenwände und feste Felder. */
export class LineOfEffect {
  private readonly walls: { a: Point; b: Point }[];
  constructor(private readonly env: AoeEnvironment) {
    this.walls = env.walls
      .filter(wallBlocksMovement)
      .map((w) => ({ a: { x: w.x1, y: w.y1 }, b: { x: w.x2, y: w.y2 } }));
  }

  /** Ist die Strecke a → b frei (keine blockierende Wand, kein festes Feld dazwischen)? */
  clear(a: Point, b: Point): boolean {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    for (const w of this.walls) {
      if (Math.max(w.a.x, w.b.x) < minX - EPS || Math.min(w.a.x, w.b.x) > maxX + EPS) continue;
      if (Math.max(w.a.y, w.b.y) < minY - EPS || Math.min(w.a.y, w.b.y) > maxY + EPS) continue;
      if (segmentsIntersect(a, b, w.a, w.b)) return false;
    }
    // Feste Felder auf dem Weg (Start- und Zielfeld ausgenommen).
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.ceil(len / 0.2);
    const startCell = `${Math.floor(a.x)},${Math.floor(a.y)}`;
    const endCell = `${Math.floor(b.x)},${Math.floor(b.y)}`;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = Math.floor(a.x + (b.x - a.x) * t);
      const y = Math.floor(a.y + (b.y - a.y) * t);
      const key = `${x},${y}`;
      if (key === startCell || key === endCell) continue;
      if (x < 0 || y < 0 || x >= this.env.cols || y >= this.env.rows) continue;
      if (this.env.solid(y * this.env.cols + x)) return false;
    }
    return true;
  }
}

/** Prüfpunkte eines Feldes für die Wirkungslinie: Mitte und vier innere Punkte. */
const PROBES: readonly [number, number][] = [
  [0.5, 0.5],
  [0.2, 0.2],
  [0.8, 0.2],
  [0.2, 0.8],
  [0.8, 0.8],
];

/**
 * Weglänge (Felder) vom Ursprung zu jeder Feldmitte um Hindernisse herum – für Effekte, die
 * sich um Ecken ausbreiten. Any-Angle-Suche (Theta*): ein Feld übernimmt den Vorgänger seines
 * Nachbarn, wenn die direkte Linie frei ist; so entstehen gerade Wege um Wandecken statt
 * Treppenstufen im Raster.
 */
function spreadDistances(
  env: AoeEnvironment,
  los: LineOfEffect,
  origin: Point,
  limit: number,
): Map<number, number> {
  const { cols, rows } = env;
  const dist = new Map<number, number>();
  const parent = new Map<number, Point>();
  const queue: [number, number][] = [];
  const ox = Math.floor(origin.x);
  const oy = Math.floor(origin.y);
  // Startfelder: Felder um den Ursprung, die direkt erreichbar sind.
  for (let y = oy - 1; y <= oy + 1; y++) {
    for (let x = ox - 1; x <= ox + 1; x++) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const i = y * cols + x;
      if (env.solid(i)) continue;
      const c = { x: x + 0.5, y: y + 0.5 };
      if (!los.clear(origin, c)) continue;
      const d = Math.hypot(c.x - origin.x, c.y - origin.y);
      if (d <= limit && d < (dist.get(i) ?? Infinity)) {
        dist.set(i, d);
        parent.set(i, origin);
        queue.push([d, i]);
      }
    }
  }
  while (queue.length) {
    queue.sort((a, b) => b[0] - a[0]);
    const [d, i] = queue.pop() as [number, number];
    if (d > (dist.get(i) ?? Infinity) + EPS) continue;
    const x = i % cols;
    const y = (i - x) / cols;
    const here = { x: x + 0.5, y: y + 0.5 };
    const from = parent.get(i) ?? origin;
    const fromDist =
      from === origin ? 0 : (dist.get(Math.floor(from.y) * cols + Math.floor(from.x)) ?? d);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (env.solid(ni)) continue;
        const next = { x: nx + 0.5, y: ny + 0.5 };
        let nd: number;
        let np: Point;
        if (los.clear(from, next)) {
          nd = fromDist + Math.hypot(next.x - from.x, next.y - from.y);
          np = from;
        } else if (los.clear(here, next)) {
          nd = d + Math.hypot(dx, dy);
          np = here;
        } else continue;
        if (nd > limit + EPS || nd >= (dist.get(ni) ?? Infinity) - EPS) continue;
        dist.set(ni, nd);
        parent.set(ni, np);
        queue.push([nd, ni]);
      }
    }
  }
  return dist;
}

/** Betroffene Felder als Indizes (y·cols + x). */
export function aoeCells(
  spec: AoeSpec,
  pl: AoePlacement,
  env: AoeEnvironment,
  opt: AoeOptions,
): Set<number> {
  const { cols, rows, feetPerCell: fpc } = env;
  const out = new Set<number>();
  if (spec.shape !== 'free' && spec.size <= 0) return out;
  const b = bounds(spec, pl, fpc, cols, rows);
  const useWalls = opt.wallMode !== 'ignore' && spec.shape !== 'free' && spec.shape !== 'square';
  const los = useWalls ? new LineOfEffect(env) : null;
  const origin = effectOrigin(spec, pl);
  const spread =
    los && opt.wallMode === 'spread'
      ? spreadDistances(
          env,
          los,
          origin,
          spec.size / fpc + (spec.shape === 'emanation' && pl.around ? pl.around.size / 2 : 0),
        )
      : null;
  for (let y = b.y0; y <= b.y1; y++) {
    for (let x = b.x0; x <= b.x1; x++) {
      const cell = { x, y };
      const cov = coverage(spec, pl, fpc, cell, opt.rule);
      if (opt.rule === 'half' ? cov < 0.5 - EPS : cov <= 0) continue;
      const i = y * cols + x;
      if (los) {
        if (env.solid(i)) continue;
        const visible = PROBES.some(([px, py]) => los.clear(origin, { x: x + px, y: y + py }));
        if (!visible && !(spread && spread.has(i))) continue;
      }
      out.add(i);
    }
  }
  return out;
}

/** Felder eines Platzbedarfs (Winzig belegt ein Feld). */
export function footprintCells(f: Footprint, cols: number, rows: number): number[] {
  const n = Math.max(1, Math.round(f.size));
  const out: number[] = [];
  const fx = Math.floor(f.x);
  const fy = Math.floor(f.y);
  for (let y = fy; y < fy + n; y++) {
    for (let x = fx; x < fx + n; x++)
      if (x >= 0 && y >= 0 && x < cols && y < rows) out.push(y * cols + x);
  }
  return out;
}

/** Ist eine Kreatur betroffen? Ja, sobald mindestens eines ihrer Felder im Bereich liegt. */
export function footprintAffected(
  cells: ReadonlySet<number>,
  f: Footprint,
  cols: number,
  rows: number,
): boolean {
  return footprintCells(f, cols, rows).some((i) => cells.has(i));
}

/** Winkel auf Schritte runden (z. B. 15° oder 45°); step ≤ 0 = frei. */
export function snapAngle(angle: number, step: number): number {
  const a = ((angle % 360) + 360) % 360;
  if (step <= 0) return Math.round(a);
  return (Math.round(a / step) * step) % 360;
}

/**
 * Ursprung einrasten: 'vertex' = Rasterkreuzung, 'edge' = Kantenmitte, 'center' = Feldmitte,
 * 'half' = halbe Felder (alle drei).
 */
export type OriginSnap = 'vertex' | 'edge' | 'center' | 'half';
export const ORIGIN_SNAPS: readonly OriginSnap[] = ['vertex', 'edge', 'center', 'half'];
export function snapOrigin(p: Point, mode: OriginSnap, angle?: number): Point {
  if (mode === 'vertex') return { x: Math.round(p.x), y: Math.round(p.y) };
  if (mode === 'center') return { x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5 };
  if (mode === 'edge') {
    // Nächste Kantenmitte: senkrechte Kante (x ganzzahlig) oder waagerechte (y ganzzahlig).
    const v = { x: Math.round(p.x), y: Math.floor(p.y) + 0.5 };
    const h = { x: Math.floor(p.x) + 0.5, y: Math.round(p.y) };
    // Mit Richtung: Kante quer zur Wirkrichtung (waagerechte Linie startet an senkrechter Kante).
    if (angle !== undefined) {
      const rad = (angle * Math.PI) / 180;
      return Math.abs(Math.cos(rad)) >= Math.abs(Math.sin(rad)) ? v : h;
    }
    return Math.hypot(v.x - p.x, v.y - p.y) <= Math.hypot(h.x - p.x, h.y - p.y) ? v : h;
  }
  return { x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 };
}
