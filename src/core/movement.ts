/**
 * Bewegungsreichweite (Dijkstra/A*-Variante ohne Ziel) und Gelegenheitsangriffe.
 * Reine Logik: Karte, Gelände und Figuren werden über Rückruffunktionen abgefragt.
 *
 * Regeln (SRD 5.1): Schwieriges Gelände kostet je Feld doppelt. Feindliche Kreaturen können
 * nicht durchquert werden, außer sie sind mindestens zwei Größenkategorien größer oder kleiner;
 * verbündete schon – aber man darf nicht im Feld einer anderen Kreatur enden.
 */
import type { DiagonalRule } from './distance';
import type { Cell } from './grid';

export interface MoveEnvironment {
  cols: number;
  rows: number;
  /** Feld (Index y·cols+x) ist unbetretbar (Wand, Säule …). */
  blocked: (index: number) => boolean;
  difficult: (index: number) => boolean;
  /** Kantenwand zwischen zwei benachbarten Feldern. */
  edgeBlocked: (from: Cell, to: Cell) => boolean;
  /** Belegung durch andere Figuren: frei, passierbar (Verbündete) oder blockierend (Feinde). */
  occupant: (index: number) => 'free' | 'pass' | 'block';
}

export interface MoveOptions {
  /** Kantenlänge des Tokens in ganzen Feldern (Tiny/Small/Medium = 1). */
  size: number;
  budgetFeet: number;
  feetPerCell: number;
  rule: DiagonalRule;
}

export interface Reach {
  /** Kosten in ft je erreichbarer Position (linke obere Ecke). */
  cost: Map<number, number>;
  /** Vorgänger für die Wegrekonstruktion (Schlüssel = Zustand, siehe stateKey). */
  prev: Map<number, number>;
  /** Bester Zustand je Position (für den Weg). */
  bestState: Map<number, number>;
  /** Positionen, an denen das Token stehen bleiben darf. */
  canEnd: Set<number>;
  cols: number;
}

const DIRS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Kleiner binärer Heap (Min) für Dijkstra. */
class Heap {
  private items: [number, number][] = [];
  get size() {
    return this.items.length;
  }
  push(priority: number, value: number) {
    const a = this.items;
    a.push([priority, value]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((a[p] as [number, number])[0] <= priority) break;
      [a[i], a[p]] = [a[p] as [number, number], a[i] as [number, number]];
      i = p;
    }
  }
  pop(): [number, number] | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (!top || !last || a.length === 0) return top;
    a[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < a.length && (a[l] as [number, number])[0] < (a[m] as [number, number])[0]) m = l;
      if (r < a.length && (a[r] as [number, number])[0] < (a[m] as [number, number])[0]) m = r;
      if (m === i) break;
      [a[i], a[m]] = [a[m] as [number, number], a[i] as [number, number]];
      i = m;
    }
    return top;
  }
}

/** Zustand = Position · 2 + Parität der bisher gezählten Diagonalen (für 5/10/5). */
const stateKey = (index: number, parity: number) => index * 2 + parity;

