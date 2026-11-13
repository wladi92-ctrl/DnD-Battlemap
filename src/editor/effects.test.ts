import { describe, expect, it } from 'vitest';
import type { Creature } from '../data/srd/creatures';
import { damageDice, loadEffectSources, slotLevels } from '../data/srd/effects';
import { createMap, type MapDocument } from '../storage/mapDocument';
import {
  addEffect,
  affectedTokens,
  damageResponse,
  effectCells,
  effectFromTemplate,
  effectsEntered,
  finalDamage,
  saveBonus,
  templateFromSource,
  tickEffects,
  turnStartHits,
  type EffectTemplate,
} from './effects';
import { resizeGrid, setLayerState, type OpResult } from './ops';
import { applyPatch, invertPatch } from './patch';
import { spawnTokens, type TokenTemplate } from './tokens';
import { deleteItems, moveItems, addWalls } from './wallOps';

const apply = (doc: MapDocument, r: OpResult): MapDocument => {
  if (!r.ok) throw new Error(r.reason);
  return applyPatch(doc, r.patch);
};
const map = () => createMap({ name: 'E', cols: 30, rows: 30 });
const tmpl = (over: Partial<EffectTemplate> = {}): EffectTemplate => ({
  name: 'Wolke',
  shape: 'sphere',
  size: 20,
  color: '#2e8b57',
  wallMode: 'line',
  rounds: 3,
  concentration: true,
  trigger: 'both',
  save: { ability: 'con', dc: 15, half: true },
  damage: '5d8',
  ...over,
});
const goblin: TokenTemplate = {
  name: 'Goblin',
  kind: 'creature',
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
function spawn(doc: MapDocument, t: TokenTemplate, x: number, y: number) {
  const { result, ids } = spawnTokens(doc, t, { x, y }, 1);
  return { doc: apply(doc, result), id: ids[0] as string };
}

describe('Effektbibliothek', () => {
  it('enthält Feuerball, Brennende Hände, Blitz mit Bereich, Schaden und Rettungswurf', async () => {
    const list = await loadEffectSources();
    const fb = list.find((e) => e.id === 'spell.fireball')!;
    expect(fb).toMatchObject({
      shape: 'sphere',
      size: 20,
      spreads: true,
      save: { ability: 'dex', success: 'half' },
    });
    expect(slotLevels(fb)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(damageDice(fb, 5)).toBe('10d6');
    expect(list.find((e) => e.id === 'spell.burning-hands')).toMatchObject({
      shape: 'cone',
      size: 15,
    });
    expect(list.find((e) => e.id === 'spell.lightning-bolt')).toMatchObject({
      shape: 'line',
      size: 100,
      width: 5,
    });
    expect(list.find((e) => e.id === 'spell.spirit-guardians')).toMatchObject({
      shape: 'emanation',
      size: 15,
      concentration: true,
    });
    const breath = list.find((e) => e.id === 'breath.adult-red-dragon')!;
    expect(breath).toMatchObject({
      shape: 'cone',
      size: 60,
      save: { ability: 'dex', dc: 21, success: 'half' },
    });
    expect(breath.damage).toEqual({ type: 'fire', dice: { base: '18d6' } });
    expect(list.filter((e) => e.kind === 'item').length).toBeGreaterThan(10);
  });

  it('Vorlage aus der Bibliothek: Grad, Standard-SG, Ausbreitung, Dauer', async () => {
    const list = await loadEffectSources();
    const fb = templateFromSource(
      list.find((e) => e.id === 'spell.fireball')!,
      4,
      15,
    );
    expect(fb).toMatchObject({
      damage: '9d6',
      damageType: 'fire',
      wallMode: 'spread',
      rounds: 0,
      save: { dc: 15, half: true },
    });
    const ck = templateFromSource(list.find((e) => e.id === 'spell.cloudkill')!);
    expect(ck).toMatchObject({ rounds: 100, concentration: true, trigger: 'both' });
  });
});

describe('Effekte auf der Karte', () => {
  it('betroffene Tokens: große Kreaturen schon mit einem Feld', () => {
    let doc = map();
    const a = spawn(doc, goblin, 13, 11);
    doc = a.doc;
    const ogre = spawn(doc, { ...goblin, name: 'Oger', size: 'large' }, 13, 7);
    doc = ogre.doc;
    const far = spawn(doc, goblin, 25, 25);
    doc = far.doc;
    const e = effectFromTemplate(tmpl(), { x: 10, y: 10 }, 0);
    doc = apply(doc, addEffect(doc, e));
    const cells = effectCells(doc, doc.effects[0]!, 'half');
    const hit = affectedTokens(doc, cells).map((t) => t.id);
    expect(hit).toContain(a.id);
    expect(hit).toContain(ogre.id); // nur (13,8) liegt im Bereich
    expect(hit).not.toContain(far.id);
  });

  it('Huge und Gargantuan: betroffen, sobald eines ihrer Felder im Bereich liegt', () => {
    let doc = map();
    // Feuerball (20 ft) um die Kreuzung (10,10): Felder x/y 6…13
    const huge = spawn(doc, { ...goblin, name: 'Riese', size: 'huge' }, 13, 9); // x 13–15, y 9–11
    doc = huge.doc;
    const garg = spawn(doc, { ...goblin, name: 'Tarrasque', size: 'gargantuan' }, 2, 2); // 2–5
    doc = garg.doc;
    const outside = spawn(doc, { ...goblin, name: 'Fern', size: 'huge' }, 16, 16); // 16–18
    doc = outside.doc;
    const e = effectFromTemplate(tmpl(), { x: 10, y: 10 }, 0);
    doc = apply(doc, addEffect(doc, e));
    const cells = effectCells(doc, doc.effects[0]!, 'half');
    const hit = affectedTokens(doc, cells).map((t) => t.id);
    // Nur der linke Rand des Riesen liegt im Bereich, der Rest nicht
    expect(cells.has(9 * 30 + 13)).toBe(true);
    expect(cells.has(10 * 30 + 15)).toBe(false);
    expect(hit).toContain(huge.id);
    expect(hit).not.toContain(garg.id); // Felder 2–5 erreicht der Feuerball nicht
    expect(hit).not.toContain(outside.id);
    // Rückt der Gargantuan heran (x 3–6, y 7–10), ragt eine Ecke hinein: betroffen
    doc = { ...doc, tokens: doc.tokens.map((t) => (t.id === garg.id ? { ...t, x: 3, y: 7 } : t)) };
    const hit2 = affectedTokens(doc, effectCells(doc, doc.effects[0]!, 'half')).map((t) => t.id);
    expect(hit2).toContain(garg.id);
  });

  it('Wand trennt; Aura folgt ihrem Träger', () => {
    let doc = map();
    doc = apply(doc, addWalls(doc, [{ x1: 12, y1: 0, x2: 12, y2: 30, kind: 'wall' }]));
    const e = effectFromTemplate(tmpl({ wallMode: 'line' }), { x: 10, y: 10 }, 0);
    doc = apply(doc, addEffect(doc, e));
    expect([...effectCells(doc, doc.effects[0]!, 'half')].every((i) => i % 30 < 12)).toBe(true);

    const carrier = spawn(
      doc,
      { ...goblin, name: 'Kleriker', team: 'player', size: 'medium' },
      3,
      3,
    );
    doc = carrier.doc;
    const aura = effectFromTemplate(
      tmpl({ shape: 'emanation', size: 10, name: 'Aura' }),
      { x: 0, y: 0 },
      0,
      {
        attachedTo: carrier.id,
      },
    );
    doc = apply(doc, addEffect(doc, aura));
    const before = effectCells(doc, doc.effects[1]!, 'half');
    expect(before.has(5 * 30 + 3)).toBe(true);
    doc = apply(doc, moveItems(doc, new Set([carrier.id]), 5, 0));
    const after = effectCells(doc, doc.effects[1]!, 'half');
    expect(after.has(5 * 30 + 3)).toBe(false);
    expect(after.has(5 * 30 + 8)).toBe(true);
  });

  it('Runden zählen herunter, abgelaufene Effekte verschwinden; unbegrenzte bleiben', () => {
    let doc = map();
    doc = apply(
      doc,
      addEffect(doc, effectFromTemplate(tmpl({ rounds: 2, name: 'A' }), { x: 5, y: 5 }, 0)),
    );
    doc = apply(
      doc,
      addEffect(doc, effectFromTemplate(tmpl({ rounds: null, name: 'B' }), { x: 5, y: 5 }, 0)),
    );
    let t = tickEffects(doc);
    expect(t.expired).toEqual([]);
    doc = apply(doc, t.result);
    expect(doc.effects.map((e) => e.rounds)).toEqual([1, null]);
    t = tickEffects(doc);
    expect(t.expired).toEqual(['A']);
    doc = apply(doc, t.result);
    expect(doc.effects.map((e) => e.name)).toEqual(['B']);
    expect(tickEffects(doc).result.ok).toBe(false);
  });

  it('Auslöser: Betreten und Zugbeginn', () => {
    let doc = map();
    const g = spawn(doc, goblin, 1, 1);
    doc = g.doc;
    doc = apply(doc, addEffect(doc, effectFromTemplate(tmpl(), { x: 10, y: 10 }, 0)));
    expect(turnStartHits(doc, 'half')).toEqual([]);
    const moved = apply(doc, moveItems(doc, new Set([g.id]), 8, 8));
    expect(effectsEntered(doc, moved, g.id, 'half').map((e) => e.name)).toEqual(['Wolke']);
    expect(turnStartHits(moved, 'half')[0]?.tokens.map((t) => t.id)).toEqual([g.id]);
    // Innerhalb weiterbewegen löst nicht erneut aus
    const again = apply(moved, moveItems(moved, new Set([g.id]), 1, 0));
    expect(effectsEntered(moved, again, g.id, 'half')).toEqual([]);
  });

  it('Löschen, Verschieben und Undo; gesperrte Ebene; Verkleinern der Karte', () => {
    let doc = map();
    doc = apply(doc, addEffect(doc, effectFromTemplate(tmpl(), { x: 28, y: 28 }, 0)));
    const id = doc.effects[0]!.id;
    const mv = moveItems(doc, new Set([id]), -3, 1);
    const moved = apply(doc, mv);
    expect(moved.effects[0]!.origin).toEqual({ x: 25, y: 29 });
    const del = deleteItems(moved, new Set([id]));
    const gone = apply(moved, del);
    expect(gone.effects).toEqual([]);
    if (!del.ok) throw new Error();
    expect(applyPatch(gone, invertPatch(del.patch)).effects).toEqual(moved.effects);
    const lockedDoc = apply(doc, setLayerState(doc, 'effects', { locked: true }));
    expect(addEffect(lockedDoc, doc.effects[0]!)).toEqual({ ok: false, reason: 'locked' });
    expect(apply(doc, resizeGrid(doc, 20, 20)).effects[0]!.origin).toEqual({ x: 20, y: 20 });
  });
});

describe('Rettungswürfe und Schaden', () => {
  const dragon = {
    saves: { dex: 6 },
    abilities: [27, 10, 25, 16, 13, 21],
    immune: ['fire'],
    resist: ['cold'],
    vulnerable: ['thunder'],
  } as unknown as Creature;

  it('Rettungswurfbonus aus Statblock oder Attribut', () => {
    expect(saveBonus(dragon, 'dex')).toBe(6);
    expect(saveBonus(dragon, 'con')).toBe(7);
    expect(saveBonus(undefined, 'wis')).toBe(0);
  });

  it('halber Schaden bei Erfolg, Resistenz, Immunität, Anfälligkeit', () => {
    expect(finalDamage(28, false, true)).toBe(28);
    expect(finalDamage(28, true, true)).toBe(14);
    expect(finalDamage(27, true, true)).toBe(13);
    expect(finalDamage(28, true, false)).toBe(0);
    expect(finalDamage(28, false, true, damageResponse(dragon, 'fire'))).toBe(0);
    expect(finalDamage(28, true, true, damageResponse(dragon, 'cold'))).toBe(7);
    expect(finalDamage(10, false, true, damageResponse(dragon, 'thunder'))).toBe(20);
    expect(damageResponse(dragon, 'acid')).toBe('normal');
  });
});
