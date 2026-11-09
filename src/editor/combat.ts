/**
 * Kampf-Management: Initiative-Reihenfolge, Runden und Züge (umkehrbare Patches).
 *
 * Regeln/Annahmen:
 * - Reihenfolge: höhere Initiative zuerst; Gleichstand je nach Regel: 'bonus' = höherer
 *   Initiativebonus (≈ Geschicklichkeit), dann Zufall; 'players' = Spielercharaktere vor
 *   anderen, dann Bonus, dann Zufall. Ohne Wert stehen Teilnehmer am Ende.
 * - Zu Beginn des eigenen Zuges werden Bewegung und Aktion/Bonusaktion/Reaktion des Tokens
 *   zurückgesetzt (SRD: Reaktion erneuert sich zu Beginn des eigenen Zuges).
 * - Beim Rundenwechsel zählen dauerhafte Effekte eine Runde herunter.
 * - Verzögerte Teilnehmer werden übersprungen, bis sie „jetzt handeln“; tote Kreaturen
 *   werden optional übersprungen.
 */
import { cryptoRng, type Rng } from '../core/dice';
import {
  type CombatEntry,
  type CombatState,
  type MapDocument,
  type Token,
} from '../storage/mapDocument';
import { tickEffects } from './effects';
import { newId, type OpResult } from './ops';
import { isEmptyPatch, mergePatches, replaceField, type DocPatch } from './patch';
import { tokenStatus, updateTokens } from './tokens';

export type TieRule = 'bonus' | 'players';
export const TIE_RULES: readonly TieRule[] = ['bonus', 'players'];

export interface TurnOptions {
  skipDead: boolean;
}

const nothing: OpResult = { ok: false, reason: 'nothing' };
const done = (patch: DocPatch): OpResult => (isEmptyPatch(patch) ? nothing : { ok: true, patch });

const tokenOf = (doc: MapDocument, e: CombatEntry): Token | undefined =>
  e.tokenId ? doc.tokens.find((t) => t.id === e.tokenId) : undefined;

/** Vergleich zweier Teilnehmer (negativ = a zuerst). */
export function compareEntries(
  doc: MapDocument,
  a: CombatEntry,
  b: CombatEntry,
  rule: TieRule,
): number {
  if (a.initiative === null || b.initiative === null) {
    if (a.initiative === b.initiative) return 0;
    return a.initiative === null ? 1 : -1;
  }
  if (a.initiative !== b.initiative) return b.initiative - a.initiative;
  if (rule === 'players') {
    const pa = tokenOf(doc, a)?.team === 'player' ? 1 : 0;
    const pb = tokenOf(doc, b)?.team === 'player' ? 1 : 0;
    if (pa !== pb) return pb - pa;
  }
  if (a.bonus !== b.bonus) return b.bonus - a.bonus;
  return b.tiebreak - a.tiebreak;
}

/**
 * Sortiert. Während des Kampfes folgt der aktuelle Zug seinem Teilnehmer; in der
 * Vorbereitung steht immer der Erste der Reihenfolge vorne.
 */
export function sorted(doc: MapDocument, c: CombatState, rule: TieRule): CombatState {
  const current = c.entries[c.turn]?.id;
  const entries = [...c.entries].sort((a, b) => compareEntries(doc, a, b, rule));
  const turn = c.started
    ? Math.max(
        0,
        entries.findIndex((e) => e.id === current),
      )
    : 0;
  return { ...c, entries, turn };
}

function entryFor(t: Token, rng: Rng): CombatEntry {
  return {
    id: newId(),
    tokenId: t.id,
    name: t.name,
    initiative: null,
    bonus: t.initiativeBonus,
    tiebreak: rng(1000),
    delayed: false,
  };
}

