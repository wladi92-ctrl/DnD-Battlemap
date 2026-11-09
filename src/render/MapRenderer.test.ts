import { describe, expect, it, vi } from 'vitest';

// Nur die reinen Hilfsfunktionen testen; Pixi selbst braucht eine echte Grafikumgebung.
vi.mock('pixi.js/unsafe-eval', () => ({}));
vi.mock('pixi.js', () => ({ Application: class {}, Container: class {}, Graphics: class {} }));

const { gridAlpha, hexToNumber } = await import('./MapRenderer');

describe('MapRenderer-Hilfen', () => {
  it('wandelt Hex-Farben um', () => {
    expect(hexToNumber('#ff0000')).toBe(0xff0000);
    expect(hexToNumber('#0a0B0c')).toBe(0x0a0b0c);
  });

  it('blendet das Raster bei kleinem Zoom aus', () => {
    expect(gridAlpha(0.5, 1)).toBe(0.5);
    expect(gridAlpha(0.5, 0.1)).toBeCloseTo(0.5 * (6.4 / 14));
    expect(gridAlpha(0.5, 0.05)).toBeLessThan(gridAlpha(0.5, 0.1));
  });
});
