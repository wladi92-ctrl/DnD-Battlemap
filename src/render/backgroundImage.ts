/**
 * Hintergrundbild (importierte Karte) mit Detailstufen:
 * - Übersicht: das ganze Bild verkleinert auf höchstens OVERVIEW_MAX px – immer sichtbar.
 * - Kacheln: das Originalbild in TILE px großen Stücken mit Mipmaps, erst beim Hineinzoomen
 *   erzeugt und nur gezeigt, wenn die Übersicht zu grob wäre. So bleiben auch 8000×8000 px
 *   handhabbar (kein einzelner Riesentextur-Upload, Kacheln außerhalb der Sicht werden gecullt).
 */
import { ColorMatrixFilter, Container, Graphics, ImageSource, Sprite, Texture } from 'pixi.js';
import { CELL_PX } from '../core/grid';
import { mimeForAsset } from '../storage/assets';
import type { BackgroundImage } from '../storage/mapDocument';

export const OVERVIEW_MAX = 2048;
export const TILE = 2048;

export async function decodeImage(bytes: Uint8Array, path: string): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([bytes], { type: mimeForAsset(path) }));
}

function textureFrom(bitmap: ImageBitmap, mipmaps: boolean): Texture {
  return new Texture({
    source: new ImageSource({ resource: bitmap, autoGenerateMipmaps: mipmaps }),
  });
}

/** Lage des gedrehten Bildes innerhalb seines Containers. */
export function rotationTransform(rotation: number, w: number, h: number) {
  switch (rotation) {
    case 90:
      return { x: h, y: 0, angle: Math.PI / 2 };
    case 180:
      return { x: w, y: h, angle: Math.PI };
    case 270:
      return { x: 0, y: w, angle: (3 * Math.PI) / 2 };
    default:
      return { x: 0, y: 0, angle: 0 };
  }
}

/** Sichtbarer Bildbereich (px): Zuschnitt ∩ Kartenfläche ab dem Ursprung. */
export function visibleImageRect(img: BackgroundImage, cols: number, rows: number) {
  const x1 = Math.max(img.crop.x, img.originX);
  const y1 = Math.max(img.crop.y, img.originY);
  const x2 = Math.min(img.crop.x + img.crop.w, img.originX + cols * img.cellPx);
  const y2 = Math.min(img.crop.y + img.crop.h, img.originY + rows * img.cellPx);
  return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
}

export class BackgroundImageLayer {
  readonly container = new Container();
  private readonly rotated = new Container();
  private readonly tilesLayer = new Container();
  private readonly mask = new Graphics();
  private readonly filter = new ColorMatrixFilter();
  private overview: Sprite | null = null;
  private bitmap: ImageBitmap | null = null;
  private asset: string | null = null;
  private image: BackgroundImage | null = null;
  private loadToken = 0;
  private tilesState: 'none' | 'loading' | 'ready' = 'none';
  private zoom = 1;

  constructor(private readonly requestRender: () => void) {
    this.rotated.addChild(this.tilesLayer);
    this.container.addChild(this.rotated, this.mask);
    this.container.mask = this.mask;
    this.container.visible = false;
  }

  /** Bild und Einstellungen übernehmen; lädt neu, wenn sich die Datei geändert hat. */
  set(
    image: BackgroundImage | undefined,
    bytes: Uint8Array | undefined,
    cols: number,
    rows: number,
  ): void {
    this.image = image ?? null;
    if (!image || !bytes) {
      this.clear();
      return;
    }
    if (image.asset !== this.asset) void this.load(image.asset, bytes);
    this.layout(cols, rows);
  }

  /** Zoom der Kamera – steuert die Detailstufe. */
  setZoom(zoom: number): void {
    this.zoom = zoom;
    this.updateLod();
  }

  destroy(): void {
    this.clear();
    this.filter.destroy();
    this.container.destroy({ children: true });
  }

