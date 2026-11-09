/** Ersatz für den Pixi-Renderer in jsdom-Tests; merkt sich den zuletzt gesetzten Zustand. */
import type { Camera } from '../../core/camera';
import type { MapDocument } from '../../storage/mapDocument';
import type { MapVisual, OverlayState } from '../../render/MapRenderer';

export class MapRenderer {
  static last: MapRenderer | null = null;
  map: MapVisual | null = null;
  doc: MapDocument | null = null;
  camera: Camera | null = null;
  overlay: OverlayState | null = null;
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
