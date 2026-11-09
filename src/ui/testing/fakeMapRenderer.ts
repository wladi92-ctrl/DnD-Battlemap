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
  showTerrain = false;
  destroyed = false;

  static async create(): Promise<MapRenderer> {
    MapRenderer.last = new MapRenderer();
    return MapRenderer.last;
  }

  resize(): void {}
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
