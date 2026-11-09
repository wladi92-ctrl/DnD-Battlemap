/**
 * Flächeneffekte auf der Karte: Umgebung (Wände, feste Felder), betroffene Felder und Ziele,
 * Vorlagen aus der Bibliothek, umkehrbare Operationen und der Rundenablauf dauerhafter Effekte.
 */
import {
  aoeCells,
  footprintAffected,
  type AoeEnvironment,
  type AoePlacement,
  type AoeShape,
  type AoeSpec,
  type CoverageRule,
  type WallMode,
} from '../core/aoe';
import type { Point } from '../core/grid';
import { SIZE_CELLS, type Creature } from '../data/srd/creatures';
import { damageDice, type EffectSource } from '../data/srd/effects';
import {
  layerState,
  type DamageType,
  type EffectTrigger,
  type MapDocument,
  type MapEffect,
  type SaveAbility,
  type Token,
} from '../storage/mapDocument';
import { computeTerrainGrid } from './footprint';
import { newId, type OpResult } from './ops';
import { isEmptyPatch, replaceField, type DocPatch } from './patch';

const nothing: OpResult = { ok: false, reason: 'nothing' };
const done = (patch: DocPatch): OpResult => (isEmptyPatch(patch) ? nothing : { ok: true, patch });

/**
 * Farben je Schadensart: farbenblindfreundlich gewählt und zusätzlich mit eigenem Muster
 * (Schraffurwinkel/Punkte), damit die Art nicht nur über die Farbe erkennbar ist.
 */
export const DAMAGE_STYLE: Record<DamageType | 'none', { color: string; pattern: EffectPattern }> =
  {
    fire: { color: '#e66100', pattern: 'diag' },
    cold: { color: '#5da5da', pattern: 'horizontal' },
    lightning: { color: '#f2c200', pattern: 'zigzag' },
    thunder: { color: '#4b6cc2', pattern: 'vertical' },
    acid: { color: '#7bbf3a', pattern: 'dots' },
    poison: { color: '#2e8b57', pattern: 'cross' },
    necrotic: { color: '#6a3d9a', pattern: 'antidiag' },
    radiant: { color: '#ffd96a', pattern: 'rays' },
    force: { color: '#c94adf', pattern: 'grid' },
    psychic: { color: '#e7298a', pattern: 'rings' },
    bludgeoning: { color: '#8c6d4f', pattern: 'diag' },
    piercing: { color: '#7f7f7f', pattern: 'dots' },
    slashing: { color: '#b2182b', pattern: 'antidiag' },
    none: { color: '#1f78b4', pattern: 'none' },
  };
export type EffectPattern =
  | 'none'
  | 'diag'
  | 'antidiag'
  | 'horizontal'
  | 'vertical'
  | 'cross'
  | 'grid'
  | 'dots'
  | 'zigzag'
  | 'rays'
  | 'rings';

export function effectStyle(damageType?: DamageType) {
  return DAMAGE_STYLE[damageType ?? 'none'];
}

/** Vorlage zum Platzieren (aus der Bibliothek oder ad hoc). */
export interface EffectTemplate {
  name: string;
  shape: AoeShape;
  size: number;
  width?: number;
  color: string;
  damageType?: DamageType;
  damage?: string;
  save?: { ability: SaveAbility; dc: number; half: boolean };
  wallMode: WallMode;
  /** Dauer in Runden; 0 = sofort (nicht dauerhaft), null = unbegrenzt. */
  rounds: number | null;
  concentration: boolean;
  trigger: EffectTrigger;
  source?: string;
}

