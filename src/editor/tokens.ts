/**
 * Token-Operationen (rein, als umkehrbare Patches) und Regeln für Trefferpunkte,
 * Todesrettungswürfe, Platzierung und Bewegung.
 */
import type { DiagonalRule } from '../core/distance';
import type { Cell, Point } from '../core/grid';
import {
  opportunityAttackers,
  pathTo,
  reachable,
  type Body,
  type MoveEnvironment,
  type Reach,
} from '../core/movement';
import { movementBlocked } from '../core/walls';
import { SIZE_CELLS, type Creature, type SizeCategory } from '../data/srd/creatures';
import { layerState, type MapDocument, type Team, type Token } from '../storage/mapDocument';
import { computeTerrainGrid } from './footprint';
import { newId, type OpResult } from './ops';
import { isEmptyPatch, replaceField, type DocPatch } from './patch';

const nothing: OpResult = { ok: false, reason: 'nothing' };
const done = (patch: DocPatch): OpResult => (isEmptyPatch(patch) ? nothing : { ok: true, patch });

export const TEAM_COLORS: Record<Team, string> = {
  player: '#2f7de1',
  ally: '#2e9e5b',
  enemy: '#c0392b',
  neutral: '#8a8f96',
};

/** Belegte Kantenlänge in Feldern (für Wege/Platzierung mindestens 1). */
export function tokenCells(t: Pick<Token, 'size'>): number {
  return Math.max(1, SIZE_CELLS[t.size]);
}

export function isHostile(a: Team, b: Team): boolean {
  const side = (t: Team) => (t === 'enemy' ? 'e' : t === 'neutral' ? 'n' : 'p');
  const sa = side(a);
  const sb = side(b);
  return sa !== 'n' && sb !== 'n' && sa !== sb;
}

export type TokenStatus = 'ok' | 'unconscious' | 'stable' | 'dead';

/** Zustand nach Trefferpunkten: Kreaturen sterben bei 0 HP, Spielercharaktere fallen um. */
export function tokenStatus(t: Token): TokenStatus {
  if (t.hp.current > 0) return 'ok';
  if (t.kind !== 'pc') return 'dead';
  if (t.deathSaves.failure >= 3) return 'dead';
  if (t.deathSaves.success >= 3) return 'stable';
  return 'unconscious';
}

const withCondition = (conds: string[], id: string, on: boolean) =>
  on ? (conds.includes(id) ? conds : [...conds, id]) : conds.filter((c) => c !== id);

/**
 * Schaden nach SRD 5.1: zuerst temporäre TP. Bei 0 TP: Kreaturen tot, Spielercharaktere
 * bewusstlos. Schaden bei 0 TP = ein Fehlschlag (kritisch: zwei). Bleibt nach dem Fall auf 0
 * so viel Schaden übrig wie das TP-Maximum, stirbt der Charakter sofort.
 */
export function damageToken(t: Token, amount: number, critical = false): Token {
  const dmg = Math.max(0, Math.round(amount));
  if (dmg === 0) return t;
  const absorbed = Math.min(t.hp.temp, dmg);
  const rest = dmg - absorbed;
  const temp = t.hp.temp - absorbed;
  if (t.hp.current <= 0) {
    if (t.kind !== 'pc' || rest === 0) return { ...t, hp: { ...t.hp, temp } };
    const failure = rest >= t.hp.max ? 3 : Math.min(3, t.deathSaves.failure + (critical ? 2 : 1));
    return { ...t, hp: { ...t.hp, temp }, deathSaves: { ...t.deathSaves, failure } };
  }
  const current = t.hp.current - rest;
  if (current > 0) return { ...t, hp: { ...t.hp, temp, current } };
  const overflow = -current;
  if (t.kind !== 'pc') return { ...t, hp: { ...t.hp, temp, current: 0 } };
  return {
    ...t,
    hp: { ...t.hp, temp, current: 0 },
    deathSaves: { success: 0, failure: overflow >= t.hp.max ? 3 : 0 },
    conditions: withCondition(t.conditions, 'unconscious', true),
  };
}