/** Kampf beginnen (Runde 1) mit den angegebenen Tokens. */
export function startCombat(
  doc: MapDocument,
  tokenIds: readonly string[],
  rng: Rng = cryptoRng,
): OpResult {
  if (doc.combat) return nothing;
  const tokens = doc.tokens.filter((t) => tokenIds.includes(t.id));
  if (!tokens.length) return nothing;
  return done(
    replaceField(doc, 'combat', {
      started: false,
      round: 1,
      turn: 0,
      entries: tokens.map((t) => entryFor(t, rng)),
    }),
  );
}

export function endCombat(doc: MapDocument): OpResult {
  return doc.combat ? done(replaceField(doc, 'combat', null)) : nothing;
}

/** Tokens (noch nicht beteiligt) hinzufügen; sie stehen ohne Initiative am Ende. */
export function addCombatants(
  doc: MapDocument,
  tokenIds: readonly string[],
  rng: Rng = cryptoRng,
): OpResult {
  const c = doc.combat;
  if (!c) return nothing;
  const present = new Set(c.entries.map((e) => e.tokenId));
  const added = doc.tokens
    .filter((t) => tokenIds.includes(t.id) && !present.has(t.id))
    .map((t) => entryFor(t, rng));
  if (!added.length) return nothing;
  return done(replaceField(doc, 'combat', { ...c, entries: [...c.entries, ...added] }));
}

/** Eintrag ohne Token (z. B. Hortaktion bei Initiative 20, Umgebungseffekt). */
export function addCustomEntry(
  doc: MapDocument,
  name: string,
  initiative: number | null,
  rule: TieRule,
): OpResult {
  const c = doc.combat;
  const n = name.trim().slice(0, 120);
  if (!c || !n) return nothing;
  const entry: CombatEntry = {
    id: newId(),
    name: n,
    initiative,
    bonus: 0,
    tiebreak: 0,
    delayed: false,
  };
  return done(
    replaceField(doc, 'combat', sorted(doc, { ...c, entries: [...c.entries, entry] }, rule)),
  );
}

export function removeEntry(doc: MapDocument, entryId: string): OpResult {
  const c = doc.combat;
  if (!c) return nothing;
  const idx = c.entries.findIndex((e) => e.id === entryId);
  if (idx < 0) return nothing;
  const entries = c.entries.filter((e) => e.id !== entryId);
  if (!entries.length) return done(replaceField(doc, 'combat', null));
  // Entfernt man einen Teilnehmer vor dem aktuellen, rückt der Zeiger mit.
  let turn = idx < c.turn ? c.turn - 1 : c.turn;
  if (turn >= entries.length) turn = 0;
  return done(replaceField(doc, 'combat', { ...c, entries, turn }));
}

/** Initiative setzen (null = löschen); in der Vorbereitung wird automatisch sortiert. */
export function setInitiative(
  doc: MapDocument,
  entryId: string,
  value: number | null,
  rule: TieRule,
): OpResult {
  const c = doc.combat;
  if (!c) return nothing;
  const v = value === null ? null : Math.max(-99, Math.min(999, Math.round(value)));
  const entries = c.entries.map((e) => (e.id === entryId ? { ...e, initiative: v } : e));
  const next = { ...c, entries };
  return done(replaceField(doc, 'combat', c.started ? next : sorted(doc, next, rule)));
}

export interface InitiativeRoll {
  entryId: string;
  name: string;
  roll: number;
  bonus: number;
  total: number;
}

/**
 * Initiative würfeln (W20 + Bonus): 'all' = alle, 'missing' = nur ohne Wert,
 * 'npcs' = alle außer Spielercharakteren. Sortiert anschließend.
 */
