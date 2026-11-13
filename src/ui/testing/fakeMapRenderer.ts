/** Ersatz für den Pixi-Renderer in jsdom-Tests; merkt sich den zuletzt gesetzten Zustand. */
import type { Camera } from '../../core/camera';
import type { MapDocument } from '../../storage/mapDocument';
import type { MapVisual, OverlayState } from '../../render/MapRenderer';
import type { EffectVisual } from '../../render/effectLayer';

export class MapRenderer {
  static last: MapRenderer | null = null;
  map: MapVisual | null = null;
  doc: MapDocument | null = null;
  camera: Camera | null = null;
  overlay: OverlayState | null = null;
  effects: readonly EffectVisual[] = [];
  fog: { mask: Uint8Array | null; mode: string } = { mask: null, mode: 'gm' };
  lights: readonly unknown[] = [];
  drawings: readonly { shape: string; points: readonly unknown[]; color: string }[] = [];
  pings: readonly { x: number; y: number }[] = [];
  showTerrain = false;
  /** Exportierte Ausschnitte (Felder, Pixel pro Feld, Raster, Format). */
  exports: {
    rect: { x: number; y: number; w: number; h: number };
    px: number;
    grid: boolean;
    mime: string;
    doc: MapDocument | null;
  }[] = [];
  destroyed = false;

  static async create(): Promise<MapRenderer> {
    MapRenderer.last = new MapRenderer();
    return MapRenderer.last;
  }

  resize(): void {}
  async tokensReady(): Promise<void> {}
  async exportImage(
    rect: { x: number; y: number; w: number; h: number },
    px: number,
    opts: { grid: boolean },
    mime: string,
  ): Promise<{ bytes: Uint8Array; width: number; height: number }> {
    this.exports.push({ rect, px, grid: opts.grid, mime, doc: this.doc });
    // Kleinstes JPEG-/PNG-Gerüst genügt (Inhalt wird in Tests nicht dekodiert).
    const bytes =
      mime === 'image/png'
        ? new Uint8Array([0x89, 0x50, 0x4e, 0x47])
        : new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    return { bytes, width: Math.round(rect.w * px), height: Math.round(rect.h * px) };
  }
  setMap(map: MapVisual): void {
    this.map = map;
  }
  setDocument(doc: MapDocument): void {
    this.doc = doc;
    this.map = {
      cols: doc.grid.cols,
      rows: doc.grid.rows,
      backgroundColor: doc.background.color,
      grid: { visible: doc.grid.visible, color: doc.grid.color, opacity: doc.grid.opacity },
    };
  }
  setShowTerrain(show: boolean): void {
    this.showTerrain = show;
  }
  setConditionLabel(): void {}
  setFog(mask: Uint8Array | null, mode: string): void {
    this.fog = { mask, mode };
  }
  setLights(markers: readonly unknown[]): void {
    this.lights = markers;
  }
  setDrawings(
    items: readonly { shape: string; points: readonly unknown[]; color: string }[],
    pings: readonly { x: number; y: number }[],
  ): void {
    this.drawings = items;
    this.pings = pings;
  }
  setEffects(items: readonly EffectVisual[]): void {
    this.effects = items;
  }
  setCamera(camera: Camera): void {
    this.camera = camera;
  }
  setOverlay(overlay: OverlayState): void {
    this.overlay = overlay;
  }
  destroy(): void {
    this.destroyed = true;
  }
}
