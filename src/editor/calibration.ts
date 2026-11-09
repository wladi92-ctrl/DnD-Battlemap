/** Reine Hilfen für die Raster-Kalibrierung importierter Kartenbilder. */
import { GRID_MAX, GRID_MIN, type Point } from '../core/grid';
import type { GridGuess } from '../core/gridDetect';
import {
  imageGridSize,
  rotatedSize,
  type BackgroundImage,
  type CropRect,
  type ImageRotation,
} from '../storage/mapDocument';

export const CELL_PX_MIN = 4;
export const CELL_PX_MAX = 2000;

/** Erste Rasterlinie im Ausschnitt: Ursprung um ganze Felder an den Ausschnittrand verschieben. */
export function normalizeOrigin(origin: number, cropStart: number, cellPx: number): number {
  const mod = (((origin - cropStart) % cellPx) + cellPx) % cellPx;
  return cropStart + mod;
}

/**
 * Zwei Klickpunkte auf Rasterlinien/-kreuzungen und die Zahl der Felder dazwischen.
 * Gemessen wird entlang der längeren Achse (Punkte liegen typischerweise in einer Reihe).
 */
export function twoPointCalibration(a: Point, b: Point, cells: number, crop: CropRect) {
  const span = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  if (!(cells > 0) || span <= 0) return null;
  const cellPx = clampCellPx(span / cells);
  return {
    cellPx,
    originX: normalizeOrigin(a.x, crop.x, cellPx),
    originY: normalizeOrigin(a.y, crop.y, cellPx),
  };
}

export function clampCellPx(v: number): number {
  if (!Number.isFinite(v)) return 50;
  // Vier Nachkommastellen: 1500 px / 66 Felder = 22,7273 px ergibt wieder genau 66 Felder.
  return Math.min(CELL_PX_MAX, Math.max(CELL_PX_MIN, Math.round(v * 10000) / 10000));
}

/** Ergebnis der automatischen Erkennung (Koordinaten der verkleinerten Probe) zurückrechnen. */
export function guessToCalibration(guess: GridGuess, sampleScale: number, crop: CropRect) {
  const cellPx = clampCellPx(guess.cellPx / sampleScale);
  return {
    cellPx,
    originX: normalizeOrigin(crop.x + guess.offsetX / sampleScale, crop.x, cellPx),
    originY: normalizeOrigin(crop.y + guess.offsetY / sampleScale, crop.y, cellPx),
  };
}

/** Startwerte für ein neues Bild ohne erkanntes Raster (~30 Felder Breite). */
export function defaultCalibration(
  width: number,
  height: number,
  asset: string,
  rotation: ImageRotation = 0,
): BackgroundImage {
  const size = rotatedSize({ width, height, rotation });
  return {
    asset,
    width,
    height,
    rotation,
    cellPx: clampCellPx(Math.max(8, Math.round(size.w / 30))),
    originX: 0,
    originY: 0,
    crop: { x: 0, y: 0, w: size.w, h: size.h },
    brightness: 1,
    contrast: 0,
  };
}

/** Drehung ändern: Ausschnitt auf das ganze gedrehte Bild zurücksetzen. */
export function withRotation(img: BackgroundImage, rotation: ImageRotation): BackgroundImage {
  const size = rotatedSize({ ...img, rotation });
  return {
    ...img,
    rotation,
    crop: { x: 0, y: 0, w: size.w, h: size.h },
    originX: normalizeOrigin(img.originX, 0, img.cellPx),
    originY: normalizeOrigin(img.originY, 0, img.cellPx),
  };
}

/** Ausschnitt auf das Bild begrenzen. */
export function clampCrop(img: BackgroundImage, crop: CropRect): CropRect {
  const size = rotatedSize(img);
  const x = Math.min(size.w - 1, Math.max(0, Math.round(crop.x)));
  const y = Math.min(size.h - 1, Math.max(0, Math.round(crop.y)));
  return {
    x,
    y,
    w: Math.min(size.w - x, Math.max(1, Math.round(crop.w))),
    h: Math.min(size.h - y, Math.max(1, Math.round(crop.h))),
  };
}

/** Kartengröße, die aus der Kalibrierung entsteht (auf 10–200 begrenzt). */
export function calibratedMapSize(img: BackgroundImage) {
  const raw = imageGridSize(img);
  const clamp = (n: number) => Math.min(GRID_MAX, Math.max(GRID_MIN, n));
  return { raw, cols: clamp(raw.cols), rows: clamp(raw.rows) };
}
