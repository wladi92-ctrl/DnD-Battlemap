import { describe, expect, it } from 'vitest';
import {
  clampCamera,
  ensureVisible,
  fitToView,
  screenToWorld,
  worldToScreen,
  zoomAt,
  ZOOM_MAX,
  ZOOM_MIN,
} from './camera';

describe('Kamera', () => {
  it('Welt ↔ Bildschirm sind invers', () => {
    const cam = { x: 120, y: -40, zoom: 1.75 };
    const p = { x: 333, y: 77 };
    const back = screenToWorld(cam, worldToScreen(cam, p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it('zoomt um den Mauspunkt', () => {
    const cam = { x: 10, y: 20, zoom: 1 };
    const screen = { x: 400, y: 300 };
    const before = screenToWorld(cam, screen);
    const z = zoomAt(cam, screen, 2);
    expect(z.zoom).toBe(2);
    const after = screenToWorld(z, screen);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('begrenzt den Zoom', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 1000).zoom).toBe(ZOOM_MAX);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 0.0001).zoom).toBe(ZOOM_MIN);
  });

  it('passt die Welt ein und zentriert', () => {
    const cam = fitToView({ width: 1000, height: 600 }, { width: 2000, height: 1000 }, 0);
    expect(cam.zoom).toBe(0.5);
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(50);
  });

  it('eine 200×200-Karte passt in einen kleinen Viewport', () => {
    const cam = fitToView({ width: 900, height: 700 }, { width: 12800, height: 12800 });
    expect(cam.zoom).toBeGreaterThanOrEqual(ZOOM_MIN);
    expect(12800 * cam.zoom).toBeLessThanOrEqual(900);
  });

  it('hält die Karte teilweise sichtbar', () => {
    const vp = { width: 800, height: 600 };
    const world = { width: 640, height: 640 };
    const far = clampCamera({ x: 5000, y: -5000, zoom: 1 }, vp, world);
    expect(far.x).toBe(800 - 64);
    expect(far.y).toBe(64 - 640);
  });

  it('scrollt minimal zum sichtbar zu machenden Bereich', () => {
    const vp = { width: 800, height: 600 };
    const cam = { x: 0, y: 0, zoom: 1 };
    expect(ensureVisible(cam, vp, { x: 100, y: 100, width: 64, height: 64 })).toBe(cam);
    const moved = ensureVisible(cam, vp, { x: 900, y: 100, width: 64, height: 64 }, 32);
    expect(moved.x).toBe(800 - 32 - 964);
    expect(moved.y).toBe(0);
  });
});
