import { describe, expect, it } from 'vitest';
import {
  CELL_PX,
  cellCenter,
  clampCell,
  clampGridDimension,
  inBounds,
  sameCell,
  worldToCell,
} from './grid';
import { feetToMeters, formatDistance } from './units';

describe('Raster', () => {
  it('rechnet Welt ↔ Feld', () => {
    expect(worldToCell({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(worldToCell({ x: CELL_PX - 0.01, y: CELL_PX })).toEqual({ x: 0, y: 1 });
    expect(worldToCell({ x: -1, y: -1 })).toEqual({ x: -1, y: -1 });
    expect(cellCenter({ x: 2, y: 3 })).toEqual({ x: 2.5 * CELL_PX, y: 3.5 * CELL_PX });
  });

  it('Grenzen', () => {
    const size = { cols: 10, rows: 20 };
    expect(inBounds({ x: 9, y: 19 }, size)).toBe(true);
    expect(inBounds({ x: 10, y: 0 }, size)).toBe(false);
    expect(inBounds({ x: 0, y: -1 }, size)).toBe(false);
    expect(clampCell({ x: 50, y: -3 }, size)).toEqual({ x: 9, y: 0 });
    expect(clampGridDimension(5)).toBe(10);
    expect(clampGridDimension(250)).toBe(200);
    expect(clampGridDimension(42.6)).toBe(43);
    expect(clampGridDimension(Number.NaN)).toBe(10);
  });

  it('vergleicht Felder', () => {
    expect(sameCell({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
    expect(sameCell({ x: 1, y: 2 }, null)).toBe(false);
    expect(sameCell(null, null)).toBe(true);
  });
});

describe('Einheiten', () => {
  it('5 ft = 1,5 m', () => {
    expect(feetToMeters(5)).toBe(1.5);
    expect(feetToMeters(30)).toBe(9);
  });

  it('formatiert nach Sprache', () => {
    expect(formatDistance(30, { locale: 'de', showMeters: false })).toBe('30 ft');
    expect(formatDistance(35, { locale: 'de', showMeters: true })).toBe('35 ft (10,5 m)');
    expect(formatDistance(7.0711, { locale: 'en', showMeters: true })).toBe('7.1 ft (2.1 m)');
  });
});
