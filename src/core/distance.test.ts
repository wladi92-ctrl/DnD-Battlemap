import { describe, expect, it } from 'vitest';
import { distanceFeet, measurePath, variantRule } from './distance';

const c = (x: number, y: number) => ({ x, y });

describe('Distanzregeln', () => {
  it('Standard (PHB): Diagonale = 5 ft', () => {
    expect(distanceFeet(c(0, 0), c(3, 0), 'standard', 5)).toBe(15);
    expect(distanceFeet(c(0, 0), c(3, 3), 'standard', 5)).toBe(15);
    expect(distanceFeet(c(0, 0), c(4, 2), 'standard', 5)).toBe(20);
    expect(distanceFeet(c(5, 5), c(5, 5), 'standard', 5)).toBe(0);
  });

  it('Variante (DMG): 5/10/5/10 …', () => {
    expect(distanceFeet(c(0, 0), c(1, 1), 'variant', 5)).toBe(5);
    expect(distanceFeet(c(0, 0), c(2, 2), 'variant', 5)).toBe(15);
    expect(distanceFeet(c(0, 0), c(3, 3), 'variant', 5)).toBe(20);
    expect(distanceFeet(c(0, 0), c(4, 4), 'variant', 5)).toBe(30);
    // 3 gerade + 2 diagonal = 15 + 15
    expect(distanceFeet(c(0, 0), c(5, 2), 'variant', 5)).toBe(30);
  });

  it('Variante zählt Diagonalen über Wegpunkte hinweg weiter', () => {
    // Zwei einzelne Diagonalen nacheinander: 5 + 10, nicht 5 + 5.
    const m = measurePath([c(0, 0), c(1, 1), c(2, 0)], 'variant', 5);
    expect(m.segments).toEqual([5, 10]);
    expect(m.feet).toBe(15);
    // Gerader Abschnitt dazwischen unterbricht die Zählung nicht.
    expect(measurePath([c(0, 0), c(1, 1), c(3, 1), c(4, 2)], 'variant', 5).feet).toBe(25);
  });

  it('Variante: Strategie direkt mit vorherigen Diagonalen', () => {
    expect(variantRule.segment(1, 1, 1)).toEqual({ cells: 2, diagonals: 1 });
    expect(variantRule.segment(-2, 2, 1)).toEqual({ cells: 3, diagonals: 2 });
  });

  it('Euklidisch', () => {
    expect(distanceFeet(c(0, 0), c(3, 4), 'euclidean', 5)).toBe(25);
    expect(distanceFeet(c(0, 0), c(1, 1), 'euclidean', 5)).toBeCloseTo(7.071, 3);
  });

  it('Richtung ist egal (Symmetrie) und Feldgröße skaliert', () => {
    for (const rule of ['standard', 'variant', 'euclidean'] as const) {
      expect(distanceFeet(c(7, 2), c(1, 9), rule, 5)).toBe(distanceFeet(c(1, 9), c(7, 2), rule, 5));
    }
    expect(distanceFeet(c(0, 0), c(2, 0), 'standard', 10)).toBe(20);
  });

  it('leerer und einpunktiger Weg', () => {
    expect(measurePath([], 'standard', 5)).toEqual({ feet: 0, segments: [] });
    expect(measurePath([c(1, 1)], 'variant', 5)).toEqual({ feet: 0, segments: [] });
  });
});
