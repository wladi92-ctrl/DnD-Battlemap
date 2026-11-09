/**
 * Distanzregeln für Bewegung und Messung im quadratischen Raster.
 * Jede Regel ist eine austauschbare Strategie; Messungen über mehrere Wegpunkte
 * führen den Diagonalzähler fort (wichtig für die 5/10/5-Variante).
 */
import type { Cell } from './grid';

export type DiagonalRule = 'standard' | 'variant' | 'euclidean';
export const diagonalRules: readonly DiagonalRule[] = ['standard', 'variant', 'euclidean'];

export interface SegmentCost {
  /** Kosten in Feldern (bei euklidisch nicht ganzzahlig). */
  cells: number;
  /** Anzahl der diagonalen Schritte dieses Abschnitts. */
  diagonals: number;
}

export interface DiagonalStrategy {
  id: DiagonalRule;
  /**
   * Kosten eines geraden Abschnitts um (dx, dy) Felder.
   * @param diagonalsBefore Diagonalschritte, die auf dem Weg bereits gezählt wurden.
   */
  segment(dx: number, dy: number, diagonalsBefore: number): SegmentCost;
}

function steps(dx: number, dy: number) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const diagonals = Math.min(ax, ay);
  return { diagonals, straight: Math.max(ax, ay) - diagonals };
}

/** PHB-Standard: jeder Schritt (auch diagonal) kostet ein Feld. */
export const standardRule: DiagonalStrategy = {
  id: 'standard',
  segment(dx, dy) {
    const { diagonals, straight } = steps(dx, dy);
    return { cells: straight + diagonals, diagonals };
  },
};

/** DMG-Variante: jede zweite Diagonale kostet doppelt (5/10/5 ft …). */
export const variantRule: DiagonalStrategy = {
  id: 'variant',
  segment(dx, dy, diagonalsBefore) {
    const { diagonals, straight } = steps(dx, dy);
    const extra = Math.floor((diagonalsBefore + diagonals) / 2) - Math.floor(diagonalsBefore / 2);
    return { cells: straight + diagonals + extra, diagonals };
  },
};

/** Euklidischer Abstand der Feldmitten. */
export const euclideanRule: DiagonalStrategy = {
  id: 'euclidean',
  segment(dx, dy) {
    return { cells: Math.hypot(dx, dy), diagonals: steps(dx, dy).diagonals };
  },
};

export const strategies: Record<DiagonalRule, DiagonalStrategy> = {
  standard: standardRule,
  variant: variantRule,
  euclidean: euclideanRule,
};

export interface PathMeasure {
  /** Gesamtdistanz in Fuß. */
  feet: number;
  /** Distanz jedes Abschnitts in Fuß. */
  segments: number[];
}

/** Misst einen Weg über Wegpunkte (Feld zu Feld, Mitte zu Mitte). */
export function measurePath(
  points: readonly Cell[],
  rule: DiagonalRule,
  feetPerCell: number,
): PathMeasure {
  const strategy = strategies[rule];
  const segments: number[] = [];
  let diagonals = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const cost = strategy.segment(b.x - a.x, b.y - a.y, diagonals);
    diagonals += cost.diagonals;
    segments.push(cost.cells * feetPerCell);
  }
  return { feet: segments.reduce((s, v) => s + v, 0), segments };
}

export function distanceFeet(a: Cell, b: Cell, rule: DiagonalRule, feetPerCell: number): number {
  return measurePath([a, b], rule, feetPerCell).feet;
}