export function rollInitiative(
  doc: MapDocument,
  which: 'all' | 'missing' | 'npcs',
  rule: TieRule,
  rng: Rng = cryptoRng,
): { result: OpResult; rolls: InitiativeRoll[] } {
  const c = doc.combat;
  if (!c) return { result: nothing, rolls: [] };
  const rolls: InitiativeRoll[] = [];
  const entries = c.entries.map((e) => {
    const t = tokenOf(doc, e);
    const pick =
      which === 'all' ||
      (which === 'missing' && e.initiative === null) ||
      (which === 'npcs' && t?.kind !== 'pc');
    if (!pick) return e;
    const roll = rng(20);
    rolls.push({ entryId: e.id, name: e.name, roll, bonus: e.bonus, total: roll + e.bonus });
    return { ...e, initiative: roll + e.bonus };
  });
  if (!rolls.length) return { result: nothing, rolls };
  return { result: done(replaceField(doc, 'combat', sorted(doc, { ...c, entries }, rule))), rolls };
}

export function sortCombat(doc: MapDocument, rule: TieRule): OpResult {
  const c = doc.combat;
  return c ? done(replaceField(doc, 'combat', sorted(doc, c, rule))) : nothing;
}

/** Zieht einen Eintrag eine Position nach oben/unten (manuelle Feinabstimmung). */
export function moveEntry(doc: MapDocument, entryId: string, delta: -1 | 1): OpResult {
  const c = doc.combat;
  if (!c) return nothing;
  const i = c.entries.findIndex((e) => e.id === entryId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= c.entries.length) return nothing;
  const entries = [...c.entries];
  [entries[i], entries[j]] = [entries[j] as CombatEntry, entries[i] as CombatEntry];
  const currentId = c.entries[c.turn]?.id;
  return done(
    replaceField(doc, 'combat', {
      ...c,
      entries,
      turn: entries.findIndex((e) => e.id === currentId),
    }),
  );
}

export function currentEntry(doc: MapDocument): CombatEntry | undefined {
  return doc.combat?.entries[doc.combat.turn];
}

const skippable = (doc: MapDocument, e: CombatEntry, opt: TurnOptions) => {
  if (e.delayed) return true;
  const t = tokenOf(doc, e);
  return Boolean(opt.skipDead && t && tokenStatus(t) === 'dead');
};

export interface TurnEvents {
  result: OpResult;
  /** Neue Runde begonnen (Zahl) oder null. */
  newRound: number | null;
  /** Teilnehmer, dessen Zug jetzt beginnt. */
  current: CombatEntry | null;
  /** Namen abgelaufener Effekte. */
  expired: string[];
}

/** Ressourcen des Tokens zu Beginn seines Zuges zurücksetzen. */
function startTurnPatch(doc: MapDocument, e: CombatEntry | undefined): DocPatch | null {
  const t = e && tokenOf(doc, e);
  if (!t) return null;
  const r = updateTokens(doc, new Set([t.id]), (x) => ({
    ...x,
    movementUsed: 0,
    actionsUsed: { action: false, bonus: false, reaction: false },
  }));
  return r.ok ? r.patch : null;
}

/**
 * Nächster Zug (überspringt verzögerte/tote); am Ende der Reihenfolge beginnt eine neue Runde.
 * In der Vorbereitung beginnt damit Runde 1 beim Ersten der Reihenfolge.
 */
export function nextTurn(doc: MapDocument, opt: TurnOptions): TurnEvents {
  const c = doc.combat;
  const none: TurnEvents = { result: nothing, newRound: null, current: null, expired: [] };
  if (!c || !c.entries.length) return none;
  if (!c.started) {
    let first = 0;
    while (first < c.entries.length && skippable(doc, c.entries[first] as CombatEntry, opt))
      first++;
    const cur = c.entries[first];
    if (!cur) return none;
    const patches: DocPatch[] = [replaceField(doc, 'combat', { ...c, started: true, turn: first })];
    const reset = startTurnPatch(doc, cur);
    if (reset) patches.push(reset);
    return { result: done(patches.reduce(mergePatches)), newRound: 1, current: cur, expired: [] };
  }
  let turn = c.turn;
  let round = c.round;
  let wrapped = false;
  for (let step = 0; step < c.entries.length; step++) {
    turn += 1;
    if (turn >= c.entries.length) {
      turn = 0;
      round += 1;
      wrapped = true;
    }
    const e = c.entries[turn] as CombatEntry;
    if (!skippable(doc, e, opt)) break;
  }
  const current = c.entries[turn] as CombatEntry;
  if (skippable(doc, current, opt)) return none; // niemand kann handeln
  const patches: DocPatch[] = [replaceField(doc, 'combat', { ...c, turn, round })];
  let expired: string[] = [];
  if (wrapped) {
    const ticked = tickEffects(doc);
    if (ticked.result.ok) patches.push(ticked.result.patch);
    expired = ticked.expired;
  }
  const reset = startTurnPatch(doc, current);
  if (reset) patches.push(reset);
  return {
    result: done(patches.reduce(mergePatches)),
    newRound: wrapped ? round : null,
    current,
    expired,
  };
}

