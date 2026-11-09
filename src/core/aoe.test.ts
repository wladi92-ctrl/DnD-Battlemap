import { describe, expect, it } from 'vitest';
import {
  aoeCells,
  coverage,
  footprintAffected,
  snapAngle,
  snapOrigin,
  type AoeEnvironment,
  type AoeOptions,
  type AoePlacement,
  type AoeSpec,
} from './aoe';
import type { WallLike } from './walls';

const COLS = 40;
const env = (walls: WallLike[] = [], solid: number[] = []): AoeEnvironment => {
  const s = new Set(solid);
  return { cols: COLS, rows: 30, feetPerCell: 5, walls, solid: (i) => s.has(i) };
};
const half: AoeOptions = { rule: 'half', wallMode: 'line' };
const idx = (x: number, y: number) => y * COLS + x;
const list = (cells: Set<number>) =>
  [...cells]
    .map((i) => [i % COLS, Math.floor(i / COLS)])
    .sort((a, b) => a[1]! - b[1]! || a[0]! - b[0]!);
const at = (x: number, y: number, angle = 0): AoePlacement => ({ origin: { x, y }, angle });

const fireball: AoeSpec = { shape: 'sphere', size: 20 };
const burningHands: AoeSpec = { shape: 'cone', size: 15 };
const lightningBolt: AoeSpec = { shape: 'line', size: 100, width: 5 };

describe('Formen', () => {
  it('Feuerball: 20-ft-Kugel von einer Rasterkreuzung = 52 Felder, symmetrisch', () => {
    const cells = aoeCells(fireball, at(10, 10), env(), half);
    expect(cells.size).toBe(52);
    for (const [x, y] of list(cells)) {
      // Spiegelung an der Kreuzung (10,10): Feld x ↔ 19−x
      expect(cells.has(idx(19 - x!, y!))).toBe(true);
      expect(cells.has(idx(x!, 19 - y!))).toBe(true);
    }
    expect(cells.has(idx(13, 10))).toBe(true); // 4. Feld in der Achse
    expect(cells.has(idx(14, 10))).toBe(false);
    expect(cells.has(idx(13, 12))).toBe(false); // Ecke (3,2) deckt < 50 %
    expect(cells.has(idx(12, 12))).toBe(true);
    // Mittelpunkt-Regel liefert hier dieselbe Menge
    expect(aoeCells(fireball, at(10, 10), env(), { rule: 'center', wallMode: 'line' })).toEqual(
      cells,
    );
  });

  it('Brennende Hände: 15-ft-Kegel nach Osten von einer Feldkante (1-1-3 Felder)', () => {
    const cells = aoeCells(burningHands, at(5, 5.5), env(), half);
    expect(list(cells)).toEqual([
      [7, 4],
      [5, 5],
      [6, 5],
      [7, 5],
      [7, 6],
    ]);
  });

  it('Kegel diagonal (45°) von einer Rasterkreuzung: 6 Felder (1-2-3)', () => {
    const cells = aoeCells(burningHands, at(5, 5, 45), env(), half);
    expect(list(cells)).toEqual([
      [5, 5],
      [6, 5],
      [5, 6],
      [6, 6],
      [7, 6],
      [6, 7],
    ]);
  });

  it('Drehung um 90° ergibt die gespiegelte Form', () => {
    const east = list(aoeCells({ shape: 'cone', size: 30 }, at(10, 10.5), env(), half));
    const south = list(aoeCells({ shape: 'cone', size: 30 }, at(10.5, 10, 90), env(), half));
    // Osten (x−10, y−10) ↔ Süden (y−10, x−10)
    const transposed = east
      .map(([x, y]) => [y! - 10 + 10, x! - 10 + 10])
      .sort((a, b) => a[1]! - b[1]! || a[0]! - b[0]!);
    expect(south).toEqual(transposed);
  });

  it('Blitz: 100-ft-Linie, 5 ft breit = genau 20 Felder in einer Reihe', () => {
    const cells = aoeCells(lightningBolt, at(5, 5.5), env(), half);
    expect(cells.size).toBe(20);
    expect(list(cells).every(([, y]) => y === 5)).toBe(true);
    expect(cells.has(idx(5, 5)) && cells.has(idx(24, 5))).toBe(true);
    // 10 ft breite Linie zwischen zwei Reihen
    expect(aoeCells({ shape: 'line', size: 30, width: 10 }, at(5, 6), env(), half).size).toBe(12);
  });

  it('Donnerwoge: 15-ft-Würfel ab der Kante des Zaubernden = 3×3 Felder', () => {
    const cells = aoeCells({ shape: 'cube', size: 15 }, at(6, 5.5), env(), half);
    expect(list(cells)).toEqual([
      [6, 4],
      [7, 4],
      [8, 4],
      [6, 5],
      [7, 5],
      [8, 5],
      [6, 6],
      [7, 6],
      [8, 6],
    ]);
  });

  it('Aura um eine Kreatur (Geistwächter 15 ft), auch für große Träger', () => {
    const medium: AoePlacement = {
      origin: { x: 0, y: 0 },
      angle: 0,
      around: { x: 10, y: 10, size: 1 },
    };
    const cells = aoeCells({ shape: 'emanation', size: 15 }, medium, env(), half);
    expect(cells.has(idx(13, 10)) && cells.has(idx(10, 7)) && cells.has(idx(10, 10))).toBe(true);
    expect(cells.has(idx(14, 10))).toBe(false);
    expect(cells.has(idx(13, 13))).toBe(false); // Ecke: euklidisch außerhalb
    const large: AoePlacement = { ...medium, around: { x: 10, y: 10, size: 2 } };
    const big = aoeCells({ shape: 'emanation', size: 15 }, large, env(), half);
    expect(big.has(idx(14, 11)) && big.has(idx(7, 11))).toBe(true);
    expect(big.size).toBeGreaterThan(cells.size);
  });

  it('Quadrat und freie Fläche', () => {
    expect(aoeCells({ shape: 'square', size: 10 }, at(3, 4), env(), half).size).toBe(4);
    const free: AoePlacement = {
      ...at(0, 0),
      cells: [
        { x: 1, y: 1 },
        { x: 5, y: 2 },
      ],
    };
    expect(
      list(
        aoeCells(
          { shape: 'free', size: 0 },
          free,
          env([{ x1: 0, y1: 0, x2: 40, y2: 30, kind: 'wall' }]),
          half,
        ),
      ),
    ).toEqual([
      [1, 1],
      [5, 2],
    ]);
  });

  it('Flächenregel: halbe Abdeckung vs. Feldmitte', () => {
    const spec: AoeSpec = { shape: 'sphere', size: 5 };
    // Kugel 5 ft um eine Feldmitte: Nachbarfelder sind zu 1/4 abgedeckt, Mitte liegt auf dem Rand
    expect(coverage(spec, at(10.5, 10.5), 5, { x: 11, y: 10 }, 'half')).toBeLessThan(0.5);
    expect(coverage(spec, at(10.5, 10.5), 5, { x: 11, y: 10 }, 'center')).toBe(1);
    expect(aoeCells(spec, at(10.5, 10.5), env(), half).size).toBe(1);
    expect(aoeCells(spec, at(10.5, 10.5), env(), { rule: 'center', wallMode: 'line' }).size).toBe(
      5,
    );
  });
});

