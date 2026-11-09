/**
 * Texturen der Elemente: eingebaute SVGs werden einmal in Canvas gerastert (128 px pro Feld),
 * eigene Bilder (PNG/SVG/…) aus den eingebetteten Bytes geladen. Alles lokal (data:/blob:).
 */
import { Texture } from 'pixi.js';
import { builtinElements, elementSvg } from '../data/elements';
import { mimeForAsset } from '../storage/assets';
import type { CustomElement } from '../storage/mapDocument';

export const TEXTURE_PX_PER_CELL = 128;

const MISSING_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="128" height="128">' +
  '<rect x="4" y="4" width="92" height="92" fill="#ff00ff" opacity="0.35" stroke="#ff00ff" stroke-width="4" stroke-dasharray="8 6"/>' +
  '<text x="50" y="66" font-size="48" text-anchor="middle" fill="#ff00ff" font-family="sans-serif">?</text></svg>';

export const NOTE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="128" height="128">' +
  '<path d="M22 14 h44 l16 16 v56 h-60z" fill="#ffe27a" stroke="#8a6a10" stroke-width="4"/>' +
  '<path d="M66 14 v16 h16" fill="#f2cc4a" stroke="#8a6a10" stroke-width="4"/>' +
  '<path d="M32 46 h38 M32 58 h38 M32 70 h26" stroke="#8a6a10" stroke-width="5" stroke-linecap="round"/></svg>';

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return img;
}

/** Rastert ein Bild auf ein Canvas der Zielgröße (SVG wird dabei scharf skaliert). */
async function rasterize(url: string, w: number, h: number): Promise<Texture> {
  const img = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * TEXTURE_PX_PER_CELL));
  canvas.height = Math.max(1, Math.round(h * TEXTURE_PX_PER_CELL));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas2D nicht verfügbar');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return Texture.from(canvas);
}

export function svgUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export class ElementTextures {
  private readonly cache = new Map<string, Texture>();
  private readonly loading = new Set<string>();
  missing: Texture = Texture.WHITE;
  note: Texture = Texture.WHITE;

  /** @param onLoaded wird aufgerufen, wenn eine nachgeladene Textur bereitsteht */
  constructor(private readonly onLoaded: () => void) {}

  async preload(): Promise<void> {
    const [missing, note] = await Promise.all([
      rasterize(svgUrl(MISSING_SVG), 1, 1),
      rasterize(svgUrl(NOTE_SVG), 1, 1),
    ]);
    this.missing = missing;
    this.note = note;
    await Promise.all(
      builtinElements.map(async (e) => {
        const svg = elementSvg(e.id);
        if (svg) this.cache.set(e.id, await rasterize(svgUrl(svg), e.w, e.h));
      }),
    );
  }

  /** Textur für ein Element; eigene Elemente werden bei Bedarf asynchron geladen. */
  get(
    id: string,
    custom: readonly CustomElement[],
    assets: ReadonlyMap<string, Uint8Array>,
  ): Texture {
    const cached = this.cache.get(id);
    if (cached) return cached;
    const el = custom.find((c) => c.id === id);
    const bytes = el && assets.get(el.asset);
    if (el && bytes && !this.loading.has(id)) {
      this.loading.add(id);
      const url = URL.createObjectURL(new Blob([bytes], { type: mimeForAsset(el.asset) }));
      rasterize(url, el.w, el.h)
        .then((tex) => {
          this.cache.set(id, tex);
          this.onLoaded();
        })
        .catch(() => undefined)
        .finally(() => URL.revokeObjectURL(url));
    }
    return this.missing;
  }

  has(id: string): boolean {
    return this.cache.has(id);
  }

  destroy(): void {
    for (const t of this.cache.values()) t.destroy(true);
    this.cache.clear();
  }
}
