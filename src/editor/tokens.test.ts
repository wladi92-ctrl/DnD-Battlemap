import { describe, expect, it } from 'vitest';
import { createMap, type MapDocument, type Token } from '../storage/mapDocument';
import { resizeGrid, setLayerState, type OpResult } from './ops';
import { applyPatch, invertPatch } from './patch';
import {
  damageToken,
  deleteTokens,
  duplicateTokens,
  expandGroups,
  freePositions,
  groupTokens,
  healToken,
  isHostile,
  moveToken,
  newRound,
  numberedNames,
  recordDeathSave,
  setTempHp,
  spawnTokens,
  templateFromCreature,
  toggleCondition,
  tokenReach,
  tokensAt,
  tokenStatus,
  type TokenTemplate,
} from './tokens';
import creaturesJson from '../data/srd/creatures.json';
import type { Creature } from '../data/srd/creatures';

const c = (x: number, y: number) => ({ x, y });
const apply = (doc: MapDocument, r: OpResult): MapDocument => {
  if (!r.ok) throw new Error(`Operation fehlgeschlagen: ${r.reason}`);
  return applyPatch(doc, r.patch);
};
const goblin: TokenTemplate = {
  name: 'Goblin',
  kind: 'creature',
  source: 'goblin',
  size: 'small',
  team: 'enemy',
  hpMax: 7,
  ac: 15,
  speed: 30,
  reach: 5,
  initiativeBonus: 2,
  passivePerception: 9,
  darkvision: 60,
};
const { source: _source, ...withoutSource } = goblin;
const hero: TokenTemplate = {
  ...withoutSource,
  name: 'Mira',
  kind: 'pc',
  size: 'medium',
  team: 'player',
  hpMax: 20,
  pc: { className: 'Kämpferin', level: 3 },
};

function spawn(doc: MapDocument, t: TokenTemplate, at = c(5, 5), n = 1) {
  const { result, ids } = spawnTokens(doc, t, at, n);
  return { doc: apply(doc, result), ids };
}
const tok = (doc: MapDocument, id: string) => doc.tokens.find((t) => t.id === id) as Token;

describe('Tokens erzeugen', () => {
  it('nummeriert mehrere Kreaturen und setzt sie auf freie Felder', () => {
    const { doc, ids } = spawn(createMap({ name: 'T', cols: 10, rows: 10 }), goblin, c(5, 5), 4);
    expect(ids).toHaveLength(4);
    expect(doc.tokens.map((t) => t.name)).toEqual(['Goblin 1', 'Goblin 2', 'Goblin 3', 'Goblin 4']);
    const cells = new Set(doc.tokens.map((t) => `${t.x},${t.y}`));
    expect(cells.size).toBe(4);
    expect(doc.tokens[0]).toMatchObject({ x: 5, y: 5, team: 'enemy', hp: { current: 7, max: 7 } });
    // Weitere Goblins zählen weiter
    expect(numberedNames(doc, 'Goblin', 2)).toEqual(['Goblin 5', 'Goblin 6']);
  });

  it('einzelne Kreatur behält ihren Namen; große Kreaturen überlappen nicht', () => {
    const d0 = createMap({ name: 'T', cols: 10, rows: 10 });
    expect(spawn(d0, hero).doc.tokens[0]?.name).toBe('Mira');
    const ogre = { ...goblin, name: 'Ogre', size: 'large' as const };
    const { doc } = spawn(d0, ogre, c(0, 0), 3);
    const [a, b] = doc.tokens;
    expect(Math.abs(a!.x - b!.x) >= 2 || Math.abs(a!.y - b!.y) >= 2).toBe(true);
    expect(doc.tokens.every((t) => t.x + 2 <= 10 && t.y + 2 <= 10)).toBe(true);
  });

  it('übernimmt Werte aus dem SRD-Statblock', () => {
    const list = (creaturesJson as unknown as { creatures: Creature[] }).creatures;
    const g = list.find((x) => x.id === 'goblin');
    expect(g).toBeDefined();
    const t = templateFromCreature(g!);
    expect(t).toMatchObject({
      name: 'Goblin',
      size: 'small',
      hpMax: 7,
      ac: 15,
      speed: 30,
      initiativeBonus: 2,
    });
    expect(t.darkvision).toBe(60);
  });

  it('gesperrte Token-Ebene verhindert das Setzen; volle Karte meldet "outside"', () => {
    const d0 = createMap({ name: 'T', cols: 10, rows: 10 });
    const locked = apply(d0, setLayerState(d0, 'tokens', { locked: true }));
    expect(spawnTokens(locked, goblin, c(1, 1), 1).result).toEqual({ ok: false, reason: 'locked' });
    expect(freePositions(d0, 1, c(0, 0), 200)).toHaveLength(100);
  });
});

