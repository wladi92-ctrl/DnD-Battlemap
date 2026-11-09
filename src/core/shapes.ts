/** Rasterformen für die Zeichenwerkzeuge (reine Funktionen). */
import type { Cell, GridSize } from './grid';

/** Alle Felder auf der Linie von a nach b (Bresenham, inkl. Endpunkte). */
export function lineCells(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = [];
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push({ x, y });
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Normalisiertes Rechteck zwischen zwei Eckfeldern (inklusive). */
export function rectBetween(a: Cell, b: Cell): CellRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
}

export function rectCells(r: CellRect, filled: boolean): Cell[] {
  const out: Cell[] = [];
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (filled || x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1) {
        out.push({ x, y });
      }
    }
  }
  return out;
}

/**
 * Flutfüllung (4er-Nachbarschaft) ab `start`: alle zusammenhängenden Felder, für die
 * `same(index)` gilt. Iterativ, damit auch 200×200 ohne Stacküberlauf funktioniert.
 */
export function floodFill(size: GridSize, start: Cell, same: (index: number) => boolean): Cell[] {
  const { cols, rows } = size;
  if (start.x < 0 || start.y < 0 || start.x >= cols || start.y >= rows) return [];
  const startIndex = start.y * cols + start.x;
  if (!same(startIndex)) return [];
  const seen = new Uint8Array(cols * rows);
  const stack = [startIndex];
  seen[startIndex] = 1;
  const out: Cell[] = [];
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % cols;
    const y = (i - x) / cols;
    out.push({ x, y });
    const neighbours = [
      x > 0 ? i - 1 : -1,
      x < cols - 1 ? i + 1 : -1,
      y > 0 ? i - cols : -1,
      y < rows - 1 ? i + cols : -1,
    ];
    for (const n of neighbours) {
      if (n >= 0 && !seen[n] && same(n)) {
        seen[n] = 1;
        stack.push(n);
      }
    }
  }
  return out;
}

/** Entfernt Duplikate und Felder außerhalb der Karte. */
export function clipCells(cells: readonly Cell[], size: GridSize): Cell[] {
  const seen = new Set<number>();
  const out: Cell[] = [];
  for (const c of cells) {
    if (c.x < 0 || c.y < 0 || c.x >= size.cols || c.y >= size.rows) continue;
    const i = c.y * size.cols + c.x;
    if (!seen.has(i)) {
      seen.add(i);
      out.push(c);
    }
  }
  return out;
}