/** Heilung: maximal bis zum TP-Maximum; aus 0 TP zurück → Todesrettungswürfe zurücksetzen. */
export function healToken(t: Token, amount: number): Token {
  const heal = Math.max(0, Math.round(amount));
  if (heal === 0 || tokenStatus(t) === 'dead') return t;
  const wasDown = t.hp.current <= 0;
  const current = Math.min(t.hp.max, Math.max(0, t.hp.current) + heal);
  return {
    ...t,
    hp: { ...t.hp, current },
    ...(wasDown
      ? {
          deathSaves: { success: 0, failure: 0 },
          conditions: withCondition(t.conditions, 'unconscious', false),
        }
      : {}),
  };
}

/** Temporäre TP addieren sich nicht – der höhere Wert gilt. */
export function setTempHp(t: Token, amount: number): Token {
  const temp = Math.max(0, Math.round(amount));
  return temp === t.hp.temp ? t : { ...t, hp: { ...t.hp, temp: Math.max(t.hp.temp, temp) } };
}

/** Todesrettungswurf eintragen (Erfolg/Fehlschlag), mit 3 Erfolgen stabil. */
export function recordDeathSave(t: Token, success: boolean): Token {
  if (t.kind !== 'pc' || t.hp.current > 0) return t;
  const ds = { ...t.deathSaves };
  if (success) ds.success = Math.min(3, ds.success + 1);
  else ds.failure = Math.min(3, ds.failure + 1);
  return { ...t, deathSaves: ds };
}

// ------------------------------------------------------------------ Erzeugen

export interface TokenTemplate {
  name: string;
  kind: Token['kind'];
  source?: string;
  size: SizeCategory;
  team: Team;
  color?: string;
  image?: string;
  hpMax: number;
  ac: number;
  speed: number;
  reach: number;
  initiativeBonus: number;
  passivePerception: number;
  darkvision: number;
  pc?: Token['pc'];
}

export function templateFromCreature(c: Creature, team: Team = 'enemy'): TokenTemplate {
  const dex = c.abilities[1] ?? 10;
  return {
    name: c.name,
    kind: 'creature',
    source: c.id,
    size: c.size,
    team,
    hpMax: c.hp,
    ac: c.ac,
    speed: c.speed.walk ?? 0,
    reach: c.reach,
    initiativeBonus: Math.floor((dex - 10) / 2),
    passivePerception: c.senses.passive ?? 10,
    darkvision: c.senses.darkvision ?? 0,
  };
}

export function tokenFromTemplate(t: TokenTemplate, name: string, at: Cell): Token {
  return {
    id: newId(),
    name,
    kind: t.kind,
    ...(t.source ? { source: t.source } : {}),
    size: t.size,
    x: at.x,
    y: at.y,
    team: t.team,
    color: t.color ?? TEAM_COLORS[t.team],
    ...(t.image ? { image: t.image } : {}),
    hp: { current: t.hpMax, max: t.hpMax, temp: 0 },
    ac: t.ac,
    speed: t.speed,
    reach: t.reach,
    initiativeBonus: t.initiativeBonus,
    passivePerception: t.passivePerception,
    darkvision: t.darkvision,
    conditions: [],
    markers: [],
    deathSaves: { success: 0, failure: 0 },
    hidden: false,
    facing: 0,
    movementUsed: 0,
    actionsUsed: { action: false, bonus: false, reaction: false },
    ...(t.pc ? { pc: t.pc } : {}),
  };
}

