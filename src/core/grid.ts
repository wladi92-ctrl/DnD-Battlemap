/**
 * Quadratisches Raster. Felder werden 0-basiert als (x = Spalte, y = Zeile) adressiert,
 * Welt-Koordinaten sind Pixel der Kartenwelt: ein Feld ist CELL_PX Einheiten breit.
 */
export const CELL_PX = 64;
export const GRID_MIN = 10;
export const GRID_MAX = 200;

export interface Cell {
  x: number;
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface GridSize {
  cols: number;
  rows: number;
}

export function worldToCell(p: Point): Cell {
  return { x: Math.floor(p.x / CELL_PX), y: Math.floor(p.y / CELL_PX) };
}

export function cellCenter(c: Cell): Point {
  return { x: (c.x + 0.5) * CELL_PX, y: (c.y + 0.5) * CELL_PX };
}

export function inBounds(c: Cell, size: GridSize): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < size.cols && c.y < size.rows;
}

export function clampCell(c: Cell, size: GridSize): Cell {
  return {
    x: Math.min(size.cols - 1, Math.max(0, c.x)),
    y: Math.min(size.rows - 1, Math.max(0, c.y)),
  };
}

export function sameCell(a: Cell | null, b: Cell | null): boolean {
  return a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y);
}

/** Begrenzt eine Rastergröße auf den erlaubten Bereich (ganze Felder). */
export function clampGridDimension(n: number): number {
  if (!Number.isFinite(n)) return GRID_MIN;
  return Math.min(GRID_MAX, Math.max(GRID_MIN, Math.round(n)));
}

export function worldSize(size: GridSize): { width: number; height: number } {
  return { width: size.cols * CELL_PX, height: size.rows * CELL_PX };
}