describe('Trefferpunkte und Zustände', () => {
  const base = () =>
    spawn(createMap({ name: 'T', cols: 10, rows: 10 }), hero).doc.tokens[0] as Token;

  it('temporäre TP fangen Schaden zuerst ab, Heilung begrenzt auf Maximum', () => {
    let t = setTempHp(base(), 5);
    t = damageToken(t, 8);
    expect(t.hp).toEqual({ current: 17, max: 20, temp: 0 });
    expect(setTempHp(setTempHp(t, 6), 3).hp.temp).toBe(6); // nicht kumulativ
    expect(healToken(t, 50).hp.current).toBe(20);
  });

  it('Spielercharakter fällt bewusstlos um, Todesrettungswürfe, Stabilisierung', () => {
    let t = damageToken(base(), 25);
    expect(t.hp.current).toBe(0);
    expect(t.conditions).toContain('unconscious');
    expect(tokenStatus(t)).toBe('unconscious');
    t = damageToken(t, 3); // Schaden bei 0 TP = Fehlschlag
    t = recordDeathSave(t, true);
    t = recordDeathSave(t, true);
    expect(t.deathSaves).toEqual({ success: 2, failure: 1 });
    t = recordDeathSave(t, true);
    expect(tokenStatus(t)).toBe('stable');
    t = healToken(t, 4);
    expect(t.hp.current).toBe(4);
    expect(t.deathSaves).toEqual({ success: 0, failure: 0 });
    expect(t.conditions).not.toContain('unconscious');
  });

  it('kritischer Treffer bei 0 TP = zwei Fehlschläge; massiver Schaden tötet sofort', () => {
    const down = damageToken(base(), 20);
    expect(damageToken(down, 1, true).deathSaves.failure).toBe(2);
    expect(tokenStatus(damageToken(down, 20))).toBe('dead');
    expect(tokenStatus(damageToken(base(), 40))).toBe('dead'); // 20 Überschuss ≥ 20 Max
    expect(healToken(damageToken(base(), 40), 5).hp.current).toBe(0);
  });

  it('Kreaturen sterben bei 0 TP', () => {
    const g = spawn(createMap({ name: 'T', cols: 10, rows: 10 }), goblin).doc.tokens[0] as Token;
    expect(tokenStatus(damageToken(g, 7))).toBe('dead');
  });

  it('Zustände umschalten, Gruppen, neue Runde, Löschen mit Undo', () => {
    const { doc: d1, ids } = spawn(
      createMap({ name: 'T', cols: 10, rows: 10 }),
      goblin,
      c(2, 2),
      3,
    );
    const sel = new Set(ids.slice(0, 2));
    const d2 = apply(d1, toggleCondition(d1, sel, 'prone'));
    expect(d2.tokens.map((t) => t.conditions.includes('prone'))).toEqual([true, true, false]);
    const d3 = apply(d2, toggleCondition(d2, sel, 'prone'));
    expect(d3.tokens.every((t) => !t.conditions.length)).toBe(true);

    const g = apply(d1, groupTokens(d1, sel, true));
    expect(expandGroups(g, new Set([ids[0]!]))).toEqual(sel);
    const ug = apply(g, groupTokens(g, sel, false));
    expect(ug.tokens.every((t) => t.groupId === undefined)).toBe(true);

    const moved = {
      ...d1,
      tokens: d1.tokens.map((t) => ({
        ...t,
        movementUsed: 20,
        actionsUsed: { action: true, bonus: true, reaction: false },
      })),
    };
    const fresh = apply(moved, newRound(moved));
    expect(fresh.tokens.every((t) => t.movementUsed === 0 && !t.actionsUsed.action)).toBe(true);

    const r = deleteTokens(d1, sel);
    if (!r.ok) throw new Error(r.reason);
    const del = applyPatch(d1, r.patch);
    expect(del.tokens).toHaveLength(1);
    expect(applyPatch(del, invertPatch(r.patch)).tokens).toEqual(d1.tokens);
  });

  it('Duplizieren vergibt die nächste Nummer und ein freies Feld', () => {
    const { doc: d1, ids } = spawn(
      createMap({ name: 'T', cols: 10, rows: 10 }),
      goblin,
      c(2, 2),
      2,
    );
    const { result, ids: copies } = duplicateTokens(d1, new Set([ids[0]!]));
    const d2 = apply(d1, result);
    const copy = tok(d2, copies[0]!);
    expect(copy.name).toBe('Goblin 3');
    expect(d2.tokens.filter((t) => t.x === copy.x && t.y === copy.y)).toHaveLength(1);
  });
});