describe('Wände und Hindernisse', () => {
  const wall: WallLike = { x1: 12, y1: 0, x2: 12, y2: 30, kind: 'wall' };

  it('Feuerball mit Wand dazwischen: nichts hinter der Wand', () => {
    const cells = aoeCells(fireball, at(10, 10), env([wall]), half);
    expect(list(cells).every(([x]) => x! < 12)).toBe(true);
    expect(cells.has(idx(11, 10))).toBe(true);
    expect(
      aoeCells(fireball, at(10, 10), env([wall]), { rule: 'half', wallMode: 'ignore' }).size,
    ).toBe(52);
  });

  it('Offene Tür lässt durch, geschlossene nicht; Fenster blockieren', () => {
    const door = (state: 'open' | 'closed'): WallLike => ({
      x1: 12,
      y1: 9,
      x2: 12,
      y2: 11,
      kind: 'door',
      state,
    });
    const others: WallLike[] = [
      { x1: 12, y1: 0, x2: 12, y2: 9, kind: 'wall' },
      { x1: 12, y1: 11, x2: 12, y2: 30, kind: 'wall' },
    ];
    expect(
      aoeCells(fireball, at(10, 10), env([...others, door('open')]), half).has(idx(12, 10)),
    ).toBe(true);
    expect(
      aoeCells(fireball, at(10, 10), env([...others, door('closed')]), half).has(idx(12, 10)),
    ).toBe(false);
    const win: WallLike = { ...wall, kind: 'window' };
    expect(aoeCells(fireball, at(10, 10), env([win]), half).has(idx(12, 10))).toBe(false);
  });

  it('Blitz endet an einer Wand quer zur Linie', () => {
    const cross: WallLike = { x1: 15, y1: 0, x2: 15, y2: 30, kind: 'wall' };
    const cells = aoeCells(lightningBolt, at(5, 5.5), env([cross]), half);
    expect(cells.size).toBe(10);
  });

  it('Um Ecken ausbreiten (Feuerball): Felder hinter einer kurzen Wand werden erreicht', () => {
    const short: WallLike = { x1: 12, y1: 9, x2: 12, y2: 11, kind: 'wall' };
    const line = aoeCells(fireball, at(10, 10), env([short]), half);
    const spread = aoeCells(fireball, at(10, 10), env([short]), {
      rule: 'half',
      wallMode: 'spread',
    });
    expect(line.has(idx(12, 10))).toBe(false);
    expect(spread.has(idx(12, 10))).toBe(true);
    // Ausbreitung bleibt innerhalb der Kugel
    for (const i of spread) expect(aoeCells(fireball, at(10, 10), env(), half).has(i)).toBe(true);
  });

  it('Feste Felder (Mauerwerk) sind nie betroffen und decken dahinter ab', () => {
    const solid = [idx(12, 10)];
    const cells = aoeCells(lightningBolt, at(5, 5.5), env([], [idx(9, 5)]), half);
    expect(cells.has(idx(9, 5))).toBe(false);
    expect(cells.has(idx(10, 5))).toBe(false);
    expect(cells.has(idx(8, 5))).toBe(true);
    expect(aoeCells(fireball, at(10, 10), env([], solid), half).has(idx(12, 10))).toBe(false);
  });

  it('Wand direkt am Ursprung blockiert einen Kegel in Gegenrichtung nicht', () => {
    const behind: WallLike = { x1: 5, y1: 0, x2: 5, y2: 30, kind: 'wall' };
    expect(aoeCells(burningHands, at(5, 5.5), env([behind]), half).size).toBe(5);
  });
});