/** Berechnet alle Positionen, die mit dem Budget erreichbar sind. */
export function reachable(env: MoveEnvironment, start: Cell, opt: MoveOptions): Reach {
  const { cols, rows } = env;
  const n = Math.max(1, Math.round(opt.size));
  const fits = (x: number, y: number) => x >= 0 && y >= 0 && x + n <= cols && y + n <= rows;

  // Prüft das Betreten der Position (x, y) aus (px, py) für den gesamten Platzbedarf.
  const enter = (px: number, py: number, x: number, y: number) => {
    if (!fits(x, y)) return null;
    let difficult = false;
    let end = true;
    const dx = x - px;
    const dy = y - py;
    for (let oy = 0; oy < n; oy++) {
      for (let ox = 0; ox < n; ox++) {
        const cx = x + ox;
        const cy = y + oy;
        const i = cy * cols + cx;
        if (env.blocked(i)) return null;
        const occ = env.occupant(i);
        if (occ === 'block') return null;
        if (occ === 'pass') end = false;
        if (env.difficult(i)) difficult = true;
        if (env.edgeBlocked({ x: cx - dx, y: cy - dy }, { x: cx, y: cy })) return null;
      }
    }
    // Kein Durchquetschen diagonal zwischen zwei blockierten Nachbarn.
    if (dx !== 0 && dy !== 0) {
      const side1 =
        !fits(px + dx, py) ||
        [...Array(n).keys()].some((k) =>
          env.blocked((py + k) * cols + px + dx + (dx > 0 ? n - 1 : 0)),
        );
      const side2 =
        !fits(px, py + dy) ||
        [...Array(n).keys()].some((k) =>
          env.blocked((py + dy + (dy > 0 ? n - 1 : 0)) * cols + px + k),
        );
      if (side1 && side2) return null;
    }
    return { difficult, end };
  };

  const cost = new Map<number, number>();
  const bestState = new Map<number, number>();
  const prev = new Map<number, number>();
  const dist = new Map<number, number>();
  const canEnd = new Set<number>();
  const startIndex = start.y * cols + start.x;
  const s0 = stateKey(startIndex, 0);
  dist.set(s0, 0);
  const heap = new Heap();
  heap.push(0, s0);
  const eps = 1e-9;

  while (heap.size) {
    const item = heap.pop();
    if (!item) break;
    const [d, state] = item;
    if (d > (dist.get(state) ?? Infinity) + eps) continue;
    const index = state >> 1;
    const parity = state & 1;
    if (!cost.has(index) || d < (cost.get(index) ?? Infinity) - eps) {
      cost.set(index, d);
      bestState.set(index, state);
    }
    const x = index % cols;
    const y = (index - x) / cols;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      const info = enter(x, y, nx, ny);
      if (!info) continue;
      const diag = dx !== 0 && dy !== 0;
      let cells: number;
      let nextParity = parity;
      if (!diag) cells = 1;
      else if (opt.rule === 'variant') {
        cells = parity ? 2 : 1;
        nextParity = parity ^ 1;
      } else if (opt.rule === 'euclidean') cells = Math.SQRT2;
      else cells = 1;
      const step = cells * opt.feetPerCell * (info.difficult ? 2 : 1);
      const nd = d + step;
      if (nd > opt.budgetFeet + eps) continue;
      const ni = ny * cols + nx;
      const ns = stateKey(ni, nextParity);
      if (nd < (dist.get(ns) ?? Infinity) - eps) {
        dist.set(ns, nd);
        prev.set(ns, state);
        heap.push(nd, ns);
      }
      if (info.end) canEnd.add(ni);
    }
  }
  canEnd.add(startIndex);
  return { cost, prev, bestState, canEnd, cols };
}

/** Weg vom Start zur Position `target` (inklusive Start und Ziel) oder null. */
export function pathTo(r: Reach, target: Cell): Cell[] | null {
  const index = target.y * r.cols + target.x;
  let state = r.bestState.get(index);
  if (state === undefined) return null;
  const out: Cell[] = [];
  for (let guard = 0; state !== undefined && guard < 100_000; guard++) {
    const i = state >> 1;
    out.push({ x: i % r.cols, y: Math.floor(i / r.cols) });
    state = r.prev.get(state);
  }
  return out.reverse();
}

// ------------------------------------------------------------------ Gelegenheitsangriffe

export interface Body {
  id: string;
  x: number;
  y: number;
  /** Kantenlänge in Feldern (Tiny 0,5). */
  size: number;
  hostileTo: (otherId: string) => boolean;
  reachFeet: number;
}

/** Abstand zweier Figuren in ft (benachbart = 1 Feld). */
export function bodyDistanceFeet(
  a: { x: number; y: number; size: number },
  b: { x: number; y: number; size: number },
  feetPerCell: number,
): number {
  const sa = Math.max(1, a.size);
  const sb = Math.max(1, b.size);
  const gapX = Math.max(0, b.x - (a.x + sa), a.x - (b.x + sb));
  const gapY = Math.max(0, b.y - (a.y + sa), a.y - (b.y + sb));
  return (Math.max(gapX, gapY) + 1) * feetPerCell;
}

/**
 * Welche feindlichen Figuren dürfen einen Gelegenheitsangriff machen, wenn `mover` den Weg
 * `path` geht? Auslöser: Verlassen der Reichweite (von innerhalb nach außerhalb).
 */
export function opportunityAttackers(
  mover: Body,
  others: readonly Body[],
  path: readonly Cell[],
  feetPerCell: number,
): string[] {
  const out: string[] = [];
  for (const o of others) {
    if (o.id === mover.id || !o.hostileTo(mover.id)) continue;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1] as Cell;
      const b = path[i] as Cell;
      const before = bodyDistanceFeet({ ...a, size: mover.size }, o, feetPerCell) <= o.reachFeet;
      const after = bodyDistanceFeet({ ...b, size: mover.size }, o, feetPerCell) <= o.reachFeet;
      if (before && !after) {
        out.push(o.id);
        break;
      }
    }
  }
  return out;
}