/** Freie Positionen spiralförmig um `at`, auf der Karte und ohne Überschneidung. */
export function freePositions(
  doc: MapDocument,
  size: number,
  at: Cell,
  count: number,
  ignore = new Set<string>(),
): Cell[] {
  const { cols, rows } = doc.grid;
  const taken = new Set<number>();
  for (const t of doc.tokens) {
    if (ignore.has(t.id)) continue;
    const n = tokenCells(t);
    for (let y = Math.floor(t.y); y < t.y + n; y++)
      for (let x = Math.floor(t.x); x < t.x + n; x++) taken.add(y * cols + x);
  }
  const terrain = computeTerrainGrid(doc);
  const ok = (x: number, y: number) => {
    if (x < 0 || y < 0 || x + size > cols || y + size > rows) return false;
    for (let yy = y; yy < y + size; yy++) {
      for (let xx = x; xx < x + size; xx++) {
        const i = yy * cols + xx;
        if (taken.has(i) || terrain.get(i)?.blocksMovement) return false;
      }
    }
    return true;
  };
  const out: Cell[] = [];
  const maxRadius = Math.max(cols, rows);
  for (let r = 0; r <= maxRadius && out.length < count; r++) {
    for (let dy = -r; dy <= r && out.length < count; dy += 1) {
      for (let dx = -r; dx <= r && out.length < count; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = at.x + dx * size;
        const y = at.y + dy * size;
        if (!ok(x, y)) continue;
        out.push({ x, y });
        for (let yy = y; yy < y + size; yy++)
          for (let xx = x; xx < x + size; xx++) taken.add(yy * cols + xx);
      }
    }
  }
  return out;
}

