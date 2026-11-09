/**
 * Nebel, Licht und Sicht auf der Karte: Operationen (umkehrbare Patches), Berechnung der
 * Spielermaske und das für Spieler gefilterte Dokument der Spieleransicht.
 */
import type { Cell } from '../core/grid';
import {
  decodeRuns,
  encodeRuns,
  lightLevels,
  MASK_VISIBLE,
  playerMask,
  visibleCells,
  type LightSource,
  type VisionEnvironment,
} from '../core/vision';
import {
  layerState,
  type LightingState,
  type MapDocument,
  type MapLight,
  type Token,
} from '../storage/mapDocument';
import { tokenFootprint } from './effects';
import { computeTerrainGrid } from './footprint';
import { newId, type OpResult } from './ops';
import { isEmptyPatch, replaceField, type DocPatch } from './patch';
import { tokenStatus } from './tokens';

const nothing: OpResult = { ok: false, reason: 'nothing' };
const done = (patch: DocPatch): OpResult => (isEmptyPatch(patch) ? nothing : { ok: true, patch });

/** Suchradius der Sicht in ft (Leistungsgrenze; ganze Räume bis 200 ft sind abgedeckt). */
export const VISION_RANGE_FEET = 300;

// ------------------------------------------------------------------ Nebel

export function revealedMask(doc: MapDocument): Uint8Array {
  return decodeRuns(doc.fog.revealed, doc.grid.cols * doc.grid.rows);
}

/** Felder aufdecken (reveal = true) oder verdecken. */
export function revealCells(doc: MapDocument, cells: readonly Cell[], reveal: boolean): OpResult {
  const { cols, rows } = doc.grid;
  const mask = revealedMask(doc);
  let changed = false;
  for (const c of cells) {
    if (c.x < 0 || c.y < 0 || c.x >= cols || c.y >= rows) continue;
    const i = c.y * cols + c.x;
    const v = reveal ? 1 : 0;
    if (mask[i] !== v) {
      mask[i] = v;
      changed = true;
    }
  }
  return changed
    ? done(replaceField(doc, 'fog', { ...doc.fog, revealed: encodeRuns(mask) }))
    : nothing;
}

export function revealAll(doc: MapDocument, reveal: boolean): OpResult {
  const size = doc.grid.cols * doc.grid.rows;
  const revealed = reveal ? [0, size] : [];
  const same =
    revealed.length === doc.fog.revealed.length &&
    revealed.every((v, i) => v === doc.fog.revealed[i]);
  return same ? nothing : done(replaceField(doc, 'fog', { ...doc.fog, revealed }));
}

export function setFogEnabled(doc: MapDocument, enabled: boolean): OpResult {
  return enabled === doc.fog.enabled
    ? nothing
    : done(replaceField(doc, 'fog', { ...doc.fog, enabled }));
}

export function setLighting(doc: MapDocument, changes: Partial<LightingState>): OpResult {
  const next = { ...doc.lighting, ...changes };
  return next.enabled === doc.lighting.enabled && next.ambient === doc.lighting.ambient
    ? nothing
    : done(replaceField(doc, 'lighting', next));
}

/** Felder innerhalb eines Polygons (Feldmitte im Polygon; Eckpunkte in Feldkoordinaten). */
export function cellsInPolygon(
  points: readonly { x: number; y: number }[],
  cols: number,
  rows: number,
): Cell[] {
  if (points.length < 3) return [];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const out: Cell[] = [];
  for (
    let y = Math.max(0, Math.floor(Math.min(...ys)));
    y <= Math.min(rows - 1, Math.ceil(Math.max(...ys)));
    y++
  ) {
    for (
      let x = Math.max(0, Math.floor(Math.min(...xs)));
      x <= Math.min(cols - 1, Math.ceil(Math.max(...xs)));
      x++
    ) {
      const px = x + 0.5;
      const py = y + 0.5;
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i] as { x: number; y: number };
        const b = points[j] as { x: number; y: number };
        if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x)
          inside = !inside;
      }
      if (inside) out.push({ x, y });
    }
  }
  return out;
}

// ------------------------------------------------------------------ Lichtquellen

export interface LightPreset {
  id: string;
  bright: number;
  dim: number;
  color: string;
  darkness?: boolean;
}