describe('Bewegung', () => {
  it('Feinde und Verbündete; Kosten werden verbucht', () => {
    expect(isHostile('player', 'enemy')).toBe(true);
    expect(isHostile('player', 'ally')).toBe(false);
    expect(isHostile('neutral', 'enemy')).toBe(false);
    const first = spawn(createMap({ name: 'T', cols: 12, rows: 12 }), hero, c(1, 1));
    let doc = first.doc;
    const mira = first.ids[0]!;
    const out = moveToken(doc, mira, c(4, 1), 'standard');
    expect(out.cost).toBe(15);
    doc = apply(doc, out.result);
    expect(tok(doc, mira)).toMatchObject({ x: 4, y: 1, movementUsed: 15 });
    const reach = tokenReach(doc, tok(doc, mira), 'standard');
    expect(reach.cost.get(1 * 12 + 7)).toBe(15); // 15 ft Rest
    expect(reach.cost.has(1 * 12 + 8)).toBe(false);
  });

  it('Gelegenheitsangriff beim Verlassen der Reichweite eines Feindes', () => {
    const d0 = createMap({ name: 'T', cols: 12, rows: 12 });
    const a = spawn(d0, hero, c(5, 5));
    const b = spawn(a.doc, goblin, c(6, 5));
    const out = moveToken(b.doc, a.ids[0]!, c(2, 5), 'standard');
    expect(out.opportunity).toEqual(b.ids);
    // Feinde blockieren den Weg nach rechts → Umweg
    const right = moveToken(b.doc, a.ids[0]!, c(7, 5), 'standard');
    expect(right.cost).toBe(10);
    expect(right.path?.some((p) => p.x === 6 && p.y === 5)).toBe(false);
  });

  it('tokensAt findet Tiny-Kreaturen nur in ihrer Feldmitte; Ebene ausgeblendet → nichts', () => {
    const d0 = createMap({ name: 'T', cols: 10, rows: 10 });
    const { doc } = spawn(d0, { ...goblin, name: 'Rat', size: 'tiny' }, c(3, 3));
    expect(tokensAt(doc, { x: 3.5, y: 3.5 })).toHaveLength(1);
    expect(tokensAt(doc, { x: 3.1, y: 3.1 })).toHaveLength(0);
    const hidden = apply(doc, setLayerState(doc, 'tokens', { visible: false }));
    expect(tokensAt(hidden, { x: 3.5, y: 3.5 })).toHaveLength(0);
  });

  it('Verkleinern der Karte schiebt Tokens an den Rand statt sie zu löschen', () => {
    const { doc } = spawn(
      createMap({ name: 'T', cols: 30, rows: 30 }),
      { ...goblin, size: 'large' },
      c(25, 25),
    );
    const small = apply(doc, resizeGrid(doc, 20, 20));
    expect(small.tokens[0]).toMatchObject({ x: 18, y: 18 });
  });
});