  private clear(): void {
    this.loadToken++;
    this.asset = null;
    this.tilesState = 'none';
    this.overview?.destroy(true);
    this.overview = null;
    this.tilesLayer.removeChildren().forEach((c) => c.destroy(true));
    this.bitmap?.close();
    this.bitmap = null;
    this.container.visible = false;
  }

  private async load(asset: string, bytes: Uint8Array): Promise<void> {
    this.clear();
    const token = this.loadToken;
    this.asset = asset;
    try {
      const bitmap = await decodeImage(bytes, asset);
      if (token !== this.loadToken) return bitmap.close();
      const scale = Math.min(1, OVERVIEW_MAX / Math.max(bitmap.width, bitmap.height));
      const small = await createImageBitmap(bitmap, {
        resizeWidth: Math.max(1, Math.round(bitmap.width * scale)),
        resizeHeight: Math.max(1, Math.round(bitmap.height * scale)),
        resizeQuality: 'high',
      });
      if (token !== this.loadToken) {
        bitmap.close();
        small.close();
        return;
      }
      this.bitmap = bitmap;
      const sprite = new Sprite(textureFrom(small, true));
      sprite.setSize(bitmap.width, bitmap.height);
      this.overview = sprite;
      this.rotated.addChildAt(sprite, 0);
      this.container.visible = true;
      this.updateLod();
      this.requestRender();
    } catch {
      // Nicht dekodierbares Bild: Karte bleibt ohne Hintergrund nutzbar.
      this.asset = null;
    }
  }

  private layout(cols: number, rows: number): void {
    const img = this.image;
    if (!img) return;
    const rot = rotationTransform(img.rotation, img.width, img.height);
    this.rotated.position.set(rot.x, rot.y);
    this.rotated.rotation = rot.angle;
    const s = CELL_PX / img.cellPx;
    this.container.scale.set(s);
    this.container.position.set(-img.originX * s, -img.originY * s);
    const r = visibleImageRect(img, cols, rows);
    this.mask.clear().rect(r.x, r.y, r.w, r.h).fill({ color: 0xffffff });
    const neutral = img.brightness === 1 && img.contrast === 0;
    if (neutral) {
      this.container.filters = [];
    } else {
      this.filter.reset();
      this.filter.brightness(img.brightness, false);
      this.filter.contrast(img.contrast, true);
      this.container.filters = [this.filter];
    }
    this.updateLod();
    this.requestRender();
  }

  /** Kacheln zeigen, wenn ein Bildpixel größer als ~1,5 Übersichtspixel dargestellt wird. */
  private updateLod(): void {
    const img = this.image;
    const bmp = this.bitmap;
    if (!img || !bmp || !this.overview) return;
    const overviewScale = Math.min(1, OVERVIEW_MAX / Math.max(bmp.width, bmp.height));
    const screenPerImagePx = this.zoom * (CELL_PX / img.cellPx);
    const needTiles = overviewScale < 1 && screenPerImagePx > overviewScale * 1.5;
    this.tilesLayer.visible = needTiles && this.tilesState === 'ready';
    if (needTiles && this.tilesState === 'none') void this.buildTiles();
  }

  private async buildTiles(): Promise<void> {
    const bmp = this.bitmap;
    if (!bmp) return;
    const token = this.loadToken;
    this.tilesState = 'loading';
    const sprites: Sprite[] = [];
    for (let y = 0; y < bmp.height; y += TILE) {
      for (let x = 0; x < bmp.width; x += TILE) {
        const w = Math.min(TILE, bmp.width - x);
        const h = Math.min(TILE, bmp.height - y);
        const piece = await createImageBitmap(bmp, x, y, w, h);
        if (token !== this.loadToken) {
          piece.close();
          sprites.forEach((s) => s.destroy(true));
          return;
        }
        const s = new Sprite(textureFrom(piece, true));
        s.position.set(x, y);
        s.cullable = true;
        sprites.push(s);
      }
    }
    this.tilesLayer.addChild(...sprites);
    this.tilesState = 'ready';
    this.updateLod();
    this.requestRender();
  }
}