/** Lichtquellen nach SRD 5.1 (Radien hell/dämmrig in ft, dämmrig = Gesamtradius). */
export const LIGHT_PRESETS: readonly LightPreset[] = [
  { id: 'candle', bright: 5, dim: 10, color: '#ffd27a' },
  { id: 'torch', bright: 20, dim: 40, color: '#ffb347' },
  { id: 'lamp', bright: 15, dim: 45, color: '#ffd27a' },
  { id: 'hoodedLantern', bright: 30, dim: 60, color: '#ffe08a' },
  { id: 'lightSpell', bright: 20, dim: 40, color: '#fff4c2' },
  { id: 'daylight', bright: 60, dim: 120, color: '#fffbe6' },
  { id: 'darkness', bright: 0, dim: 15, color: '#000000', darkness: true },
];

export function lightFromPreset(
  p: LightPreset,
  name: string,
  x: number,
  y: number,
  attachedTo?: string,
): MapLight {
  return {
    id: newId(),
    name,
    x,
    y,
    bright: p.bright,
    dim: p.dim,
    color: p.color,
    darkness: Boolean(p.darkness),
    enabled: true,
    ...(attachedTo ? { attachedTo } : {}),
  };
}

export function addLight(doc: MapDocument, l: MapLight): OpResult {
  return done(replaceField(doc, 'lights', [...doc.lights, l]));
}

export function updateLights(
  doc: MapDocument,
  ids: ReadonlySet<string>,
  fn: (l: MapLight) => MapLight,
): OpResult {
  let changed = false;
  const lights = doc.lights.map((l) => {
    if (!ids.has(l.id)) return l;
    const n = fn(l);
    if (JSON.stringify(n) !== JSON.stringify(l)) {
      changed = true;
      return n;
    }
    return l;
  });
  return changed ? done(replaceField(doc, 'lights', lights)) : nothing;
}

export function deleteLights(doc: MapDocument, ids: ReadonlySet<string>): OpResult {
  return doc.lights.some((l) => ids.has(l.id))
    ? done(
        replaceField(
          doc,
          'lights',
          doc.lights.filter((l) => !ids.has(l.id)),
        ),
      )
    : nothing;
}

export function moveLights(
  doc: MapDocument,
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
): OpResult {
  if (!dx && !dy) return nothing;
  const { cols, rows } = doc.grid;
  return updateLights(doc, ids, (l) =>
    l.attachedTo
      ? l
      : {
          ...l,
          x: Math.min(cols, Math.max(0, l.x + dx)),
          y: Math.min(rows, Math.max(0, l.y + dy)),
        },
  );
}

/** Mittelpunkt einer Lichtquelle (getragene folgen ihrem Token). */
export function lightPosition(doc: MapDocument, l: MapLight): { x: number; y: number } {
  const t = l.attachedTo ? doc.tokens.find((x) => x.id === l.attachedTo) : undefined;
  if (!t) return { x: l.x, y: l.y };
  const f = tokenFootprint(t);
  return { x: f.x + f.size / 2, y: f.y + f.size / 2 };
}

// ------------------------------------------------------------------ Sicht

/** Sichtumgebung: Wände (Fenster/offene Türen lassen Sicht durch), undurchsichtige Felder. */
export function visionEnvironment(doc: MapDocument): VisionEnvironment {
  const terrain = computeTerrainGrid(doc);
  return {
    cols: doc.grid.cols,
    rows: doc.grid.rows,
    feetPerCell: doc.grid.feetPerCell,
    walls: layerState(doc, 'walls').visible ? doc.walls : [],
    solid: (i) => Boolean(terrain.get(i)?.blocksSight),
  };
}

/** Figuren, deren Sicht die Spieler teilen: Spielercharaktere, die sehen können. */
export function playerViewers(doc: MapDocument): Token[] {
  return doc.tokens.filter(
    (t) =>
      t.team === 'player' &&
      tokenStatus(t) === 'ok' &&
      !t.conditions.includes('unconscious') &&
      !t.conditions.includes('blinded'),
  );
}

export interface VisionResult {
  levels: Uint8Array;
  /** Aktuell von Spielerfiguren gesehen. */
  visible: Uint8Array;
  /** 0 = verborgen, 1 = erkundet, 2 = sichtbar (siehe core/vision). */
  mask: Uint8Array;
  /** Neue erkundete Felder (Lauflängen) – null, wenn unverändert. */
  explored: number[] | null;
}

