/** Ersatz für den Pixi-Renderer in jsdom-Tests; merkt sich den zuletzt gesetzten Zustand. */
import type { Camera } from '../../core/camera';
import type { MapVisual, OverlayState } from '../../render/MapRenderer';

export class MapRenderer {
  static last: MapRenderer | null = null;
  map: MapVisual | null = null;
  camera: Camera | null = null;
  overlay: OverlayState | null = null;
  destroyed = false;

  static async create(): Promise<MapRenderer> {
    MapRenderer.last = new MapRenderer();
    return MapRenderer.last;
  }

  resize(): void {}
  setMap(map: MapVisual): void {
    this.map = map;
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
