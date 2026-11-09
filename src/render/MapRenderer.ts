/**
 * PixiJS-Szene der Karte. Imperativ und ohne React: die UI schiebt Zustände hinein,
 * gerendert wird nur bei Änderungen (kein Dauer-Ticker) – spart CPU/GPU im Leerlauf.
 *
 * Ebenen (von unten): Hintergrund → Raster → Overlay (Hover, Cursor, Lineal).
 * Weitere Ebenen (Boden, Wände, Tokens, Effekte, Nebel …) kommen in späteren Phasen hinzu.
 */
import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics } from 'pixi.js';
import type { Camera } from '../core/camera';
import { CELL_PX, cellCenter, type Cell } from '../core/grid';
import { RENDERER_PREFERENCE } from './graphicsSupport';

export interface MapVisual {
  cols: number;
  rows: number;
  backgroundColor: string;
  grid: { visible: boolean; color: string; opacity: number };
}

export interface OverlayState {
  hover: Cell | null;
  cursor: Cell | null;
  /** Punkte des Lineals (Start, Wegpunkte, Ende). */
  ruler: readonly Cell[];
}

const HOVER_COLOR = 0xffffff;
const CURSOR_COLOR = 0x1a5fb4;
const RULER_COLOR = 0xc0392b;
/** Ab dieser Feldgröße auf dem Bildschirm (px) wird das Raster voll gezeichnet. */
const GRID_FADE_PX = 14;

export function hexToNumber(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

/** Deckkraft der Rasterlinien abhängig vom Zoom – sehr kleine Felder blenden aus. */
export function gridAlpha(opacity: number, zoom: number): number {
  return opacity * Math.min(1, (CELL_PX * zoom) / GRID_FADE_PX);
}

export class MapRenderer {
  private readonly world = new Container();
  private readonly background = new Graphics();
  private readonly grid = new Graphics();
  private readonly overlay = new Graphics();
  private map: MapVisual | null = null;
  private camera: Camera = { x: 0, y: 0, zoom: 1 };
  private overlayState: OverlayState = { hover: null, cursor: null, ruler: [] };
  private frame = 0;
  private destroyed = false;

  private constructor(private readonly app: Application) {
    this.world.addChild(this.background, this.grid, this.overlay);
    app.stage.addChild(this.world);
  }

  static async create(host: HTMLElement): Promise<MapRenderer> {
    const app = new Application();
    await app.init({
      preference: RENDERER_PREFERENCE,
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      backgroundAlpha: 0,
      antialias: true,
      autoStart: false,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    app.ticker.stop();
    app.canvas.style.display = 'block';
    host.appendChild(app.canvas);
    return new MapRenderer(app);
  }

  get rendererName(): string {
    return this.app.renderer.name;
  }

  resize(width: number, height: number): void {
    this.app.renderer.resize(Math.max(1, width), Math.max(1, height));
    this.requestRender();
  }

  setMap(map: MapVisual): void {
    const prev = this.map;
    this.map = map;
    const sizeChanged = !prev || prev.cols !== map.cols || prev.rows !== map.rows;
    if (sizeChanged || prev.backgroundColor !== map.backgroundColor) this.drawBackground();
    if (
      sizeChanged ||
      prev.grid.color !== map.grid.color ||
      prev.grid.visible !== map.grid.visible
    ) {
      this.drawGrid();
    }
    this.applyGridAlpha();
    this.requestRender();
  }

  setCamera(camera: Camera): void {
    const zoomChanged = camera.zoom !== this.camera.zoom;
    this.camera = camera;
    this.world.position.set(camera.x, camera.y);
    this.world.scale.set(camera.zoom);
    if (zoomChanged) {
      this.applyGridAlpha();
      this.drawOverlay(); // Linienstärken sind zoomabhängig
    }
    this.requestRender();
  }

  setOverlay(state: OverlayState): void {
    this.overlayState = state;
    this.drawOverlay();
    this.requestRender();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.app.destroy(true, { children: true });
  }

  private requestRender(): void {
    if (this.frame || this.destroyed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.destroyed) this.app.render();
    });
  }

  private drawBackground(): void {
    const m = this.map;
    this.background.clear();
    if (!m) return;
    const w = m.cols * CELL_PX;
    const h = m.rows * CELL_PX;
    this.background
      .rect(0, 0, w, h)
      .fill({ color: hexToNumber(m.backgroundColor) })
      .rect(0, 0, w, h)
      .stroke({ color: 0x000000, alpha: 0.6, width: 2, pixelLine: true });
  }

  private drawGrid(): void {
    const m = this.map;
    this.grid.clear();
    if (!m || !m.grid.visible) return;
    const w = m.cols * CELL_PX;
    const h = m.rows * CELL_PX;
    for (let x = 1; x < m.cols; x++) this.grid.moveTo(x * CELL_PX, 0).lineTo(x * CELL_PX, h);
    for (let y = 1; y < m.rows; y++) this.grid.moveTo(0, y * CELL_PX).lineTo(w, y * CELL_PX);
    this.grid.stroke({ color: hexToNumber(m.grid.color), width: 1, pixelLine: true });
  }

  private applyGridAlpha(): void {
    if (this.map) this.grid.alpha = gridAlpha(this.map.grid.opacity, this.camera.zoom);
  }

  private drawOverlay(): void {
    const g = this.overlay;
    const px = 1 / this.camera.zoom; // 1 Bildschirmpixel in Weltkoordinaten
    const { hover, cursor, ruler } = this.overlayState;
    g.clear();

    if (hover) {
      g.rect(hover.x * CELL_PX, hover.y * CELL_PX, CELL_PX, CELL_PX).fill({
        color: HOVER_COLOR,
        alpha: 0.18,
      });
    }

    const first = ruler[0];
    const last = ruler[ruler.length - 1];
    if (first && last) {
      for (const cell of [first, last]) {
        g.rect(cell.x * CELL_PX, cell.y * CELL_PX, CELL_PX, CELL_PX).fill({
          color: RULER_COLOR,
          alpha: 0.22,
        });
      }
      const [start, ...rest] = ruler.map(cellCenter);
      const tracePath = () => {
        g.moveTo(start?.x ?? 0, start?.y ?? 0);
        for (const p of rest) g.lineTo(p.x, p.y);
      };
      tracePath();
      g.stroke({ color: 0xffffff, alpha: 0.9, width: 7 * px, cap: 'round', join: 'round' });
      tracePath();
      g.stroke({ color: RULER_COLOR, width: 3.5 * px, cap: 'round', join: 'round' });
      for (const p of ruler.map(cellCenter)) {
        g.circle(p.x, p.y, 5 * px)
          .fill({ color: RULER_COLOR })
          .stroke({
            color: 0xffffff,
            width: 1.5 * px,
          });
      }
    }

    if (cursor) {
      const inset = 2 * px;
      g.rect(
        cursor.x * CELL_PX + inset,
        cursor.y * CELL_PX + inset,
        CELL_PX - 2 * inset,
        CELL_PX - 2 * inset,
      ).stroke({ color: CURSOR_COLOR, width: 3 * px });
    }
  }
}