/** Vorlage aus einem Bibliothekseintrag (Grad für die Schadensskalierung, Standard-SG 13). */
export function templateFromSource(src: EffectSource, level?: number, dc = 13): EffectTemplate {
  const dice = damageDice(src, level);
  const persistent = src.rounds === null || (src.rounds ?? 0) > 0;
  const style = effectStyle(src.damage?.type);
  return {
    name: src.name,
    shape: src.shape,
    size: src.size,
    ...(src.width ? { width: src.width } : {}),
    color: style.color,
    ...(src.damage ? { damageType: src.damage.type } : {}),
    ...(dice ? { damage: dice } : {}),
    ...(src.save
      ? {
          save: {
            ability: src.save.ability,
            dc: src.save.dc ?? dc,
            half: src.save.success === 'half',
          },
        }
      : {}),
    wallMode: src.spreads ? 'spread' : 'line',
    rounds: persistent ? src.rounds : 0,
    concentration: src.concentration,
    // Dauerhafte Zonen mit Rettungswurf lösen typischerweise beim Betreten/Zugbeginn aus.
    trigger: persistent && src.save ? 'both' : 'none',
    source: src.id,
  };
}

/** Wände/Felder, die Effekte blockieren (nur sichtbare Wand-Ebene, wie bei der Bewegung). */
export function effectEnvironment(doc: MapDocument): AoeEnvironment {
  const terrain = computeTerrainGrid(doc);
  return {
    cols: doc.grid.cols,
    rows: doc.grid.rows,
    feetPerCell: doc.grid.feetPerCell,
    walls: layerState(doc, 'walls').visible ? doc.walls : [],
    solid: (i) => {
      const t = terrain.get(i);
      return Boolean(t?.blocksMovement && t.blocksSight);
    },
  };
}

export function tokenFootprint(t: Pick<Token, 'x' | 'y' | 'size'>) {
  return { x: t.x, y: t.y, size: Math.max(1, SIZE_CELLS[t.size]) };
}

export function specOf(e: Pick<MapEffect, 'shape' | 'size' | 'width'>): AoeSpec {
  return { shape: e.shape, size: e.size, ...(e.width ? { width: e.width } : {}) };
}

/** Platzierung eines Effekts; Auren folgen ihrem Träger. */
export function placementOf(doc: MapDocument, e: MapEffect): AoePlacement {
  const carrier = e.attachedTo ? doc.tokens.find((t) => t.id === e.attachedTo) : undefined;
  if (carrier) {
    const f = tokenFootprint(carrier);
    return {
      origin: { x: f.x + f.size / 2, y: f.y + f.size / 2 },
      angle: e.angle,
      ...(e.shape === 'emanation' ? { around: f } : {}),
    };
  }
  return {
    origin: e.origin,
    angle: e.angle,
    ...(e.cells ? { cells: e.cells.map(([x, y]) => ({ x, y })) } : {}),
  };
}

/**
 * Betroffene Felder eines dauerhaften Effekts. Zwischengespeichert, solange sich Effekt, Wände,
 * Gelände, Raster, Träger und Flächenregel nicht ändern.
 */
const cellCache = new WeakMap<MapEffect, { key: unknown[]; cells: Set<number> }>();
export function effectCells(
  doc: MapDocument,
  e: MapEffect,
  rule: CoverageRule,
  env?: AoeEnvironment,
): Set<number> {
  const carrier = e.attachedTo ? doc.tokens.find((t) => t.id === e.attachedTo) : undefined;
  const key = [
    doc.walls,
    doc.objects,
    doc.floor,
    doc.terrain,
    doc.grid,
    doc.layers,
    rule,
    carrier?.x,
    carrier?.y,
    carrier?.size,
  ];
  const hit = cellCache.get(e);
  if (hit && hit.key.length === key.length && hit.key.every((v, i) => v === key[i]))
    return hit.cells;
  const cells = aoeCells(specOf(e), placementOf(doc, e), env ?? effectEnvironment(doc), {
    rule,
    wallMode: e.wallMode,
  });
  cellCache.set(e, { key, cells });
  return cells;
}

