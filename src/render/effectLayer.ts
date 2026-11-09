/**
 * Darstellung von Flächeneffekten: halbtransparente Füllung in der Farbe der Schadensart,
 * zusätzliches Muster (Barrierefreiheit: nicht nur Farbe), Umriss der Fläche, Ursprungsmarke
 * und Beschriftung. Wird nur bei Änderungen neu gezeichnet.
 */
import { Container, Graphics, Text } from 'pixi.js';
import { CELL_PX } from '../core/grid';
import type { EffectPattern } from '../editor/effects';

export interface EffectVisual {
  id: string;
  cells: ReadonlySet<number>;
  color: string;
  pattern: EffectPattern;
  /** Ursprung in Feldkoordinaten (Marke + Beschriftung). */
  origin: { x: number; y: number };
  label: string;
  selected: boolean;
  /** Vorschau beim Platzieren (gestrichelt, heller). */
  ghost: boolean;
  /** Vor Spielern verborgen (in der GM-Ansicht blasser). */
  hidden: boolean;
}

const hex = (c: string) => Number.parseInt(c.slice(1), 16);

/** Muster eines Feldes (Weltkoordinaten der linken oberen Ecke). */
function drawPattern(g: Graphics, p: EffectPattern, x: number, y: number) {
  const s = CELL_PX;
  const q = s / 4;
  switch (p) {
    case 'diag':
      for (let k = 1; k <= 3; k++) g.moveTo(x, y + k * q).lineTo(x + k * q, y);
      for (let k = 1; k <= 3; k++) g.moveTo(x + k * q, y + s).lineTo(x + s, y + k * q);
      g.moveTo(x, y + s).lineTo(x + s, y);
      return;
    case 'antidiag':
      for (let k = 1; k <= 3; k++) g.moveTo(x + s - k * q, y).lineTo(x + s, y + k * q);
      for (let k = 1; k <= 3; k++) g.moveTo(x, y + k * q).lineTo(x + s - k * q, y + s);
      g.moveTo(x, y).lineTo(x + s, y + s);
      return;
    case 'horizontal':
      for (let k = 1; k <= 3; k++) g.moveTo(x, y + k * q).lineTo(x + s, y + k * q);
      return;
    case 'vertical':
      for (let k = 1; k <= 3; k++) g.moveTo(x + k * q, y).lineTo(x + k * q, y + s);
      return;
    case 'cross':
      g.moveTo(x, y)
        .lineTo(x + s, y + s)
        .moveTo(x + s, y)
        .lineTo(x, y + s);
      return;
    case 'grid':
      g.moveTo(x + s / 2, y)
        .lineTo(x + s / 2, y + s)
        .moveTo(x, y + s / 2)
        .lineTo(x + s, y + s / 2);
      return;
    case 'zigzag':
      g.moveTo(x, y + s / 2)
        .lineTo(x + q, y + q)
        .lineTo(x + 2 * q, y + 3 * q)
        .lineTo(x + 3 * q, y + q)
        .lineTo(x + s, y + s / 2);
      return;
    case 'rays':
      g.moveTo(x + s / 2, y + q)
        .lineTo(x + s / 2, y + 3 * q)
        .moveTo(x + q, y + s / 2)
        .lineTo(x + 3 * q, y + s / 2);
      return;
    case 'rings':
      g.circle(x + s / 2, y + s / 2, s * 0.28);
      return;
    case 'dots':
    case 'none':
      return;
  }
}

export class EffectLayer {
  readonly container = new Container();
  private gfx = new Graphics();
  private labels = new Container();
  private zoom = 1;
  private items: readonly EffectVisual[] = [];
  private cols = 1;

  constructor() {
    this.container.addChild(this.gfx, this.labels);
  }

  set(items: readonly EffectVisual[], cols: number): void {
    this.items = items;
    this.cols = cols;
    this.draw();
  }

  setZoom(zoom: number): void {
    if (zoom === this.zoom) return;
    this.zoom = zoom;
    if (this.items.length) this.draw();
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    for (const l of this.labels.removeChildren()) l.destroy();
    const px = 1 / this.zoom;
    const cols = this.cols;
    for (const e of this.items) {
      const color = hex(e.color);
      const alpha = (e.ghost ? 0.22 : 0.32) * (e.hidden ? 0.6 : 1);
      // Füllung
      for (const i of e.cells) {
        const x = (i % cols) * CELL_PX;
        const y = Math.floor(i / cols) * CELL_PX;
        g.rect(x, y, CELL_PX, CELL_PX);
      }
      if (e.cells.size) g.fill({ color, alpha });
      // Muster
      if (e.pattern === 'dots') {
        for (const i of e.cells) {
          const x = (i % cols) * CELL_PX;
          const y = Math.floor(i / cols) * CELL_PX;
          g.circle(x + CELL_PX / 4, y + CELL_PX / 4, CELL_PX * 0.06).circle(
            x + (3 * CELL_PX) / 4,
            y + (3 * CELL_PX) / 4,
            CELL_PX * 0.06,
          );
        }
        if (e.cells.size) g.fill({ color, alpha: 0.85 });
      } else if (e.pattern !== 'none') {
        for (const i of e.cells)
          drawPattern(g, e.pattern, (i % cols) * CELL_PX, Math.floor(i / cols) * CELL_PX);
        if (e.cells.size) g.stroke({ color, width: Math.max(1.5, 1.5 * px), alpha: 0.7 });
      }
      // Umriss: Kanten zu nicht betroffenen Nachbarn
      for (const i of e.cells) {
        const cx = i % cols;
        const cy = Math.floor(i / cols);
        const x = cx * CELL_PX;
        const y = cy * CELL_PX;
        if (cy === 0 || !e.cells.has(i - cols)) g.moveTo(x, y).lineTo(x + CELL_PX, y);
        if (!e.cells.has(i + cols)) g.moveTo(x, y + CELL_PX).lineTo(x + CELL_PX, y + CELL_PX);
        if (cx === 0 || !e.cells.has(i - 1)) g.moveTo(x, y).lineTo(x, y + CELL_PX);
        if (cx === cols - 1 || !e.cells.has(i + 1))
          g.moveTo(x + CELL_PX, y).lineTo(x + CELL_PX, y + CELL_PX);
      }
      if (e.cells.size) {
        g.stroke({
          color: e.selected ? 0xffffff : color,
          width: (e.selected ? 4 : e.ghost ? 2 : 2.5) * px,
          alpha: e.ghost ? 0.8 : 1,
        });
      }
      // Ursprungsmarke
      const ox = e.origin.x * CELL_PX;
      const oy = e.origin.y * CELL_PX;
      g.circle(ox, oy, 6 * px)
        .fill({ color: e.selected ? 0xffffff : color })
        .stroke({ color: 0x000000, width: 1.5 * px });
      if (e.label) {
        const text = new Text({
          text: e.label,
          style: {
            fontFamily: 'system-ui, sans-serif',
            fontSize: 14,
            fontWeight: '700',
            fill: 0xffffff,
            stroke: { color: 0x000000, width: 3 },
          },
        });
        text.scale.set(px);
        text.anchor.set(0, 1);
        text.position.set(ox + 8 * px, oy - 4 * px);
        this.labels.addChild(text);
      }
    }
  }
}