/** Nächste freie Nummern für "Name N" (bestehende Tokens berücksichtigt). */
export function numberedNames(doc: MapDocument, base: string, count: number): string[] {
  const used = new Set<number>();
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: (\\d+))?$`);
  let plainExists = false;
  for (const t of doc.tokens) {
    const m = re.exec(t.name);
    if (!m) continue;
    if (m[1]) used.add(Number(m[1]));
    else plainExists = true;
  }
  if (count === 1 && !plainExists && used.size === 0) return [base];
  const out: string[] = [];
  for (let n = 1; out.length < count; n++) if (!used.has(n)) out.push(`${base} ${n}`);
  return out;
}

/** Setzt `count` Tokens (durchnummeriert) möglichst nah an `at`. */
export function spawnTokens(
  doc: MapDocument,
  template: TokenTemplate,
  at: Cell,
  count: number,
): { result: OpResult; ids: string[] } {
  if (layerState(doc, 'tokens').locked) return { result: { ok: false, reason: 'locked' }, ids: [] };
  const n = Math.max(1, Math.min(50, Math.round(count)));
  const positions = freePositions(doc, tokenCells(template), at, n);
  if (!positions.length) return { result: { ok: false, reason: 'outside' }, ids: [] };
  const names = numberedNames(doc, template.name, positions.length);
  const added = positions.map((p, i) => tokenFromTemplate(template, names[i] ?? template.name, p));
  return {
    result: done(replaceField(doc, 'tokens', [...doc.tokens, ...added])),
    ids: added.map((t) => t.id),
  };
}

// ------------------------------------------------------------------ Ändern

export function updateTokens(
  doc: MapDocument,
  ids: ReadonlySet<string>,
  fn: (t: Token) => Token,
): OpResult {
  if (!ids.size) return nothing;
  if (layerState(doc, 'tokens').locked) return { ok: false, reason: 'locked' };
  let changed = false;
  const tokens = doc.tokens.map((t) => {
    if (!ids.has(t.id)) return t;
    const next = fn(t);
    if (next !== t && JSON.stringify(next) !== JSON.stringify(t)) {
      changed = true;
      return next;
    }
    return t;
  });
  return changed ? done(replaceField(doc, 'tokens', tokens)) : nothing;
}

export function deleteTokens(doc: MapDocument, ids: ReadonlySet<string>): OpResult {
  if (layerState(doc, 'tokens').locked) return { ok: false, reason: 'locked' };
  const tokens = doc.tokens.filter((t) => !ids.has(t.id));
  return tokens.length === doc.tokens.length ? nothing : done(replaceField(doc, 'tokens', tokens));
}

export function toggleCondition(
  doc: MapDocument,
  ids: ReadonlySet<string>,
  condition: string,
): OpResult {
  const sel = doc.tokens.filter((t) => ids.has(t.id));
  const on = !sel.every((t) => t.conditions.includes(condition));
  return updateTokens(doc, ids, (t) => ({
    ...t,
    conditions: withCondition(t.conditions, condition, on),
  }));
}

export function duplicateTokens(
  doc: MapDocument,
  ids: ReadonlySet<string>,
): { result: OpResult; ids: string[] } {
  if (layerState(doc, 'tokens').locked) return { result: { ok: false, reason: 'locked' }, ids: [] };
  let work = doc;
  const newIds: string[] = [];
  for (const t of doc.tokens.filter((x) => ids.has(x.id))) {
    const base = t.name.replace(/ \d+$/, '');
    const [pos] = freePositions(work, tokenCells(t), { x: t.x, y: t.y }, 1);
    if (!pos) continue;
    const [name] = numberedNames(work, base, 2).filter((nm) => nm !== t.name);
    const copy: Token = {
      ...structuredClone(t),
      id: newId(),
      name: name ?? base,
      x: pos.x,
      y: pos.y,
    };
    work = { ...work, tokens: [...work.tokens, copy] };
    newIds.push(copy.id);
  }
  return {
    result: newIds.length ? done(replaceField(doc, 'tokens', work.tokens)) : nothing,
    ids: newIds,
  };
}

/** Verschiebt Tokens gemeinsam ohne Bewegungskosten (Spielleitung/Mehrfachauswahl). */
export function shiftTokens(
  doc: MapDocument,
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
): OpResult {
  if (dx === 0 && dy === 0) return nothing;
  const sel = doc.tokens.filter((t) => ids.has(t.id));
  if (!sel.length) return nothing;
  if (layerState(doc, 'tokens').locked) return { ok: false, reason: 'locked' };
  // Gemeinsam begrenzen, damit die Aufstellung erhalten bleibt.
  const cdx = Math.min(
    ...sel.map((t) => doc.grid.cols - tokenCells(t) - t.x),
    Math.max(...sel.map((t) => -t.x), dx),
  );
  const cdy = Math.min(
    ...sel.map((t) => doc.grid.rows - tokenCells(t) - t.y),
    Math.max(...sel.map((t) => -t.y), dy),
  );
  const rx = Math.round(cdx);
  const ry = Math.round(cdy);
  return updateTokens(doc, ids, (t) => (rx || ry ? { ...t, x: t.x + rx, y: t.y + ry } : t));
}

/** Gruppe bilden (gleiche groupId) bzw. auflösen. */
export function groupTokens(doc: MapDocument, ids: ReadonlySet<string>, group: boolean): OpResult {
  const groupId = newId();
  return updateTokens(doc, ids, (t) => {
    if (group) return { ...t, groupId };
    const { groupId: _g, ...rest } = t;
    return rest;
  });
}

/** Alle Mitglieder der Gruppen der ausgewählten Tokens. */
export function expandGroups(doc: MapDocument, ids: ReadonlySet<string>): Set<string> {
  const groups = new Set(
    doc.tokens.filter((t) => ids.has(t.id) && t.groupId).map((t) => t.groupId),
  );
  return new Set(
    doc.tokens
      .filter((t) => ids.has(t.id) || (t.groupId && groups.has(t.groupId)))
      .map((t) => t.id),
  );
}

/** Neue Runde: Bewegung und Aktionen aller Tokens zurücksetzen. */
export function newRound(doc: MapDocument): OpResult {
  return updateTokens(doc, new Set(doc.tokens.map((t) => t.id)), (t) => ({
    ...t,
    movementUsed: 0,
    actionsUsed: { action: false, bonus: false, reaction: false },
  }));
}

// ------------------------------------------------------------------ Bewegung

/** Token unter einem Punkt (in Feldern), oberstes zuerst; ausgeblendete/gesperrte Ebene → keins. */
export function tokensAt(doc: MapDocument, p: Point): Token[] {
  const st = layerState(doc, 'tokens');
  if (!st.visible || st.locked) return [];
  return doc.tokens
    .filter((t) => {
      const s = SIZE_CELLS[t.size];
      const off = s < 1 ? (1 - s) / 2 : 0; // Tiny sitzt mittig im Feld
      return p.x >= t.x + off && p.x < t.x + off + s && p.y >= t.y + off && p.y < t.y + off + s;
    })
    .reverse();
}

/** Bewegungsumgebung für ein Token: Gelände, Kantenwände, andere Figuren. */
export function moveEnvironment(doc: MapDocument, mover: Token): MoveEnvironment {
  const { cols, rows } = doc.grid;
  const terrain = computeTerrainGrid(doc);
  const occ = new Map<number, 'pass' | 'block'>();
  const sizeRank = (s: SizeCategory) =>
    ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'].indexOf(s);
  for (const t of doc.tokens) {
    if (t.id === mover.id || tokenStatus(t) === 'dead') continue;
    // Feinde blockieren – außer bei mindestens zwei Größenkategorien Unterschied (SRD).
    const sizeGap = Math.abs(sizeRank(t.size) - sizeRank(mover.size)) >= 2;
    const kind = isHostile(t.team, mover.team) && !sizeGap ? 'block' : 'pass';
    const n = tokenCells(t);
    for (let y = Math.floor(t.y); y < t.y + n; y++) {
      for (let x = Math.floor(t.x); x < t.x + n; x++) {
        if (x >= 0 && y >= 0 && x < cols && y < rows) occ.set(y * cols + x, kind);
      }
    }
  }
  const walls = layerState(doc, 'walls').visible ? doc.walls : [];
  return {
    cols,
    rows,
    blocked: (i) => Boolean(terrain.get(i)?.blocksMovement),
    difficult: (i) => Boolean(terrain.get(i)?.difficult),
    edgeBlocked: (a, b) => movementBlocked(walls, a, b),
    occupant: (i) => occ.get(i) ?? 'free',
  };
}

/** Restbewegung eines Tokens und erreichbare Positionen. */
export function tokenReach(
  doc: MapDocument,
  token: Token,
  rule: DiagonalRule,
  budgetOverride?: number,
): Reach {
  const budget = budgetOverride ?? Math.max(0, token.speed - token.movementUsed);
  return reachable(
    moveEnvironment(doc, token),
    { x: Math.floor(token.x), y: Math.floor(token.y) },
    {
      size: tokenCells(token),
      budgetFeet: budget,
      feetPerCell: doc.grid.feetPerCell,
      rule,
    },
  );
}

export interface MoveOutcome {
  result: OpResult;
  /** Kosten in ft (null = außerhalb der Reichweite / kein Weg). */
  cost: number | null;
  path: Cell[] | null;
  /** IDs feindlicher Tokens, die einen Gelegenheitsangriff erhalten. */
  opportunity: string[];
}

/**
 * Bewegt ein Token an `to`. Liegt das Ziel in Reichweite, wird der kürzeste Weg genommen und
 * die Bewegung verbucht; sonst wird (Spielleitung darf alles) ohne Kosten versetzt.
 */
export function moveToken(doc: MapDocument, id: string, to: Cell, rule: DiagonalRule): MoveOutcome {
  const token = doc.tokens.find((t) => t.id === id);
  if (!token) return { result: nothing, cost: null, path: null, opportunity: [] };
  const n = tokenCells(token);
  const target = {
    x: Math.min(doc.grid.cols - n, Math.max(0, to.x)),
    y: Math.min(doc.grid.rows - n, Math.max(0, to.y)),
  };
  if (target.x === token.x && target.y === token.y)
    return { result: nothing, cost: 0, path: [target], opportunity: [] };
  // Großzügiges Budget: Weg auch jenseits der Restbewegung finden (Kosten werden angezeigt).
  const reach = tokenReach(doc, token, rule, 10_000);
  const index = target.y * doc.grid.cols + target.x;
  const path = reach.canEnd.has(index) ? pathTo(reach, target) : null;
  const cost = path ? (reach.cost.get(index) ?? null) : null;
  const bodies: Body[] = doc.tokens.map((t) => ({
    id: t.id,
    x: t.x,
    y: t.y,
    size: tokenCells(t),
    reachFeet: t.reach,
    hostileTo: (other) => {
      const o = doc.tokens.find((x) => x.id === other);
      return Boolean(o && isHostile(t.team, o.team) && tokenStatus(t) === 'ok');
    },
  }));
  const mover = bodies.find((b) => b.id === id) as Body;
  const opportunity = path ? opportunityAttackers(mover, bodies, path, doc.grid.feetPerCell) : [];
  const result = updateTokens(doc, new Set([id]), (t) => ({
    ...t,
    x: target.x,
    y: target.y,
    movementUsed: t.movementUsed + (cost ?? 0),
  }));
  return { result, cost, path, opportunity };
}
