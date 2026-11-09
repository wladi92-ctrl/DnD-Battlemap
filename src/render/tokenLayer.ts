/**
 * Darstellung der Tokens: eigenes Bild oder erzeugtes Standard-Porträt (bis es bereitsteht:
 * Scheibe in Teamfarbe mit Initialen), Ring,
 * Name, TP-Balken, Zustands-Abzeichen, eigene Marker, Blickrichtung sowie die Optik für
 * bewusstlos/tot/verborgen. Jedes Token ist ein eigener Container und wird nur neu gebaut,
 * wenn sich das Token-Objekt (oder sein Bild) ändert.
 */
import { Container, Graphics, ImageSource, Sprite, Text, Texture } from 'pixi.js';
import { CELL_PX } from '../core/grid';
import { baseName, portraitSvg } from '../data/portraits/portrait';
import { creatureTypeOf, SIZE_CELLS } from '../data/srd/creatures';
import { tokenStatus } from '../editor/tokens';
import type { Token } from '../storage/mapDocument';
import { decodeImage } from './backgroundImage';
import { rasterize, svgUrl } from './textures';

export function hexColor(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

/** Anfangsbuchstaben (max. 2) für Tokens ohne Bild; Nummer am Ende bleibt erhalten. */
export function initials(name: string): string {
  const num = /\s(\d+)$/.exec(name)?.[1];
  const words = name
    .replace(/\s\d+$/, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const letters =
    words.length >= 2
      ? (words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')
      : (words[0] ?? '?').slice(0, 2);
  return (num ? (letters[0] ?? '') + num : letters).toUpperCase();
}

/** Porträts werden mit 2 Feldern (256 px) gerastert – scharf auch bei großen Kreaturen. */
const PORTRAIT_CELLS = 2;

/** Gleiche Kreaturen teilen sich ein Standard-Porträt. */
export function portraitKey(t: Pick<Token, 'kind' | 'source' | 'name'>): string {
  return `${t.kind}|${t.source ?? ''}|${baseName(t.name)}`;
}

/** Lage eines Tokens in Weltkoordinaten (Tiny sitzt mittig im Feld). */
export function tokenBounds(t: Pick<Token, 'x' | 'y' | 'size'>) {
  const s = SIZE_CELLS[t.size];
  const off = s < 1 ? (1 - s) / 2 : 0;
  return { x: (t.x + off) * CELL_PX, y: (t.y + off) * CELL_PX, size: s * CELL_PX };
}

const TEXT_STYLE = {
  fontFamily: 'system-ui, sans-serif',
  fontWeight: '700' as const,
  fill: 0xffffff,
  stroke: { color: 0x000000, width: 4 },
};

export type ConditionLabel = (id: string) => string;

export class TokenLayer {
  readonly container = new Container();
  private entries = new Map<string, { node: Container; token: Token; image: Texture | null }>();
  private images = new Map<string, Promise<Texture | null>>();
  private textures = new Map<string, Texture>();
  /** Standard-Porträts je portraitKey (Tokens ohne eigenes Bild). */
  private portraits = new Map<string, Texture>();
  private portraitLoading = new Set<string>();
  private destroyed = false;
  private assets: ReadonlyMap<string, Uint8Array> = new Map();
  private label: ConditionLabel = (id) => id.slice(0, 3);

  constructor(private readonly onChange: () => void) {
    this.container.sortableChildren = true;
  }

  setConditionLabel(fn: ConditionLabel): void {
    this.label = fn;
    this.rebuildAll();
  }

  sync(tokens: readonly Token[], assets: ReadonlyMap<string, Uint8Array>): void {
    const assetsChanged = assets !== this.assets;
    this.assets = assets;
    if (assetsChanged) {
      // Entfernte Bilder vergessen; neue werden beim Bauen geladen.
      for (const key of [...this.images.keys()]) if (!assets.has(key)) this.dropImage(key);
    }
    const seen = new Set<string>();
    tokens.forEach((t, index) => {
      seen.add(t.id);
      const entry = this.entries.get(t.id);
      const tex = t.image
        ? (this.textures.get(t.image) ?? null)
        : (this.portraits.get(portraitKey(t)) ?? null);
      if (entry && entry.token === t && entry.image === tex) {
        entry.node.zIndex = index;
        return;
      }
      if (entry) entry.node.destroy({ children: true });
      const node = this.build(t, tex);
      node.zIndex = index;
      this.container.addChild(node);
      this.entries.set(t.id, { node, token: t, image: tex });
      if (t.image && !tex) this.loadImage(t.image);
      else if (!t.image && !tex) this.loadPortrait(t);
    });
    for (const [id, e] of this.entries) {
      if (!seen.has(id)) {
        e.node.destroy({ children: true });
        this.entries.delete(id);
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    for (const e of this.entries.values()) e.node.destroy({ children: true });
    this.entries.clear();
    for (const key of [...this.textures.keys()]) this.dropImage(key);
    for (const tex of this.portraits.values()) tex.destroy(true);
    this.portraits.clear();
  }

  /** Standard-Porträt erzeugen (einmal je Kreatur/Name), danach neu zeichnen. */
  private loadPortrait(t: Token) {
    const key = portraitKey(t);
    if (this.portraitLoading.has(key)) return;
    this.portraitLoading.add(key);
    const srdId = t.kind === 'creature' && t.source && !t.source.includes(':') ? t.source : null;
    void (srdId ? creatureTypeOf(srdId).catch(() => undefined) : Promise.resolve(undefined))
      .then((type) =>
        rasterize(
          svgUrl(
            portraitSvg({
              name: baseName(t.name),
              ...(type ? { type } : {}),
              kind: t.kind === 'pc' ? 'pc' : 'creature',
            }),
          ),
          PORTRAIT_CELLS,
          PORTRAIT_CELLS,
        ),
      )
      .then((tex) => {
        if (this.destroyed) return tex.destroy(true);
        this.portraits.set(key, tex);
        this.rebuildAll();
        this.onChange();
      })
      .catch(() => {
        // Ohne Porträt bleibt die Scheibe mit Initialen.
      });
  }

  private dropImage(key: string) {
    this.textures.get(key)?.destroy(true);
    this.textures.delete(key);
    this.images.delete(key);
  }

  private loadImage(path: string) {
    if (this.images.has(path)) return;
    const bytes = this.assets.get(path);
    if (!bytes) return;
    const p = decodeImage(bytes, path)
      .then((bitmap) => {
        const tex = new Texture({
          source: new ImageSource({ resource: bitmap, autoGenerateMipmaps: true }),
        });
        this.textures.set(path, tex);
        this.rebuildAll();
        this.onChange();
        return tex;
      })
      .catch(() => null);
    this.images.set(path, p);
  }

  private rebuildAll() {
    const list = [...this.entries.values()].map((e) => e.token);
    for (const e of this.entries.values()) e.node.destroy({ children: true });
    this.entries.clear();
    this.sync(list, this.assets);
  }

  private build(t: Token, image: Texture | null): Container {
    const { x, y, size } = tokenBounds(t);
    const node = new Container();
    node.position.set(x, y);
    const r = size / 2;
    const cx = r;
    const cy = r;
    const team = hexColor(t.color);
    const status = tokenStatus(t);
    const ring = Math.max(2.5, size * 0.07);

    const base = new Graphics();
    // Schatten
    base
      .circle(cx + size * 0.03, cy + size * 0.04, r * 0.94)
      .fill({ color: 0x000000, alpha: 0.35 });
    base.circle(cx, cy, r * 0.92).fill({ color: image ? 0x222222 : team });
    node.addChild(base);

    if (image) {
      const sprite = new Sprite(image);
      const d = r * 1.84 - ring;
      const scale = d / Math.min(image.width, image.height);
      sprite.anchor.set(0.5);
      sprite.scale.set(scale);
      sprite.position.set(cx, cy);
      const mask = new Graphics().circle(cx, cy, d / 2).fill({ color: 0xffffff });
      sprite.mask = mask;
      node.addChild(sprite, mask);
    } else {
      const text = new Text({
        text: initials(t.name),
        style: {
          ...TEXT_STYLE,
          fontSize: Math.max(8, size * 0.36),
          stroke: { color: 0x000000, width: 3 },
        },
      });
      text.anchor.set(0.5);
      text.position.set(cx, cy);
      node.addChild(text);
    }

    const ringG = new Graphics();
    ringG.circle(cx, cy, r * 0.92).stroke({ color: team, width: ring });
    ringG.circle(cx, cy, r * 0.92 + ring / 2).stroke({ color: 0x000000, width: 1, alpha: 0.6 });
    // Blickrichtung: kleines Dreieck am Ring (0° = oben/Norden)
    const a = ((t.facing - 90) * Math.PI) / 180;
    const tip = r * 0.92 + ring * 1.6;
    const side = r * 0.92;
    const spread = 0.22;
    ringG
      .poly([
        cx + Math.cos(a) * tip,
        cy + Math.sin(a) * tip,
        cx + Math.cos(a - spread) * side,
        cy + Math.sin(a - spread) * side,
        cx + Math.cos(a + spread) * side,
        cy + Math.sin(a + spread) * side,
      ])
      .fill({ color: team })
      .stroke({ color: 0x000000, width: 1 });
    node.addChild(ringG);

    // TP-Balken unter der Scheibe
    if (t.hp.max > 0 && status !== 'dead') {
      const w = size * 0.8;
      const h = Math.max(3, size * 0.08);
      const bx = cx - w / 2;
      const by = size - h * 0.4;
      const frac = Math.max(0, Math.min(1, t.hp.current / t.hp.max));
      const color = frac > 0.5 ? 0x3cb043 : frac > 0.25 ? 0xe3b832 : 0xd0302a;
      const bar = new Graphics();
      bar.rect(bx - 1, by - 1, w + 2, h + 2).fill({ color: 0x000000, alpha: 0.75 });
      bar.rect(bx, by, w * frac, h).fill({ color });
      if (t.hp.temp > 0) {
        const tf = Math.min(1, t.hp.temp / t.hp.max);
        bar.rect(bx, by - h * 0.55, w * tf, h * 0.45).fill({ color: 0x6fd3ff });
      }
      node.addChild(bar);
    }

    // Zustands-Abzeichen (rechts oben, im Uhrzeigersinn)
    const badges = [
      ...t.conditions.map((c) => ({ text: this.label(c), color: 0x6a3d8a })),
      ...t.markers.map((m) => ({ text: m.label.slice(0, 3), color: hexColor(m.color) })),
    ];
    const br = Math.max(5, size * 0.13);
    badges.slice(0, 8).forEach((b, i) => {
      const ang = -Math.PI / 2 + Math.PI / 4 + i * (Math.PI / 4.5);
      const bx = cx + Math.cos(ang) * r * 0.98;
      const by = cy + Math.sin(ang) * r * 0.98;
      const g = new Graphics()
        .circle(bx, by, br)
        .fill({ color: b.color })
        .stroke({ color: 0xffffff, width: 1.5 });
      const txt = new Text({
        text: b.text,
        style: { ...TEXT_STYLE, fontSize: br * 0.85, stroke: { color: 0x000000, width: 2 } },
      });
      txt.anchor.set(0.5);
      txt.position.set(bx, by);
      node.addChild(g, txt);
    });
    if (badges.length > 8) {
      const more = new Text({
        text: `+${badges.length - 8}`,
        style: { ...TEXT_STYLE, fontSize: br },
      });
      more.position.set(size * 0.02, size * 0.02);
      node.addChild(more);
    }

    // Name unter dem Token
    const label = new Text({
      text: t.name,
      style: {
        ...TEXT_STYLE,
        fontSize: Math.max(9, Math.min(18, CELL_PX * 0.2)),
        stroke: { color: 0x000000, width: 3 },
      },
    });
    label.anchor.set(0.5, 0);
    label.position.set(cx, size + 2);
    node.addChild(label);

    // Zustand
    if (status === 'dead') {
      const x = new Graphics();
      const k = r * 0.55;
      x.moveTo(cx - k, cy - k)
        .lineTo(cx + k, cy + k)
        .moveTo(cx + k, cy - k)
        .lineTo(cx - k, cy + k);
      x.stroke({ color: 0x000000, width: ring * 1.8, cap: 'round' });
      x.moveTo(cx - k, cy - k)
        .lineTo(cx + k, cy + k)
        .moveTo(cx + k, cy - k)
        .lineTo(cx - k, cy + k);
      x.stroke({ color: 0xd0302a, width: ring, cap: 'round' });
      node.addChild(x);
      node.alpha = 0.7;
    } else if (status === 'unconscious' || status === 'stable') {
      const z = new Text({
        text: status === 'stable' ? '♥' : 'z z',
        style: { ...TEXT_STYLE, fontSize: size * 0.3 },
      });
      z.anchor.set(0.5);
      z.position.set(cx, cy - r * 0.15);
      node.addChild(z);
      base.alpha = 0.6;
    }
    if (t.hidden) {
      node.alpha *= 0.45;
      const dash = new Graphics();
      const steps = 16;
      for (let i = 0; i < steps; i += 2) {
        const a0 = (i / steps) * Math.PI * 2;
        const a1 = ((i + 1) / steps) * Math.PI * 2;
        dash.arc(cx, cy, r * 1.02, a0, a1).stroke({ color: 0xffffff, width: 2 });
      }
      node.addChild(dash);
    }
    return node;
  }
}