/** Tokens, von denen mindestens ein Feld betroffen ist (Reihenfolge wie im Dokument). */
export function affectedTokens(
  doc: MapDocument,
  cells: ReadonlySet<number>,
  exclude?: string,
): Token[] {
  const { cols, rows } = doc.grid;
  return doc.tokens.filter(
    (t) => t.id !== exclude && footprintAffected(cells, tokenFootprint(t), cols, rows),
  );
}

// ------------------------------------------------------------------ Operationen

const locked = (doc: MapDocument) => layerState(doc, 'effects').locked;

export function effectFromTemplate(
  t: EffectTemplate,
  origin: Point,
  angle: number,
  extra: { attachedTo?: string; cells?: [number, number][] } = {},
): MapEffect {
  return {
    id: newId(),
    name: t.name,
    shape: t.shape,
    size: t.size,
    ...(t.width ? { width: t.width } : {}),
    origin: { x: origin.x, y: origin.y },
    angle: (((Math.round(angle * 1000) / 1000) % 360) + 360) % 360,
    ...(extra.cells ? { cells: extra.cells } : {}),
    ...(extra.attachedTo ? { attachedTo: extra.attachedTo } : {}),
    color: t.color,
    ...(t.damageType ? { damageType: t.damageType } : {}),
    wallMode: t.wallMode,
    rounds: t.rounds,
    concentration: t.concentration,
    trigger: t.trigger,
    ...(t.save ? { save: t.save } : {}),
    ...(t.damage ? { damage: t.damage } : {}),
    ...(t.source ? { source: t.source } : {}),
    hidden: false,
  };
}

export function addEffect(doc: MapDocument, e: MapEffect): OpResult {
  if (locked(doc)) return { ok: false, reason: 'locked' };
  return done(replaceField(doc, 'effects', [...doc.effects, e]));
}

export function updateEffects(
  doc: MapDocument,
  ids: ReadonlySet<string>,
  fn: (e: MapEffect) => MapEffect,
): OpResult {
  if (!ids.size) return nothing;
  if (locked(doc)) return { ok: false, reason: 'locked' };
  let changed = false;
  const effects = doc.effects.map((e) => {
    if (!ids.has(e.id)) return e;
    const next = fn(e);
    if (next !== e && JSON.stringify(next) !== JSON.stringify(e)) {
      changed = true;
      return next;
    }
    return e;
  });
  return changed ? done(replaceField(doc, 'effects', effects)) : nothing;
}

export function deleteEffects(doc: MapDocument, ids: ReadonlySet<string>): OpResult {
  if (!doc.effects.some((e) => ids.has(e.id))) return nothing;
  if (locked(doc)) return { ok: false, reason: 'locked' };
  return done(
    replaceField(
      doc,
      'effects',
      doc.effects.filter((e) => !ids.has(e.id)),
    ),
  );
}

/** Verschiebt Ursprünge (und freie Flächen) ausgewählter, nicht angehefteter Effekte. */
export function moveEffects(
  doc: MapDocument,
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
): OpResult {
  if (dx === 0 && dy === 0) return nothing;
  const { cols, rows } = doc.grid;
  return updateEffects(doc, ids, (e) => {
    if (e.attachedTo) return e;
    const origin = {
      x: Math.min(cols, Math.max(0, e.origin.x + dx)),
      y: Math.min(rows, Math.max(0, e.origin.y + dy)),
    };
    const cells = e.cells
      ?.map(([x, y]) => [x + Math.round(dx), y + Math.round(dy)] as [number, number])
      .filter(([x, y]) => x >= 0 && y >= 0 && x < cols && y < rows);
    return { ...e, origin, ...(cells ? { cells } : {}) };
  });
}

/**
 * Neue Runde: Rundenzähler dauerhafter Effekte herunterzählen; abgelaufene werden entfernt.
 * Liefert die Namen der abgelaufenen Effekte.
 */
