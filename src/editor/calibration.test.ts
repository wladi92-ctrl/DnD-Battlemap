import { describe, expect, it } from 'vitest';
import {
  calibratedMapSize,
  clampCrop,
  defaultCalibration,
  guessToCalibration,
  normalizeOrigin,
  twoPointCalibration,
  withRotation,
} from './calibration';

const crop = { x: 0, y: 0, w: 1000, h: 800 };

describe('Kalibrierung', () => {
  it('Ursprung wird auf die erste Rasterlinie im Ausschnitt gelegt', () => {
    expect(normalizeOrigin(130, 0, 50)).toBe(30);
    expect(normalizeOrigin(-20, 0, 50)).toBe(30);
    expect(normalizeOrigin(130, 100, 50)).toBe(130);
    expect(normalizeOrigin(90, 100, 50)).toBe(140);
  });

  it('1:1: krumme Feldgröße ergibt die volle Felderzahl (Rundungsrest am Rand)', () => {
    // Abenteuerkarte 1500×955 px mit 66 Feldern Breite (22,7273 px)
    const img = { ...defaultCalibration(1500, 955, 'a'), cellPx: 22.7273 };
    expect(calibratedMapSize(img).raw).toEqual({ cols: 66, rows: 42 });
    // gerundet auf 2 Stellen (22,73) ebenfalls 66, nicht 65
    expect(calibratedMapSize({ ...img, cellPx: 22.73 }).raw.cols).toBe(66);
    // echter Rest (halbes Feld) zählt weiterhin nicht
    expect(calibratedMapSize({ ...img, cellPx: 30 }).raw.cols).toBe(50);
    expect(calibratedMapSize({ ...img, cellPx: 1500 / 49.5 }).raw.cols).toBe(49);
  });

  it('zwei Punkte: Abstand / Felder, Punkt A liegt auf dem Raster', () => {
    const r = twoPointCalibration({ x: 112, y: 40 }, { x: 412, y: 44 }, 6, crop);
    expect(r).toEqual({ cellPx: 50, originX: 12, originY: 40 });
    // senkrecht gemessen
    expect(twoPointCalibration({ x: 10, y: 10 }, { x: 12, y: 310 }, 4, crop)?.cellPx).toBe(75);
    expect(twoPointCalibration({ x: 10, y: 10 }, { x: 10, y: 10 }, 4, crop)).toBeNull();
    expect(twoPointCalibration({ x: 10, y: 10 }, { x: 60, y: 10 }, 0, crop)).toBeNull();
  });

  it('Erkennung aus verkleinerter Probe zurückrechnen', () => {
    const r = guessToCalibration({ cellPx: 25, offsetX: 5, offsetY: 10, confidence: 1 }, 0.5, {
      x: 100,
      y: 0,
      w: 900,
      h: 800,
    });
    expect(r).toEqual({ cellPx: 50, originX: 110, originY: 20 });
  });

  it('Standardwerte, Drehung und Ausschnitt', () => {
    const img = defaultCalibration(3000, 2000, 'background/a.png');
    expect(img).toMatchObject({
      cellPx: 100,
      crop: { w: 3000, h: 2000 },
      brightness: 1,
      contrast: 0,
    });
    const rot = withRotation(img, 90);
    expect(rot.crop).toEqual({ x: 0, y: 0, w: 2000, h: 3000 });
    expect(clampCrop(rot, { x: -5, y: 2900, w: 5000, h: 500 })).toEqual({
      x: 0,
      y: 2900,
      w: 2000,
      h: 100,
    });
  });

  it('Kartengröße aus Kalibrierung, auf 10–200 begrenzt', () => {
    const img = { ...defaultCalibration(8000, 8000, 'background/b.png'), cellPx: 20 };
    expect(calibratedMapSize(img)).toEqual({ raw: { cols: 400, rows: 400 }, cols: 200, rows: 200 });
    const small = { ...img, cellPx: 1000 };
    expect(calibratedMapSize(small)).toEqual({ raw: { cols: 8, rows: 8 }, cols: 10, rows: 10 });
  });
});