let cache: { key: unknown[]; result: VisionResult } | null = null;

/** Sicht/Licht/Nebel für die Spieler (zwischengespeichert, solange sich nichts Relevantes ändert). */
export function computeVision(doc: MapDocument): VisionResult {
  const viewers = playerViewers(doc);
  const key = [
    doc.grid,
    doc.walls,
    doc.objects,
    doc.floor,
    doc.terrain,
    doc.layers,
    doc.fog,
    doc.lighting,
    doc.lights,
    doc.explored,
    ...doc.tokens.flatMap((t) => [
      t.id,
      t.x,
      t.y,
      t.size,
      t.team,
      t.darkvision,
      t.conditions,
      t.hp.current,
      t.deathSaves.failure,
    ]),
  ];
  if (cache && cache.key.length === key.length && cache.key.every((v, i) => v === key[i]))
    return cache.result;
  const size = doc.grid.cols * doc.grid.rows;
  const env = visionEnvironment(doc);
  const lights: LightSource[] = doc.lights
    .filter((l) => l.enabled)
    .map((l) => ({ ...lightPosition(doc, l), bright: l.bright, dim: l.dim, darkness: l.darkness }));
  const levels = lightLevels(env, lights, doc.lighting.ambient);
  const visible = new Uint8Array(size);
  if (doc.lighting.enabled) {
    for (const t of viewers) {
      const f = tokenFootprint(t);
      visibleCells(
        env,
        { x: f.x + f.size / 2, y: f.y + f.size / 2, darkvision: t.darkvision },
        levels,
        VISION_RANGE_FEET,
        visible,
      );
    }
  }
  const explored = decodeRuns(doc.explored, size);
  let grew = false;
  if (doc.lighting.enabled) {
    for (let i = 0; i < size; i++) {
      if (visible[i] && !explored[i]) {
        explored[i] = 1;
        grew = true;
      }
    }
  }
  const mask = playerMask(size, {
    fogEnabled: doc.fog.enabled,
    revealed: revealedMask(doc),
    visionEnabled: doc.lighting.enabled,
    visible,
    explored,
  });
  const result: VisionResult = {
    levels,
    visible,
    mask,
    explored: grew ? encodeRuns(explored) : null,
  };
  cache = { key, result };
  return result;
}

/** Sind Spieler-Einschränkungen aktiv (Nebel oder dynamische Sicht)? */
export function restrictsPlayers(doc: MapDocument): boolean {
  return doc.fog.enabled || doc.lighting.enabled;
}

/**
 * Dokument für die Spieleransicht: keine GM-Notizen, keine verborgenen Tokens/Effekte, Tokens
 * nur auf aktuell sichtbaren Feldern, Geheimtüren erscheinen als Wand (geöffnet als Tür).
 */
export function playerDocument(doc: MapDocument, mask: Uint8Array): MapDocument {
  const { cols, rows } = doc.grid;
  const seen = (t: Token) => {
    const f = tokenFootprint(t);
    for (let y = Math.floor(f.y); y < f.y + f.size; y++) {
      for (let x = Math.floor(f.x); x < f.x + f.size; x++) {
        if (x >= 0 && y >= 0 && x < cols && y < rows && mask[y * cols + x] === MASK_VISIBLE)
          return true;
      }
    }
    return false;
  };
  const tokens = doc.tokens.filter((t) => !t.hidden && seen(t));
  const tokenIds = new Set(tokens.map((t) => t.id));
  return {
    ...doc,
    layers: doc.layers.map((l) => (l.id === 'gm' ? { ...l, visible: false } : l)),
    notes: [],
    tokens,
    effects: doc.effects
      .filter((e) => !e.hidden)
      .map((e) => (e.attachedTo && !tokenIds.has(e.attachedTo) ? { ...e, hidden: true } : e))
      .filter((e) => !e.hidden),
    walls: doc.walls.map((w) =>
      w.kind === 'secret'
        ? w.state === 'open'
          ? { ...w, kind: 'door' as const, state: 'open' as const }
          : { id: w.id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, kind: 'wall' as const }
        : w,
    ),
    combat: null,
    combatLog: [],
  };
}