export function tickEffects(doc: MapDocument): { result: OpResult; expired: string[] } {
  const expired: string[] = [];
  const effects: MapEffect[] = [];
  let changed = false;
  for (const e of doc.effects) {
    if (e.rounds === null) {
      effects.push(e);
      continue;
    }
    changed = true;
    if (e.rounds <= 1) expired.push(e.name);
    else effects.push({ ...e, rounds: e.rounds - 1 });
  }
  if (!changed) return { result: nothing, expired };
  return { result: done(replaceField(doc, 'effects', effects)), expired };
}

// ------------------------------------------------------------------ Auslöser

export interface TriggerHit {
  effect: MapEffect;
  tokens: Token[];
}

/** Effekte, die ein Token durch seine Bewegung neu betritt (Auslöser "betreten"). */
export function effectsEntered(
  before: MapDocument,
  after: MapDocument,
  tokenId: string,
  rule: CoverageRule,
): MapEffect[] {
  const t0 = before.tokens.find((t) => t.id === tokenId);
  const t1 = after.tokens.find((t) => t.id === tokenId);
  if (!t0 || !t1) return [];
  const { cols, rows } = after.grid;
  return after.effects.filter((e) => {
    if (e.trigger !== 'enter' && e.trigger !== 'both') return false;
    if (e.attachedTo === tokenId) return false;
    const b = before.effects.find((x) => x.id === e.id);
    const wasIn = b
      ? footprintAffected(effectCells(before, b, rule), tokenFootprint(t0), cols, rows)
      : false;
    const isIn = footprintAffected(effectCells(after, e, rule), tokenFootprint(t1), cols, rows);
    return isIn && !wasIn;
  });
}

/** Zu Rundenbeginn: Kreaturen in Effekten mit Auslöser "Zugbeginn". */
export function turnStartHits(doc: MapDocument, rule: CoverageRule): TriggerHit[] {
  return doc.effects
    .filter((e) => e.trigger === 'turnStart' || e.trigger === 'both')
    .map((e) => ({
      effect: e,
      tokens: affectedTokens(doc, effectCells(doc, e, rule), e.attachedTo),
    }))
    .filter((h) => h.tokens.length > 0);
}

// ------------------------------------------------------------------ Rettungswürfe

/** Rettungswurfbonus einer Kreatur (Übung laut Statblock, sonst Attributsmodifikator). */
export function saveBonus(c: Creature | undefined, ability: SaveAbility): number {
  if (!c) return 0;
  const given = c.saves[ability];
  if (typeof given === 'number') return given;
  const idx = ['str', 'dex', 'con', 'int', 'wis', 'cha'].indexOf(ability);
  return Math.floor(((c.abilities[idx] ?? 10) - 10) / 2);
}

export type DamageResponse = 'normal' | 'resistant' | 'immune' | 'vulnerable';

/**
 * Reaktion einer Kreatur auf eine Schadensart laut Statblock. Nur eindeutige Einträge zählen
 * (z. B. "fire"); bedingte wie "bludgeoning ... from nonmagical attacks" werden nicht
 * automatisch angewendet.
 */
export function damageResponse(
  c: Creature | undefined,
  type: DamageType | undefined,
): DamageResponse {
  if (!c || !type) return 'normal';
  const has = (list: string[]) => list.some((x) => x.trim().toLowerCase() === type);
  if (has(c.immune)) return 'immune';
  if (has(c.resist)) return 'resistant';
  if (has(c.vulnerable)) return 'vulnerable';
  return 'normal';
}

/** Endgültiger Schaden: halbiert bei Erfolg (falls vorgesehen), dann Resistenz/Immunität/Anfälligkeit. */
export function finalDamage(
  total: number,
  saved: boolean,
  halfOnSave: boolean,
  response: DamageResponse = 'normal',
): number {
  let d = Math.max(0, Math.floor(total));
  if (saved) d = halfOnSave ? Math.floor(d / 2) : 0;
  if (response === 'immune') return 0;
  if (response === 'resistant') return Math.floor(d / 2);
  if (response === 'vulnerable') return d * 2;
  return d;
}