describe('Ziele und Einrasten', () => {
  it('Große Kreaturen sind betroffen, sobald eines ihrer Felder im Bereich liegt', () => {
    const cells = aoeCells(fireball, at(10, 10), env(), half);
    expect(footprintAffected(cells, { x: 13, y: 11, size: 2 }, COLS, 30)).toBe(true); // nur (13,11)
    expect(footprintAffected(cells, { x: 14, y: 10, size: 2 }, COLS, 30)).toBe(false);
    expect(footprintAffected(cells, { x: 14, y: 10, size: 3 }, COLS, 30)).toBe(false);
    expect(footprintAffected(cells, { x: 4, y: 4, size: 3 }, COLS, 30)).toBe(false);
    expect(footprintAffected(cells, { x: 4, y: 6, size: 3 }, COLS, 30)).toBe(true); // (6,8)
  });

  it('Winkel und Ursprung einrasten', () => {
    expect(snapAngle(52, 15)).toBe(45);
    expect(snapAngle(-10, 45)).toBe(0);
    expect(snapAngle(359, 15)).toBe(0);
    expect(snapAngle(37.6, 0)).toBe(38);
    expect(snapOrigin({ x: 3.4, y: 7.8 }, 'vertex')).toEqual({ x: 3, y: 8 });
    expect(snapOrigin({ x: 3.4, y: 7.8 }, 'center')).toEqual({ x: 3.5, y: 7.5 });
    expect(snapOrigin({ x: 3.2, y: 7.8 }, 'half')).toEqual({ x: 3, y: 8 });
  });
});

describe('Kantenmitte', () => {
  it('rastet auf die nächste Kantenmitte ein; Blitz von dort = 20 Felder', () => {
    expect(snapOrigin({ x: 5.1, y: 5.4 }, 'edge')).toEqual({ x: 5, y: 5.5 });
    expect(snapOrigin({ x: 5.4, y: 5.9 }, 'edge')).toEqual({ x: 5.5, y: 6 });
    const cells = aoeCells(
      { shape: 'line', size: 100, width: 5 },
      { origin: snapOrigin({ x: 5.1, y: 5.4 }, 'edge'), angle: 0 },
      { cols: 40, rows: 30, feetPerCell: 5, walls: [], solid: () => false },
      { rule: 'half', wallMode: 'line' },
    );
    expect(cells.size).toBe(20);
  });
});

describe('Kantenmitte nach Richtung', () => {
  it('waagerechte Wirkung → senkrechte Kante, senkrechte → waagerechte', () => {
    expect(snapOrigin({ x: 5.4, y: 5.9 }, 'edge', 180)).toEqual({ x: 5, y: 5.5 });
    expect(snapOrigin({ x: 5.1, y: 5.4 }, 'edge', 90)).toEqual({ x: 5.5, y: 5 });
  });
});
