import { describe, expect, it } from 'vitest';
import { mulberry32 } from './random';
import { detectGrid } from './gridDetect';

/** Synthetisches Kartenbild: Rauschen, Flecken, Rasterlinien mit Periode und Versatz. */
function synthetic(w: number, h: number, cell: number, offX: number, offY: number, lines = true) {
  const rng = mulberry32(42);
  const g = new Float32Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = 140 + (rng() - 0.5) * 40;
  // "Möbel": helle Rechtecke ohne Bezug zum Raster
  for (let k = 0; k < 25; k++) {
    const x0 = Math.floor(rng() * (w - 40));
    const y0 = Math.floor(rng() * (h - 40));
    for (let y = y0; y < y0 + 25; y++) for (let x = x0; x < x0 + 33; x++) g[y * w + x] = 220;
  }
  if (lines) {
    for (let x = offX; x < w; x += cell) {
      const xi = Math.round(x);
      for (let y = 0; y < h; y++) g[y * w + xi] = 40;
    }
    for (let y = offY; y < h; y += cell) {
      const yi = Math.round(y);
      for (let x = 0; x < w; x++) g[yi * w + x] = 40;
    }
  }
  return g;
}

describe('Rastererkennung', () => {
  it.each([
    [600, 400, 37.5, 12, 5],
    [800, 600, 50, 0, 25],
    [500, 500, 23, 7.5, 18],
    [1000, 700, 70, 33, 61],
  ])('%i×%i, Feld %f px, Versatz %f/%f', (w, h, cell, ox, oy) => {
    const guess = detectGrid(synthetic(w, h, cell, ox, oy), w, h);
    expect(guess).not.toBeNull();
    expect(guess!.cellPx).toBeCloseTo(cell, 0);
    // Versatz modulo Feldgröße vergleichen
    const diff = (a: number, b: number) => {
      const d = Math.abs(a - b) % cell;
      return Math.min(d, cell - d);
    };
    expect(diff(guess!.offsetX, ox)).toBeLessThan(1.5);
    expect(diff(guess!.offsetY, oy)).toBeLessThan(1.5);
    expect(guess!.confidence).toBeGreaterThan(0.4);
  });

  it('kein Raster → kein (oder nur schwacher) Vorschlag', () => {
    const guess = detectGrid(synthetic(600, 400, 40, 0, 0, false), 600, 400);
    expect(guess).toBeNull();
  });

  it('einfarbiges Bild → null', () => {
    expect(detectGrid(new Float32Array(200 * 200).fill(128), 200, 200)).toBeNull();
  });
});
