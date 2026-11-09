/**
 * PixiJS-Szene der Karte. Imperativ und ohne React: die UI schiebt Zustände hinein,
 * gerendert wird nur bei Änderungen (kein Dauer-Ticker) – spart CPU/GPU im Leerlauf.
 *
 * Ebenen (von unten): Hintergrundfarbe → Hintergrundbild → Boden → Raster → Wände/Objekte
 * (inkl. Kantenwände) → Dekoration → Gelände-Overlay → Bewegungsreichweite → Tokens →
 * Effekte → GM-Notizen → Nebel/Sicht und Lichtmarken → Overlay.
 * Bodenkacheln liegen in 16×16-Blöcken, die außerhalb des Sichtbereichs ausgeblendet werden.
 */
import 'pixi.js/unsafe-eval';
import {
  Application,
  Container,
  Culler,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import type { Camera } from '../core/camera';
import { CELL_PX, cellCenter, type Cell } from '../core/grid';
import { computeTerrainGrid, footprintSize } from '../editor/footprint';
import {
  layerState,
  type EdgeWall,
  type MapDocument,
  type ObjectLayerId,
  type PlacedObject,
} from '../storage/mapDocument';
import { BackgroundImageLayer } from './backgroundImage';
import { TokenLayer, type ConditionLabel } from './tokenLayer';
import { EffectLayer, type EffectVisual } from './effectLayer';
import { FogLayer, type FogMode, type LightMarker } from './fogLayer';
import { RENDERER_PREFERENCE } from './graphicsSupport';
import { ElementTextures, TEXTURE_PX_PER_CELL } from './textures';

export interface MapVisual {
  cols: number;
  rows: number;
  backgroundColor: string;
  grid: { visible: boolean; color: string; opacity: number };
}

export interface CellRectF {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OverlayState {
  hover: Cell | null;
  cursor: Cell | null;
  /** Punkte des Lineals (Start, Wegpunkte, Ende). */
  ruler: readonly Cell[];
  /** Vorschau der Formwerkzeuge. */
  preview?: readonly Cell[];
  /** Umriss für das Platzieren eines Objekts an der Mausposition. */
  placement?: CellRectF | null;
  /** Rahmen ausgewählter Objekte (in Feldern). */
  selection?: readonly CellRectF[];
  marquee?: CellRectF | null;
  /** Ausgewählte Kantenwände. */
  selectedWalls?: readonly SegmentF[];
  /** Vorschau beim Wandzeichnen (letzter Punkt → Zeiger) und bereits gesetzte Kette. */
  wallPreview?: readonly SegmentF[];
  /** Einrastpunkt unter dem Zeiger beim Wandzeichnen. */
  wallVertex?: { x: number; y: number } | null;
  /** Erreichbare Felder des ausgewählten Tokens (Restbewegung), unter den Tokens gezeichnet. */
  moveRange?: readonly Cell[];
  /** Größe des Tokens für die Reichweitenanzeige (Felder). */
  moveSize?: number;
  /** Geplanter bzw. gezogener Weg (Feldmitten der linken oberen Ecke). */
  movePath?: readonly Cell[];
  /** true = Weg übersteigt die Restbewegung (rot). */
  moveOver?: boolean;
  /** Token, das im Kampf am Zug ist (Rechteck in Feldern). */
  current?: CellRectF | null;
  /** Vom Effekt betroffene Tokens (Vorschau), hervorgehoben. */
  targets?: readonly CellRectF[];
  /** Nahkampfreichweiten ausgewählter Tokens (Rechtecke in Feldern). */
  reach?: readonly CellRectF[];
}

export interface SegmentF {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const HOVER_COLOR = 0xffffff;
const CURSOR_COLOR = 0x1a5fb4;
const RULER_COLOR = 0xc0392b;
const SELECT_COLOR = 0x2f7de1;
const PREVIEW_COLOR = 0x2f7de1;
/** Ab dieser Feldgröße auf dem Bildschirm (px) wird das Raster voll gezeichnet. */
const GRID_FADE_PX = 14;
const CHUNK = 16;

const DAMAGE_COLORS: Record<string, number> = {
  fire: 0xff6a12,
  acid: 0x7ac943,
  cold: 0x6fd3ff,
  lightning: 0xfff04a,
  poison: 0x4fbf3a,
  necrotic: 0x6a3d8a,
  radiant: 0xffe9a8,
  thunder: 0x5a7bd6,
  force: 0xc94adf,
  psychic: 0xe24a9c,
};

/** Darstellung der Kantenwände je Art/Zustand. */
/** Tinte der Umrisse (wie die Element-Grafiken). */
const INK = 0x2a1c11;

const WALL_STYLES: Record<string, { color: number; open?: boolean; marker?: number }> = {
  wall: { color: 0x7d6a55 },
  window: { color: 0xdcecef },
  'door:closed': { color: 0xe6d7b4 },
  'door:open': { color: 0xe6d7b4, open: true },
  'door:locked': { color: 0xe6d7b4, marker: 0xe3b832 },
  // Geheimtür: wie eine Mauer, in der GM-Ansicht mit violetter Marke
  'secret:closed': { color: 0x7d6a55, marker: 0x8a5ad8 },
  'secret:open': { color: 0x7d6a55, open: true, marker: 0x8a5ad8 },
  'secret:locked': { color: 0x7d6a55, marker: 0xe3b832 },
};

export function hexToNumber(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

/** Deckkraft der Rasterlinien abhängig vom Zoom – sehr kleine Felder blenden aus. */
export function gridAlpha(opacity: number, zoom: number): number {
  return opacity * Math.min(1, (CELL_PX * zoom) / GRID_FADE_PX);
}

/** Position/Skalierung/Drehung eines Objekt-Sprites (Mitte des Platzbedarfs). */
export function objectTransform(o: PlacedObject) {
  const s = footprintSize(o);
  const scale = CELL_PX / TEXTURE_PX_PER_CELL;
  return {
    x: (o.x + s.w / 2) * CELL_PX,
    y: (o.y + s.h / 2) * CELL_PX,
    rotation: (o.rotation * Math.PI) / 180,
    scaleX: scale * (o.flipX ? -1 : 1),
    scaleY: scale * (o.flipY ? -1 : 1),
  };
}

export class MapRenderer {
  private readonly world = new Container();
  private readonly background = new Graphics();
  private readonly floorLayer = new Container();
  private readonly grid = new Graphics();
  private readonly objectLayers: Record<ObjectLayerId, Container> = {
    walls: new Container(),
    decor: new Container(),
  };
  private readonly terrainLayer = new Container();
  private readonly terrainGfx = new Graphics();
  private readonly notesLayer = new Container();
  private readonly overlay = new Graphics();
  private readonly edgeWalls = new Graphics();
  private readonly rangeGfx = new Graphics();
  private readonly tokens: TokenLayer;
  private readonly effects = new EffectLayer();
  private readonly fog = new FogLayer();
  private readonly bgImage: BackgroundImageLayer;

  private readonly textures: ElementTextures;
  private map: MapVisual | null = null;
  private doc: MapDocument | null = null;
  private assets: ReadonlyMap<string, Uint8Array> = new Map();
  private floorSprites: (Sprite | null)[] = [];
  private floorChunks: Container[] = [];
  private floorRef: string[] | null = null;
  private objectSprites = new Map<string, { sprite: Sprite; obj: PlacedObject }>();
  private showTerrain = false;
  private camera: Camera = { x: 0, y: 0, zoom: 1 };
  private overlayState: OverlayState = { hover: null, cursor: null, ruler: [] };
  private frame = 0;
  private destroyed = false;

  private constructor(private readonly app: Application) {
    this.textures = new ElementTextures(() => this.refreshTextures());
    this.bgImage = new BackgroundImageLayer(() => this.requestRender());
    this.tokens = new TokenLayer(() => this.requestRender());
    this.terrainLayer.addChild(this.terrainGfx);
    // Kantenwände über allen Objekten der Wand-Ebene.
    this.edgeWalls.zIndex = 1_000_000;
    this.objectLayers.walls.addChild(this.edgeWalls);
    this.world.addChild(
      this.background,
      this.bgImage.container,
      this.floorLayer,
      this.grid,
      this.objectLayers.walls,
      this.objectLayers.decor,
      this.terrainLayer,
      this.rangeGfx,
      this.tokens.container,
      this.effects.container,
      this.notesLayer,
      this.fog.container,
      this.overlay,
    );
    this.objectLayers.walls.sortableChildren = true;
    this.objectLayers.decor.sortableChildren = true;
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
    const renderer = new MapRenderer(app);
    await renderer.textures.preload();
    host.appendChild(app.canvas);
    return renderer;
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

  /** Überträgt Inhalte des Dokuments (Boden, Objekte, Notizen, Gelände, Ebenen). */
  setDocument(doc: MapDocument, assets: ReadonlyMap<string, Uint8Array>): void {
    const prev = this.doc;
    const prevAssets = this.assets;
    this.doc = doc;
    this.assets = assets;
    this.setMap({
      cols: doc.grid.cols,
      rows: doc.grid.rows,
      backgroundColor: doc.background.color,
      grid: { visible: doc.grid.visible, color: doc.grid.color, opacity: doc.grid.opacity },
    });
    if (
      !prev ||
      prev.floor !== doc.floor ||
      prev.grid.cols !== doc.grid.cols ||
      prev.customElements !== doc.customElements
    ) {
      this.syncFloor(prev?.grid.cols !== doc.grid.cols || prev?.grid.rows !== doc.grid.rows);
    }
    if (!prev || prev.objects !== doc.objects || prev.customElements !== doc.customElements)
      this.syncObjects();
    if (!prev || prev.notes !== doc.notes) this.syncNotes();
    if (!prev || prev.walls !== doc.walls) this.drawEdgeWalls(doc.walls);
    if (!prev || prev.tokens !== doc.tokens || prevAssets !== assets)
      this.tokens.sync(doc.tokens, assets);
    if (
      !prev ||
      prev.background !== doc.background ||
      prev.grid !== doc.grid ||
      prevAssets !== assets
    ) {
      const img = doc.background.image;
      this.bgImage.set(img, img ? assets.get(img.asset) : undefined, doc.grid.cols, doc.grid.rows);
    }
    if (
      this.showTerrain &&
      (!prev ||
        prev.terrain !== doc.terrain ||
        prev.objects !== doc.objects ||
        prev.floor !== doc.floor ||
        prev.layers !== doc.layers)
    ) {
      this.drawTerrain();
    }
    this.floorLayer.visible = layerState(doc, 'floor').visible;
    this.objectLayers.walls.visible = layerState(doc, 'walls').visible;
    this.objectLayers.decor.visible = layerState(doc, 'decor').visible;
    this.notesLayer.visible = layerState(doc, 'gm').visible;
    this.tokens.container.visible = layerState(doc, 'tokens').visible;
    this.effects.container.visible = layerState(doc, 'effects').visible;
    this.requestRender();
  }

  setShowTerrain(show: boolean): void {
    this.showTerrain = show;
    this.terrainLayer.visible = show;
    if (show) this.drawTerrain();
    this.requestRender();
  }

  /** Dauerhafte Effekte und Vorschau (betroffene Felder berechnet die UI). */
  setEffects(items: readonly EffectVisual[]): void {
    this.effects.set(items, this.map?.cols ?? 1);
    this.requestRender();
  }

  /** Nebel/Sicht-Maske (null = keine Einschränkung). */
  setFog(mask: Uint8Array | null, mode: FogMode): void {
    this.fog.setMask(mask, this.map?.cols ?? 1, this.map?.rows ?? 1, mode);
    this.requestRender();
  }

  /** Lichtquellen-Marken (nur GM-Ansicht). */
  setLights(markers: readonly LightMarker[], feetPerCell: number): void {
    this.fog.setLights(markers, feetPerCell);
    this.requestRender();
  }

  /** Beschriftung der Zustands-Abzeichen (sprachabhängig). */
  setConditionLabel(fn: ConditionLabel): void {
    this.tokens.setConditionLabel(fn);
    this.requestRender();
  }

  setCamera(camera: Camera): void {
    const zoomChanged = camera.zoom !== this.camera.zoom;
    this.camera = camera;
    this.world.position.set(camera.x, camera.y);
    this.world.scale.set(camera.zoom);
    this.bgImage.setZoom(camera.zoom);
    this.effects.setZoom(camera.zoom);
    this.fog.setZoom(camera.zoom);
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
    this.bgImage.destroy();
    this.tokens.destroy();
    this.effects.destroy();
    this.fog.destroy();
    this.app.destroy(true, { children: true });
    this.textures.destroy();
  }

  private requestRender(): void {
    if (this.frame || this.destroyed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.destroyed) return;
      Culler.shared.cull(this.app.stage, this.app.renderer.screen);
      this.app.render();
    });
  }

  // ---------------------------------------------------------------- Inhalte

  private texture(id: string): Texture {
    return this.textures.get(id, this.doc?.customElements ?? [], this.assets);
  }

  /** Nachgeladene eigene Texturen einsetzen. */
  private refreshTextures(): void {
    if (!this.doc) return;
    this.floorRef = null;
    this.syncFloor(false);
    for (const { sprite, obj } of this.objectSprites.values())
      sprite.texture = this.texture(obj.element);
    this.requestRender();
  }

  private syncFloor(rebuild: boolean): void {
    const doc = this.doc;
    if (!doc) return;
    const { cols, rows } = doc.grid;
    if (rebuild || this.floorSprites.length !== cols * rows) {
      this.floorLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
      this.floorSprites = new Array<Sprite | null>(cols * rows).fill(null);
      this.floorChunks = [];
      const cx = Math.ceil(cols / CHUNK);
      const cy = Math.ceil(rows / CHUNK);
      for (let y = 0; y < cy; y++) {
        for (let x = 0; x < cx; x++) {
          const chunk = new Container();
          chunk.cullable = true;
          chunk.cullableChildren = false;
          chunk.cullArea = new Rectangle(
            x * CHUNK * CELL_PX,
            y * CHUNK * CELL_PX,
            CHUNK * CELL_PX,
            CHUNK * CELL_PX,
          );
          this.floorChunks.push(chunk);
          this.floorLayer.addChild(chunk);
        }
      }
      this.floorRef = null;
    }
    const prev = this.floorRef;
    const chunksPerRow = Math.ceil(cols / CHUNK);
    for (let i = 0; i < doc.floor.length; i++) {
      const id = doc.floor[i] ?? '';
      if (prev && prev[i] === id) continue;
      let sprite = this.floorSprites[i] ?? null;
      if (!id) {
        if (sprite) {
          sprite.destroy();
          this.floorSprites[i] = null;
        }
        continue;
      }
      const tex = this.texture(id);
      if (!sprite) {
        const x = i % cols;
        const y = (i - x) / cols;
        sprite = new Sprite(tex);
        sprite.position.set(x * CELL_PX, y * CELL_PX);
        sprite.setSize(CELL_PX, CELL_PX);
        this.floorChunks[Math.floor(y / CHUNK) * chunksPerRow + Math.floor(x / CHUNK)]?.addChild(
          sprite,
        );
        this.floorSprites[i] = sprite;
      } else {
        sprite.texture = tex;
        sprite.setSize(CELL_PX, CELL_PX);
      }
    }
    this.floorRef = doc.floor;
  }

  private syncObjects(): void {
    const doc = this.doc;
    if (!doc) return;
    const seen = new Set<string>();
    doc.objects.forEach((o, index) => {
      seen.add(o.id);
      const entry = this.objectSprites.get(o.id);
      if (entry && entry.obj === o) {
        entry.sprite.zIndex = index;
        return;
      }
      const sprite = entry?.sprite ?? new Sprite(this.texture(o.element));
      if (!entry) sprite.anchor.set(0.5);
      if (!entry || entry.obj.element !== o.element) sprite.texture = this.texture(o.element);
      const t = objectTransform(o);
      sprite.position.set(t.x, t.y);
      sprite.rotation = t.rotation;
      sprite.scale.set(t.scaleX, t.scaleY);
      sprite.zIndex = index;
      if (!entry || entry.obj.layer !== o.layer) this.objectLayers[o.layer].addChild(sprite);
      this.objectSprites.set(o.id, { sprite, obj: o });
    });
    for (const [id, { sprite }] of this.objectSprites) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.objectSprites.delete(id);
      }
    }
  }

  private syncNotes(): void {
    const doc = this.doc;
    if (!doc) return;
    this.notesLayer.removeChildren().forEach((c) => c.destroy());
    for (const n of doc.notes) {
      const s = new Sprite(this.textures.note);
      s.setSize(CELL_PX * 0.55, CELL_PX * 0.55);
      s.position.set(n.x * CELL_PX + CELL_PX * 0.42, n.y * CELL_PX + CELL_PX * 0.03);
      this.notesLayer.addChild(s);
    }
  }

  private drawTerrain(): void {
    const doc = this.doc;
    const g = this.terrainGfx;
    g.clear();
    // Höhen-Beschriftungen entfernen (Kind 0 ist die Grafik selbst).
    for (const child of this.terrainLayer.children.slice(1)) child.destroy();
    if (!doc) return;
    const { cols } = doc.grid;
    for (const [i, p] of computeTerrainGrid(doc)) {
      const x = (i % cols) * CELL_PX;
      const y = Math.floor(i / cols) * CELL_PX;
      if (p.blocksSight) g.rect(x, y, CELL_PX, CELL_PX).fill({ color: 0x000000, alpha: 0.35 });
      if (p.difficult) {
        for (let k = 1; k <= 3; k++) {
          const o = (k * CELL_PX) / 4;
          g.moveTo(x, y + o).lineTo(x + o, y);
          g.moveTo(x + o, y + CELL_PX).lineTo(x + CELL_PX, y + o);
        }
        g.stroke({ color: 0xd9a400, width: 3, alpha: 0.9 });
      }
      if (p.blocksMovement) {
        g.rect(x + 3, y + 3, CELL_PX - 6, CELL_PX - 6).stroke({
          color: 0xd0302a,
          width: 4,
          alpha: 0.9,
        });
      }
      if (p.cover) {
        const bars = p.cover === 'half' ? 1 : p.cover === 'threeQuarters' ? 2 : 3;
        for (let b = 0; b < bars; b++)
          g.rect(x + 6 + b * 8, y + CELL_PX - 20, 6, 14).fill({ color: 0x2f7de1 });
      }
      if (p.damage) {
        g.circle(x + CELL_PX - 12, y + 12, 8)
          .fill({ color: DAMAGE_COLORS[p.damage] ?? 0xffffff })
          .stroke({ color: 0x000000, width: 1.5 });
      }
      if (p.elevation) {
        const label = new Text({
          text: `${p.elevation > 0 ? '+' : ''}${p.elevation} ft`,
          style: {
            fontFamily: 'system-ui, sans-serif',
            fontSize: 15,
            fontWeight: '700',
            fill: 0xffffff,
            stroke: { color: 0x000000, width: 3 },
          },
        });
        label.anchor.set(0.5);
        label.position.set(x + CELL_PX / 2, y + CELL_PX / 2);
        this.terrainLayer.addChild(label);
      }
    }
  }

  // ---------------------------------------------------------------- Hintergrund & Raster

  /**
   * Kantenwände im Stil gedruckter Abenteuerkarten (Breite in Weltkoordinaten): Mauern als
   * dicker Tuschestrich mit hellerem Steinkern, Fenster mit Glas und Sprosse, Türen als helles
   * Türblatt (offen: aufgeschwenkt). Erst alle Umrisse, dann alle Kerne – so gehen
   * aneinanderstoßende Mauern nahtlos ineinander über.
   */
  private drawEdgeWalls(walls: readonly EdgeWall[]): void {
    const g = this.edgeWalls;
    g.clear();
    const W = CELL_PX * 0.16;
    const seg = (w: EdgeWall) =>
      g.moveTo(w.x1 * CELL_PX, w.y1 * CELL_PX).lineTo(w.x2 * CELL_PX, w.y2 * CELL_PX);
    const styleOf = (w: EdgeWall) =>
      WALL_STYLES[
        w.kind === 'door' || w.kind === 'secret' ? `${w.kind}:${w.state ?? 'closed'}` : w.kind
      ];
    const solid = (w: EdgeWall) => w.kind === 'wall' || w.kind === 'window' || w.kind === 'secret';

    // 1) Tuschumrisse aller Mauern und Fenster (Geheimtüren sehen aus wie Mauer)
    for (const w of walls) {
      if (!solid(w)) continue;
      const open = styleOf(w)?.open;
      seg(w).stroke({ color: INK, width: W + 6, cap: 'round', alpha: open ? 0.35 : 1 });
    }
    // 2) Kerne
    for (const w of walls) {
      const style = styleOf(w);
      if (!style || !solid(w)) continue;
      seg(w).stroke({
        color: style.color,
        width: W - 2,
        cap: 'round',
        alpha: style.open ? 0.5 : 1,
      });
      if (w.kind === 'window') seg(w).stroke({ color: INK, width: 2, alpha: 0.8 });
    }
    // 3) Türen: Türblatt als Rechteck, offen um 75° in den Raum geschwenkt
    for (const w of walls) {
      if (w.kind !== 'door') continue;
      const style = styleOf(w);
      if (!style) continue;
      const x1 = w.x1 * CELL_PX;
      const y1 = w.y1 * CELL_PX;
      const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) * CELL_PX;
      const base = Math.atan2(w.y2 - w.y1, w.x2 - w.x1);
      const angle = style.open ? base + (75 * Math.PI) / 180 : base;
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      const nx = -uy * (W * 0.55);
      const ny = ux * (W * 0.55);
      const inset = style.open ? 0 : len * 0.06;
      const ax = x1 + ux * inset;
      const ay = y1 + uy * inset;
      const bx = x1 + ux * (len - inset);
      const by = y1 + uy * (len - inset);
      if (style.open) {
        // Türöffnung bleibt als feine Schwelle sichtbar
        seg(w).stroke({ color: INK, width: 2, alpha: 0.5 });
      }
      g.poly([ax + nx, ay + ny, bx + nx, by + ny, bx - nx, by - ny, ax - nx, ay - ny])
        .fill({ color: style.color })
        .stroke({ color: INK, width: 3, join: 'round' });
      // Maserung des Türblatts
      g.moveTo(ax, ay).lineTo(bx, by).stroke({ color: INK, width: 1, alpha: 0.35 });
    }
    // 4) Marken (verschlossen, Geheimtür in der GM-Ansicht)
    for (const w of walls) {
      const style = styleOf(w);
      if (!style?.marker) continue;
      const mx = ((w.x1 + w.x2) / 2) * CELL_PX;
      const my = ((w.y1 + w.y2) / 2) * CELL_PX;
      g.circle(mx, my, W * 0.6)
        .fill({ color: style.marker })
        .stroke({ color: INK, width: 2 });
    }
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

  // ---------------------------------------------------------------- Overlay

  /** Bewegungsreichweite (Flächen unter den Tokens) und Nahkampfreichweite (gestrichelt). */
  private drawMoveRange(px: number): void {
    const g = this.rangeGfx;
    g.clear();
    const { moveRange, moveSize = 1, reach, movePath, moveOver } = this.overlayState;
    if (moveRange?.length) {
      // Jede erreichbare Position färbt den ganzen Platzbedarf.
      const cells = new Set<string>();
      for (const c of moveRange)
        for (let y = 0; y < moveSize; y++)
          for (let x = 0; x < moveSize; x++) cells.add(`${c.x + x},${c.y + y}`);
      for (const k of cells) {
        const [x = 0, y = 0] = k.split(',').map(Number);
        g.rect(x * CELL_PX, y * CELL_PX, CELL_PX, CELL_PX);
      }
      g.fill({ color: 0x2f7de1, alpha: 0.16 });
    }
    for (const r of reach ?? []) {
      g.rect(r.x * CELL_PX, r.y * CELL_PX, r.w * CELL_PX, r.h * CELL_PX).stroke({
        color: 0xc0392b,
        width: 2 * px,
        alpha: 0.7,
      });
    }
    if (movePath && movePath.length > 1) {
      const half = (moveSize * CELL_PX) / 2;
      const pts = movePath.map((c) => ({ x: c.x * CELL_PX + half, y: c.y * CELL_PX + half }));
      const trace = () => {
        g.moveTo(pts[0]?.x ?? 0, pts[0]?.y ?? 0);
        for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
      };
      const color = moveOver ? 0xd0302a : 0x1a5fb4;
      trace();
      g.stroke({ color: 0xffffff, width: 8 * px, alpha: 0.9, cap: 'round', join: 'round' });
      trace();
      g.stroke({ color, width: 4 * px, cap: 'round', join: 'round' });
      const end = pts[pts.length - 1];
      if (end)
        g.circle(end.x, end.y, 7 * px)
          .fill({ color })
          .stroke({ color: 0xffffff, width: 2 * px });
    }
  }

  private drawOverlay(): void {
    const g = this.overlay;
    const px = 1 / this.camera.zoom; // 1 Bildschirmpixel in Weltkoordinaten
    const { hover, cursor, ruler, preview, placement, selection, marquee } = this.overlayState;
    g.clear();
    this.drawMoveRange(px);

    if (hover) {
      g.rect(hover.x * CELL_PX, hover.y * CELL_PX, CELL_PX, CELL_PX).fill({
        color: HOVER_COLOR,
        alpha: 0.18,
      });
    }

    if (preview?.length) {
      for (const c of preview) g.rect(c.x * CELL_PX, c.y * CELL_PX, CELL_PX, CELL_PX);
      g.fill({ color: PREVIEW_COLOR, alpha: 0.3 });
    }

    if (placement) {
      g.rect(
        placement.x * CELL_PX,
        placement.y * CELL_PX,
        placement.w * CELL_PX,
        placement.h * CELL_PX,
      ).stroke({
        color: PREVIEW_COLOR,
        width: 2 * px,
        alpha: 0.9,
      });
    }

    const cur = this.overlayState.current;
    if (cur) {
      const pad = 5 * px;
      g.roundRect(
        cur.x * CELL_PX - pad,
        cur.y * CELL_PX - pad,
        cur.w * CELL_PX + 2 * pad,
        cur.h * CELL_PX + 2 * pad,
        10 * px,
      )
        .stroke({ color: 0x000000, width: 7 * px, alpha: 0.6 })
        .roundRect(
          cur.x * CELL_PX - pad,
          cur.y * CELL_PX - pad,
          cur.w * CELL_PX + 2 * pad,
          cur.h * CELL_PX + 2 * pad,
          10 * px,
        )
        .stroke({ color: 0xffc400, width: 4 * px });
    }

    for (const r of this.overlayState.targets ?? []) {
      g.roundRect(
        r.x * CELL_PX + 3 * px,
        r.y * CELL_PX + 3 * px,
        r.w * CELL_PX - 6 * px,
        r.h * CELL_PX - 6 * px,
        6 * px,
      ).stroke({
        color: 0xff8c00,
        width: 4 * px,
      });
    }

    for (const r of selection ?? []) {
      g.rect(
        r.x * CELL_PX - 2 * px,
        r.y * CELL_PX - 2 * px,
        r.w * CELL_PX + 4 * px,
        r.h * CELL_PX + 4 * px,
      ).stroke({
        color: SELECT_COLOR,
        width: 2.5 * px,
      });
    }

    if (marquee) {
      g.rect(marquee.x * CELL_PX, marquee.y * CELL_PX, marquee.w * CELL_PX, marquee.h * CELL_PX)
        .fill({ color: SELECT_COLOR, alpha: 0.12 })
        .stroke({ color: SELECT_COLOR, width: 1.5 * px });
    }

    const { selectedWalls, wallPreview, wallVertex } = this.overlayState;
    const seg = (s: SegmentF) =>
      g.moveTo(s.x1 * CELL_PX, s.y1 * CELL_PX).lineTo(s.x2 * CELL_PX, s.y2 * CELL_PX);
    for (const s of selectedWalls ?? []) {
      seg(s).stroke({
        color: SELECT_COLOR,
        width: CELL_PX * 0.14 + 6 * px,
        cap: 'round',
        alpha: 0.6,
      });
    }
    for (const s of wallPreview ?? []) {
      seg(s).stroke({ color: PREVIEW_COLOR, width: CELL_PX * 0.1, cap: 'round', alpha: 0.75 });
    }
    if (wallVertex) {
      g.circle(wallVertex.x * CELL_PX, wallVertex.y * CELL_PX, 6 * px)
        .fill({ color: 0xffffff })
        .stroke({ color: PREVIEW_COLOR, width: 2.5 * px });
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
          .stroke({ color: 0xffffff, width: 1.5 * px });
      }
    }

    if (cursor) {
      const inset = 2 * px;
      g.rect(
        cursor.x * CELL_PX + inset,
        cursor.y * CELL_PX + inset,
        CELL_PX - 2 * inset,
        CELL_PX - 2 * inset,
      ).stroke({
        color: CURSOR_COLOR,
        width: 3 * px,
      });
    }
  }
}