/** Einen Zug zurück (nur der Zeiger; Effekte/Ressourcen bleiben – dafür gibt es Rückgängig). */
export function prevTurn(doc: MapDocument, opt: TurnOptions): OpResult {
  const c = doc.combat;
  if (!c || !c.entries.length || !c.started) return nothing;
  let turn = c.turn;
  let round = c.round;
  for (let step = 0; step < c.entries.length; step++) {
    turn -= 1;
    if (turn < 0) {
      if (round <= 1) return nothing;
      turn = c.entries.length - 1;
      round -= 1;
    }
    if (!skippable(doc, c.entries[turn] as CombatEntry, opt)) break;
  }
  return done(replaceField(doc, 'combat', { ...c, turn, round }));
}

/** Aktuellen Zug verzögern: Teilnehmer markieren und zum nächsten Zug wechseln. */
export function delayTurn(doc: MapDocument, opt: TurnOptions): TurnEvents {
  const c = doc.combat;
  const cur = c?.entries[c.turn];
  if (!c || !cur) return { result: nothing, newRound: null, current: null, expired: [] };
  const flagged: MapDocument = {
    ...doc,
    combat: {
      ...c,
      entries: c.entries.map((e) => (e.id === cur.id ? { ...e, delayed: true } : e)),
    },
  };
  const next = nextTurn(flagged, opt);
  const flagPatch = replaceField(doc, 'combat', flagged.combat);
  if (!next.result.ok) return { ...next, result: done(flagPatch) };
  return { ...next, result: done(mergePatches(flagPatch, next.result.patch)) };
}

/**
 * „Jetzt handeln“: ein verzögerter Teilnehmer kommt vor dem aktuellen an die Reihe und
 * übernimmt dessen Initiative (SRD: neue Position in der Reihenfolge).
 */
export function actNow(doc: MapDocument, entryId: string): OpResult {
  const c = doc.combat;
  if (!c) return nothing;
  const entry = c.entries.find((e) => e.id === entryId);
  if (!entry?.delayed) return nothing;
  const rest = c.entries.filter((e) => e.id !== entryId);
  const curId = c.entries[c.turn]?.id;
  let at = rest.findIndex((e) => e.id === curId);
  if (at < 0) at = 0;
  const cur = rest[at];
  const moved: CombatEntry = {
    ...entry,
    delayed: false,
    initiative: cur?.initiative ?? entry.initiative,
  };
  const entries = [...rest.slice(0, at), moved, ...rest.slice(at)];
  const patches: DocPatch[] = [replaceField(doc, 'combat', { ...c, entries, turn: at })];
  const reset = startTurnPatch(doc, moved);
  if (reset) patches.push(reset);
  return done(patches.reduce(mergePatches));
}

/** Verzögerung eines (nicht aktuellen) Teilnehmers aufheben, ohne die Reihenfolge zu ändern. */
export function setDelayed(doc: MapDocument, entryId: string, delayed: boolean): OpResult {
  const c = doc.combat;
  if (!c) return nothing;
  return done(
    replaceField(doc, 'combat', {
      ...c,
      entries: c.entries.map((e) => (e.id === entryId ? { ...e, delayed } : e)),
    }),
  );
}
