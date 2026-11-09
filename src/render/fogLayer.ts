/**
 * Nebel/Sicht-Maske und Lichtquellen-Marken.
 * - Spieleransicht: nie gesehene Felder schwarz, erkundete abgedunkelt.
 * - GM-Ansicht: dieselben Bereiche halbtransparent, damit die Spielleitung sieht, was die
 *   Spieler sehen – ohne selbst etwas zu verlieren.
 * Gleichartige Felder einer Zeile werden zu einem Rechteck zusammengefasst.
 */
import { Container, Graphics } from 'pixi.js';
import { CELL_PX } from '../core/grid';
import { MASK_EXPLORED, MASK_HIDDEN } from '../core/vision';

export type FogMode = 'gm' | 'player';

export interface LightMarker {
  id: string;
  x: number;
  y: number;
  bright: number;
  dim: number;
  color: string;
  darkness: boolean;
  enabled: boolean;
  selected: boolean;
}

const ALPHA: Record<FogMode, [number, number]> = {
  // [nie gesehen, erkundet]
  player: [1, 0.6],
  gm: [0.5, 0.25],
};

export class FogLayer {
  readonly container = new Container();
  private readonly fog = new Graphics();
  private readonly lights = new Graphics();
  private zoom = 1;
  private markers: readonly LightMarker[] = [];
  private feetPerCell = 5;

  constructor() {
    this.container.addChild(this.fog, this.lights);
  }

  setMask(mask: Uint8Array | null, cols: number, rows: number, mode: FogMode): void {
    const g = this.fog;
    g.clear();
    if (!mask) return;
    const [hiddenA, exploredA] = ALPHA[mode];
    for (const [value, alpha] of [
      [MASK_HIDDEN, hiddenA],
      [MASK_EXPLORED, exploredA],
    ] as const) {
      let any = false;
      for (let y = 0; y < rows; y++) {
        let start = -1;
        for (let x = 0; x <= cols; x++) {
          const hit = x < cols && mask[y * cols + x] === value;
          if (hit && start < 0) start = x;
          if (!hit && start >= 0) {
            g.rect(start * CELL_PX, y * CELL_PX, (x - start) * CELL_PX, CELL_PX);
            any = true;
            start = -1;
          }
        }
      }
      if (any) g.fill({ color: 0x000000, alpha });
    }
  }

  setLights(markers: readonly LightMarker[], feetPerCell: number): void {
    this.markers = markers;
    this.feetPerCell = feetPerCell;
    this.drawLights();
  }

  setZoom(zoom: number): void {
    if (zoom === this.zoom) return;
    this.zoom = zoom;
    if (this.markers.length) this.drawLights();
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private drawLights(): void {
    const g = this.lights;
    g.clear();
    const px = 1 / this.zoom;
    for (const m of this.markers) {
      const cx = m.x * CELL_PX;
      const cy = m.y * CELL_PX;
      const color = Number.parseInt(m.color.slice(1), 16);
      if (m.selected) {
        // Radien: hell durchgezogen, dämmrig gestrichelt (als Punkte entlang des Kreises).
        const rb = (m.bright / this.feetPerCell) * CELL_PX;
        const rd = (m.dim / this.feetPerCell) * CELL_PX;
        if (rb > 0)
          g.circle(cx, cy, rb).stroke({ color: m.darkness ? 0x6a3d9a : 0xffd27a, width: 2.5 * px });
        const steps = Math.max(24, Math.round(rd / (8 * px)));
        for (let i = 0; i < steps; i += 2) {
          const a0 = (i / steps) * Math.PI * 2;
          const a1 = ((i + 1) / steps) * Math.PI * 2;
          g.moveTo(cx + Math.cos(a0) * rd, cy + Math.sin(a0) * rd).lineTo(
            cx + Math.cos(a1) * rd,
            cy + Math.sin(a1) * rd,
          );
        }
        g.stroke({ color: m.darkness ? 0x6a3d9a : 0xffd27a, width: 2 * px, alpha: 0.9 });
      }
      const r = 9 * px;
      g.circle(cx, cy, r)
        .fill({ color: m.darkness ? 0x111111 : color, alpha: m.enabled ? 1 : 0.35 })
        .stroke({ color: m.selected ? 0xffffff : 0x000000, width: (m.selected ? 3 : 1.5) * px });
      // Strahlen als Kennzeichen einer Lichtquelle
      if (!m.darkness) {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          g.moveTo(cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r * 1.3).lineTo(
            cx + Math.cos(a) * r * 1.8,
            cy + Math.sin(a) * r * 1.8,
          );
        }
        g.stroke({ color: 0x000000, width: 1.5 * px, alpha: m.enabled ? 0.9 : 0.4 });
      }
    }
  }
}
