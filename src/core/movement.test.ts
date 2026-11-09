import { describe, expect, it } from 'vitest';
import {
  bodyDistanceFeet,
  opportunityAttackers,
  pathTo,
  reachable,
  type MoveEnvironment,
} from './movement';
import { movementBlocked, type WallLike } from './walls';

const c = (x: number, y: number) => ({ x, y });

function env(
  cols: number,
  rows: number,
  opts: {
    blocked?: number[];
    difficult?: number[];
    walls?: WallLike[];
    occ?: Record<number, 'pass' | 'block'>;
  } = {},
): MoveEnvironment {
  const blocked = new Set(opts.blocked ?? []);
  const difficult = new Set(opts.difficult ?? []);
  return {
    cols,
    rows,
    blocked: (i) => blocked.has(i),
    difficult: (i) => difficult.has(i),
    edgeBlocked: (a, b) => movementBlocked(opts.walls ?? [], a, b),
    occupant: (i) => opts.occ?.[i] ?? 'free',
  };
}

const base = { size: 1, feetPerCell: 5, rule: 'standard' as const };

describe('Bewegungsreichweite', () => {
  it('30 ft auf freier Fläche: 6 Felder in jede Richtung (Standardregel)', () => {
    const r = reachable(env(20, 20), c(10, 10), { ...base, budgetFeet: 30 });
    expect(r.cost.get(10 * 20 + 16)).toBe(30);
    expect(r.cost.get(16 * 20 + 16)).toBe(30); // diagonal = 5 ft
    expect(r.cost.has(10 * 20 + 17)).toBe(false);
    expect(r.cost.size).toBe(13 * 13);
  });

  it('Variante 5/10/5: 30 ft reichen diagonal nur 4 Felder', () => {
    const r = reachable(env(20, 20), c(10, 10), { ...base, budgetFeet: 30, rule: 'variant' });
    expect(r.cost.get(14 * 20 + 14)).toBe(30);
    expect(r.cost.has(15 * 20 + 15)).toBe(false);
  });

  it('schwieriges Gelände kostet doppelt', () => {
    const difficult = [...Array(20).keys()].map((x) => 11 * 20 + x); // ganze Zeile y=11
    const r = reachable(env(20, 20, { difficult }), c(10, 10), { ...base, budgetFeet: 15 });
    expect(r.cost.get(11 * 20 + 10)).toBe(10);
    expect(r.cost.get(12 * 20 + 10)).toBe(15);
    expect(r.cost.has(13 * 20 + 10)).toBe(false);
  });

  it('Wände: Umweg wird gefunden, Weg ist zusammenhängend', () => {
    // Senkrechte Kantenwand bei x=11 von y=5 bis y=12
    const walls: WallLike[] = [{ x1: 11, y1: 5, x2: 11, y2: 12, kind: 'wall' }];
    const r = reachable(env(20, 20, { walls }), c(10, 10), { ...base, budgetFeet: 60 });
    // Um das Wandende unten herum: (10,11) → (10,12) → (11,12) → (11,11) → (11,10) = 25 ft
    // (diagonal durch den Endpunkt der Wand ist gesperrt)
    expect(r.cost.get(10 * 20 + 11)).toBe(25);
    const path = pathTo(r, c(11, 10))!;
    expect(path[0]).toEqual(c(10, 10));
    expect(path.at(-1)).toEqual(c(11, 10));
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBe(1);
      expect(movementBlocked(walls, a, b)).toBe(false);
    }
  });

  it('blockierte Felder und kein Durchquetschen zwischen zwei Blöcken', () => {
    const blocked = [9 * 20 + 11, 10 * 20 + 12]; // (11,9) und (12,10)
    const r = reachable(env(20, 20, { blocked }), c(11, 10), { ...base, budgetFeet: 5 });
    expect(r.cost.has(9 * 20 + 12)).toBe(false); // diagonal zwischen den Blöcken
    expect(r.cost.has(9 * 20 + 11)).toBe(false);
  });

  it('Feinde blockieren, Verbündete sind passierbar aber kein Ziel', () => {
    const occ = { [10 * 20 + 11]: 'pass' as const, [10 * 20 + 9]: 'block' as const };
    const r = reachable(env(20, 20, { occ }), c(10, 10), { ...base, budgetFeet: 10 });
    expect(r.cost.has(10 * 20 + 11)).toBe(true);
    expect(r.canEnd.has(10 * 20 + 11)).toBe(false);
    expect(r.canEnd.has(10 * 20 + 12)).toBe(true);
    expect(r.cost.has(10 * 20 + 9)).toBe(false);
  });

  it('große Kreaturen (2×2) brauchen Platz für den ganzen Körper', () => {
    const blocked = [5 * 20 + 13]; // (13,5)
    const r = reachable(env(20, 20, { blocked }), c(10, 4), { ...base, size: 2, budgetFeet: 10 });
    expect(r.cost.has(4 * 20 + 12)).toBe(false); // würde (13,5) belegen
    expect(r.cost.has(4 * 20 + 11)).toBe(true);
    expect(r.cost.has(4 * 20 + 19)).toBe(false); // ragte über den Rand
  });
});

describe('Gelegenheitsangriffe', () => {
  it('Abstand zwischen Figuren (benachbart = 5 ft, groß = Kanten zählen)', () => {
    expect(bodyDistanceFeet({ x: 0, y: 0, size: 1 }, { x: 1, y: 1, size: 1 }, 5)).toBe(5);
    expect(bodyDistanceFeet({ x: 0, y: 0, size: 1 }, { x: 3, y: 0, size: 1 }, 5)).toBe(15);
    expect(bodyDistanceFeet({ x: 0, y: 0, size: 1 }, { x: 2, y: 0, size: 2 }, 5)).toBe(10);
  });

  it('nur beim Verlassen der Reichweite und nur von Feinden', () => {
    const hostile = (id: string) => id === 'held';
    const mover = { id: 'held', x: 5, y: 5, size: 1, hostileTo: () => false, reachFeet: 5 };
    const goblin = { id: 'goblin', x: 6, y: 5, size: 1, hostileTo: hostile, reachFeet: 5 };
    const ogre = { id: 'oger', x: 2, y: 5, size: 2, hostileTo: hostile, reachFeet: 10 };
    const friend = { id: 'freund', x: 4, y: 5, size: 1, hostileTo: () => false, reachFeet: 5 };
    // Oger (2×2, 10 ft Reichweite) erreicht den Helden bis (5,8); erst (5,9) liegt außerhalb.
    const short = [c(5, 5), c(5, 6), c(5, 7), c(5, 8)];
    expect(opportunityAttackers(mover, [goblin, ogre, friend], short, 5)).toEqual(['goblin']);
    const away = [...short, c(5, 9)];
    expect(opportunityAttackers(mover, [goblin, ogre, friend], away, 5)).toEqual([
      'goblin',
      'oger',
    ]);
    // Um den Goblin herum, ohne seine Reichweite zu verlassen
    const around = [c(5, 5), c(5, 6), c(6, 6)];
    expect(opportunityAttackers(mover, [goblin], around, 5)).toEqual([]);
  });
});
