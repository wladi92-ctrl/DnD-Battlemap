/**
 * Temporäre Zeichnungen (Pfeil, Kreis, Freihand) und Pings über der Karte – auch über dem
 * Nebel, damit die Spielleitung auf noch Verdecktes zeigen kann. Pings pulsieren; solange
 * welche aktiv sind, meldet `animating()` true und der Renderer zeichnet fortlaufend.
 */
import { Container, Graphics } from 'pixi.js';
import { CELL_PX } from '../core/grid';

export interface DrawVisual {
  shape: 'arrow' | 'circle' | 'free';
  points: readonly { x: number; y: number }[];
  color: string;
}

export interface PingVisual {
  x: number;
  y: number;
  color: string;
  /** Alter in ms. */
  age: number;
}

/** Lebensdauer der Ping-Darstellung (ms). */
export const PING_LIFE = 3000;

const hex = (c: string) => Number.parseInt(c.slice(1), 16);

export class DrawLayer {
  readonly container = new Container();
  private readonly gfx = new Graphics();
  private readonly pingGfx = new Graphics();
  private zoom = 1;
  private items: readonly DrawVisual[] = [];
  private pings: readonly { x: number; y: number; color: string; born: number }[] = [];

  constructor() {
    this.container.addChild(this.gfx, this.pingGfx);
  }

  setZoom(zoom: number): void {
    if (zoom === this.zoom) return;
    this.zoom = zoom;
    this.drawItems();
  }

  set(items: readonly DrawVisual[], pings: readonly PingVisual[], now: number): void {
    this.items = items;
    this.pings = pings.map((p) => ({ x: p.x, y: p.y, color: p.color, born: now - p.age }));
    this.drawItems();
    this.tick(now);
  }

  /** Zeichnet die Pings für den Zeitpunkt `now`; true, solange noch einer läuft. */
  tick(now: number): boolean {
    const g = this.pingGfx;
    g.clear();
    let alive = false;
    const px = 1 / this.zoom;
    for (const p of this.pings) {
      const age = now - p.born;
      if (age >= PING_LIFE || age < 0) continue;
      alive = true;
      const fade = 1 - age / PING_LIFE;
      const cx = p.x * CELL_PX;
      const cy = p.y * CELL_PX;
      // drei Wellen, die nacheinander nach außen laufen
      for (let k = 0; k < 3; k++) {
        const phase = (((age / 1000 + k / 3) % 1) + 1) % 1;
        g.circle(cx, cy, CELL_PX * (0.2 + phase * 1.3)).stroke({
          color: hex(p.color),
          width: 4 * px,
          alpha: fade * (1 - phase),
        });
      }
      g.circle(cx, cy, CELL_PX * 0.14)
        .fill({ color: hex(p.color), alpha: fade })
        .stroke({ color: 0x000000, width: 2 * px, alpha: fade });
    }
    return alive;
  }

  animating(now: number): boolean {
    return this.pings.some((p) => now - p.born < PING_LIFE);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private drawItems(): void {
    const g = this.gfx;
    g.clear();
    const w = Math.max(3, 5 / this.zoom);
    for (const d of this.items) {
      const color = hex(d.color);
      const pts = d.points.map((p) => ({ x: p.x * CELL_PX, y: p.y * CELL_PX }));
      const a = pts[0];
      const b = pts[pts.length - 1];
      if (!a || !b) continue;
      const style = { color, width: w, alpha: 0.9, cap: 'round' as const, join: 'round' as const };
      const halo = { ...style, color: 0x000000, width: w + 3 / this.zoom, alpha: 0.45 };
      if (d.shape === 'circle') {
        const r = Math.hypot(b.x - a.x, b.y - a.y);
        g.circle(a.x, a.y, r).stroke(halo);
        g.circle(a.x, a.y, r).stroke(style);
        g.circle(a.x, a.y, w * 0.8).fill({ color, alpha: 0.9 });
      } else if (d.shape === 'arrow') {
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const head = Math.max(CELL_PX * 0.35, w * 4);
        const wing = (s: number) => ({
          x: b.x - Math.cos(ang + s * 0.45) * head,
          y: b.y - Math.sin(ang + s * 0.45) * head,
        });
        const l = wing(1);
        const r = wing(-1);
        for (const st of [halo, style]) {
          g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke(st);
          g.moveTo(l.x, l.y).lineTo(b.x, b.y).lineTo(r.x, r.y).stroke(st);
        }
      } else {
        for (const st of [halo, style]) {
          g.moveTo(a.x, a.y);
          for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
          g.stroke(st);
        }
      }
    }
  }
}
