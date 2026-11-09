import { describe, expect, it } from 'vitest';
import {
  decodeRuns,
  encodeRuns,
  LIGHT_BRIGHT,
  LIGHT_DARK,
  LIGHT_DIM,
  LIGHT_MAGIC_DARK,
  lightLevels,
  MASK_EXPLORED,
  MASK_HIDDEN,
  MASK_VISIBLE,
  playerMask,
  visibleCells,
  type VisionEnvironment,
} from './vision';
import type { WallLike } from './walls';

const COLS = 30;
const env = (walls: WallLike[] = [], solid: number[] = []): VisionEnvironment => {
  const s = new Set(solid);
  return { cols: COLS, rows: 20, feetPerCell: 5, walls, solid: (i) => s.has(i) };
};
const idx = (x: number, y: number) => y * COLS + x;
const torch = { x: 10.5, y: 10.5, bright: 20, dim: 40 };

describe('Licht', () => {
  it('Fackel: hell bis 20 ft, dämmrig bis 40 ft, sonst Grundhelligkeit', () => {
    const l = lightLevels(env(), [torch], 'dark');
    expect(l[idx(10, 10)]).toBe(LIGHT_BRIGHT);
    expect(l[idx(14, 10)]).toBe(LIGHT_BRIGHT); // 20 ft
    expect(l[idx(15, 10)]).toBe(LIGHT_DIM);
    expect(l[idx(18, 10)]).toBe(LIGHT_DIM); // 40 ft
    expect(l[idx(19, 10)]).toBe(LIGHT_DARK);
    expect(lightLevels(env(), [], 'dim')[idx(0, 0)]).toBe(LIGHT_DIM);
  });

  it('Wände und undurchsichtige Felder werfen Schatten; Fenster nicht', () => {
    const wall: WallLike = { x1: 12, y1: 0, x2: 12, y2: 20, kind: 'wall' };
    expect(lightLevels(env([wall]), [torch], 'dark')[idx(13, 10)]).toBe(LIGHT_DARK);
    const win: WallLike = { ...wall, kind: 'window' };
    expect(lightLevels(env([win]), [torch], 'dark')[idx(13, 10)]).toBe(LIGHT_BRIGHT);
    const open: WallLike = { ...wall, kind: 'door', state: 'open' };
    expect(lightLevels(env([open]), [torch], 'dark')[idx(13, 10)]).toBe(LIGHT_BRIGHT);
    const l = lightLevels(env([], [idx(12, 10)]), [torch], 'dark');
    expect(l[idx(12, 10)]).toBe(LIGHT_BRIGHT); // die Wandfläche selbst ist beleuchtet
    expect(l[idx(13, 10)]).toBe(LIGHT_DARK);
  });

  it('Magische Dunkelheit verdrängt Licht', () => {
    const l = lightLevels(
      env(),
      [torch, { x: 12, y: 10, bright: 0, dim: 10, darkness: true }],
      'bright',
    );
    expect(l[idx(12, 10)]).toBe(LIGHT_MAGIC_DARK);
    expect(l[idx(7, 10)]).toBe(LIGHT_BRIGHT); // außerhalb der Dunkelheit (10 ft um 12,10)
    expect(l[idx(10, 10)]).toBe(LIGHT_MAGIC_DARK);
  });
});

describe('Sicht', () => {
  it('ohne Dunkelsicht nur beleuchtete Felder, mit Dunkelsicht auch dunkle in Reichweite', () => {
    const levels = lightLevels(env(), [torch], 'dark');
    const human = visibleCells(env(), { x: 5.5, y: 10.5, darkvision: 0 }, levels, 300);
    expect(human[idx(10, 10)]).toBe(1); // beleuchtet
    expect(human[idx(5, 10)]).toBe(1); // eigenes Feld
    expect(human[idx(3, 10)]).toBe(1); // 35 ft von der Fackel: dämmrig
    expect(human[idx(0, 10)]).toBe(0); // 50 ft: dunkel
    const elf = visibleCells(env(), { x: 5.5, y: 10.5, darkvision: 60 }, levels, 300);
    expect(elf[idx(0, 10)]).toBe(1);
    expect(elf[idx(25, 2)]).toBe(0); // dunkel und außerhalb 60 ft
  });

  it('Wände verdecken; magische Dunkelheit blockiert auch Dunkelsicht', () => {
    const wall: WallLike = { x1: 8, y1: 0, x2: 8, y2: 20, kind: 'wall' };
    const levels = lightLevels(env([wall]), [], 'bright');
    const v = visibleCells(env([wall]), { x: 5.5, y: 10.5, darkvision: 0 }, levels, 300);
    expect(v[idx(7, 10)]).toBe(1);
    expect(v[idx(9, 10)]).toBe(0);
    const dark = lightLevels(
      env(),
      [{ x: 3, y: 10, bright: 0, dim: 10, darkness: true }],
      'bright',
    );
    const elf = visibleCells(env(), { x: 8.5, y: 10.5, darkvision: 120 }, dark, 300);
    expect(elf[idx(3, 10)]).toBe(0);
    expect(elf[idx(8, 5)]).toBe(1);
  });

  it('Spielermaske: Nebel, aktuelle Sicht, erkundet', () => {
    const size = 4;
    const revealed = Uint8Array.from([1, 1, 1, 0]);
    const visible = Uint8Array.from([1, 0, 0, 1]);
    const explored = Uint8Array.from([1, 1, 0, 1]);
    expect([
      ...playerMask(size, { fogEnabled: true, revealed, visionEnabled: true, visible, explored }),
    ]).toEqual([
      MASK_VISIBLE,
      MASK_EXPLORED,
      MASK_HIDDEN,
      MASK_HIDDEN, // sichtbar, aber manuell verdeckt
    ]);
    expect([
      ...playerMask(size, { fogEnabled: false, revealed, visionEnabled: false, visible, explored }),
    ]).toEqual([2, 2, 2, 2]);
    expect([
      ...playerMask(size, { fogEnabled: true, revealed, visionEnabled: false, visible, explored }),
    ]).toEqual([2, 2, 2, 0]);
  });
});

describe('Lauflängen', () => {
  it('kodiert und dekodiert verlustfrei, kompakt bei Flächen', () => {
    const m = new Uint8Array(1000);
    m.fill(1, 100, 400);
    m.fill(1, 990, 1000);
    const runs = encodeRuns(m);
    expect(runs).toEqual([100, 300, 590, 10]);
    expect(decodeRuns(runs, 1000)).toEqual(m);
    expect(encodeRuns(new Uint8Array(50))).toEqual([]);
    expect(decodeRuns([], 5)).toEqual(new Uint8Array(5));
    expect(encodeRuns(Uint8Array.from([1, 1, 0]))).toEqual([0, 2]);
  });
});
