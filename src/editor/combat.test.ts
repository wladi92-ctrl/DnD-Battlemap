import { describe, expect, it } from 'vitest';
import type { Rng } from '../core/dice';
import { createMap, type MapDocument } from '../storage/mapDocument';
import {
  actNow,
  addCombatants,
  addCustomEntry,
  currentEntry,
  delayTurn,
  endCombat,
  moveEntry,
  nextTurn,
  prevTurn,
  removeEntry,
  rollInitiative,
  setInitiative,
  startCombat,
} from './combat';
import { addEffect, effectFromTemplate } from './effects';
import type { OpResult } from './ops';
import { applyPatch, invertPatch } from './patch';
import { damageToken, spawnTokens, updateTokens, type TokenTemplate } from './tokens';

const apply = (doc: MapDocument, r: OpResult): MapDocument => {
  if (!r.ok) throw new Error(r.reason);
  return applyPatch(doc, r.patch);
};
const seq = (...values: number[]): Rng => {
  let i = 0;
  return () => values[i++ % values.length] as number;
};
const base: TokenTemplate = {
  name: 'X',
  kind: 'creature',
  size: 'medium',
  team: 'enemy',
  hpMax: 10,
  ac: 12,
  speed: 30,
  reach: 5,
  initiativeBonus: 0,
  passivePerception: 10,
  darkvision: 0,
};
const opt = { skipDead: true };

/** Karte mit Held (+3), Ork (+1), Goblin (+2) und gestartetem Kampf. */
function setup() {
  let doc = createMap({ name: 'K', cols: 20, rows: 20 });
  const ids: Record<string, string> = {};
  for (const [name, bonus, team, kind, x] of [
    ['Held', 3, 'player', 'pc', 1],
    ['Ork', 1, 'enemy', 'creature', 5],
    ['Goblin', 2, 'enemy', 'creature', 9],
  ] as const) {
    const {
      result,
      ids: [id],
    } = spawnTokens(doc, { ...base, name, initiativeBonus: bonus, team, kind }, { x, y: 1 }, 1);
    doc = apply(doc, result);
    ids[name] = id as string;
  }
  doc = apply(doc, startCombat(doc, Object.values(ids), seq(500, 400, 300)));
  return { doc, ids };
}
const order = (doc: MapDocument) => doc.combat!.entries.map((e) => e.name);

describe('Initiative', () => {
  it('würfeln, sortieren; Gleichstand: höherer Bonus, dann Zufall', () => {
    const { doc: d0 } = setup();
    expect(d0.combat).toMatchObject({ started: false, round: 1, turn: 0 });
    expect(prevTurn(d0, opt).ok).toBe(false);
    // Held 10+3=13, Ork 12+1=13, Goblin 11+2=13 → alle 13: Bonus entscheidet
    const { result, rolls } = rollInitiative(d0, 'all', 'bonus', seq(10, 12, 11));
    expect(rolls.map((r) => r.total)).toEqual([13, 13, 13]);
    const d1 = apply(d0, result);
    expect(order(d1)).toEqual(['Held', 'Goblin', 'Ork']);
  });

  it('Gleichstand-Regel „Spieler zuerst“ und Zufall bei gleichem Bonus', () => {
    const { doc: d0, ids } = setup();
    let doc = apply(d0, rollInitiative(d0, 'all', 'players', seq(14, 17, 16)).result); // 17, 18, 18
    expect(order(doc)).toEqual(['Goblin', 'Ork', 'Held']);
    // Held auf 18: Spieler zuerst vor den Monstern
    const held = doc.combat!.entries.find((e) => e.tokenId === ids.Held)!;
    doc = apply(doc, setInitiative(doc, held.id, 18, 'players'));
    expect(order(doc)[0]).toBe('Held');
    // Gleicher Bonus und Wert: Zufallswert (tiebreak) entscheidet
    const c = doc.combat!;
    const twin = { ...c.entries[1]!, id: 'zwilling', name: 'Zwilling', tiebreak: 999 };
    const withTwin = { ...doc, combat: { ...c, entries: [...c.entries, twin] } };
    expect(
      order(
        apply(withTwin, setInitiative(withTwin, 'zwilling', c.entries[1]!.initiative, 'players')),
      )[1],
    ).toBe('Zwilling');
  });

  it('nur fehlende bzw. nur Nicht-Spieler würfeln; Teilnehmer ohne Wert stehen hinten', () => {
    const { doc: d0, ids } = setup();
    const held = d0.combat!.entries.find((e) => e.tokenId === ids.Held)!;
    let doc = apply(d0, setInitiative(d0, held.id, 15, 'bonus'));
    expect(order(doc)[0]).toBe('Held');
    const npc = rollInitiative(doc, 'npcs', 'bonus', seq(1, 1));
    expect(npc.rolls.map((r) => r.name)).toEqual(['Ork', 'Goblin']);
    doc = apply(doc, npc.result);
    doc = apply(doc, setInitiative(doc, held.id, null, 'bonus'));
    expect(order(doc).at(-1)).toBe('Held');
    expect(rollInitiative(doc, 'missing', 'bonus', seq(5)).rolls.map((r) => r.name)).toEqual([
      'Held',
    ]);
  });
});

describe('Züge und Runden', () => {
  const ready = () => {
    const s = setup();
    const rolled = apply(s.doc, rollInitiative(s.doc, 'all', 'bonus', seq(18, 10, 5)).result); // Held 21, Ork 11, Goblin 7
    const start = nextTurn(rolled, opt);
    expect(start).toMatchObject({ newRound: 1, current: { name: 'Held' } });
    return { ...s, doc: apply(rolled, start.result) };
  };

  it('Zug weiter setzt die Ressourcen des Aktiven zurück; Rundenwechsel zählt Effekte herunter', () => {
    let { doc } = ready();
    const { ids } = ready();
    void ids;
    expect(currentEntry(doc)?.name).toBe('Held');
    doc = apply(
      doc,
      addEffect(
        doc,
        effectFromTemplate(
          {
            name: 'Nebel',
            shape: 'sphere',
            size: 10,
            color: '#888888',
            wallMode: 'line',
            rounds: 1,
            concentration: true,
            trigger: 'none',
          },
          { x: 10, y: 10 },
          0,
        ),
      ),
    );
    // Ork hat sich schon bewegt
    const ork = doc.tokens.find((t) => t.name === 'Ork')!;
    doc = apply(
      doc,
      updateTokens(doc, new Set([ork.id]), (t) => ({
        ...t,
        movementUsed: 30,
        actionsUsed: { action: true, bonus: true, reaction: true },
      })),
    );
    let ev = nextTurn(doc, opt);
    doc = apply(doc, ev.result);
    expect(ev.current?.name).toBe('Ork');
    expect(ev.newRound).toBeNull();
    expect(doc.tokens.find((t) => t.id === ork.id)).toMatchObject({
      movementUsed: 0,
      actionsUsed: { action: false, reaction: false },
    });
    doc = apply(doc, nextTurn(doc, opt).result); // Goblin
    ev = nextTurn(doc, opt);
    doc = apply(doc, ev.result);
    expect(ev).toMatchObject({ newRound: 2, expired: ['Nebel'] });
    expect(doc.combat).toMatchObject({ round: 2, turn: 0 });
    expect(doc.effects).toEqual([]);
    // Zurück: Zeiger und Runde
    doc = apply(doc, prevTurn(doc, opt));
    expect(doc.combat).toMatchObject({ round: 1, turn: 2 });
  });

  it('Tote werden übersprungen, Verzögern und „Jetzt handeln“', () => {
    let { doc } = ready();
    const ork = doc.tokens.find((t) => t.name === 'Ork')!;
    doc = apply(
      doc,
      updateTokens(doc, new Set([ork.id]), (t) => damageToken(t, 99)),
    );
    let ev = nextTurn(doc, opt);
    expect(ev.current?.name).toBe('Goblin');
    expect(nextTurn(doc, { skipDead: false }).current?.name).toBe('Ork');
    doc = apply(doc, ev.result);
    // Goblin verzögert → Runde 2, Held ist dran
    ev = delayTurn(doc, opt);
    doc = apply(doc, ev.result);
    expect(ev).toMatchObject({ newRound: 2 });
    expect(currentEntry(doc)?.name).toBe('Held');
    const goblin = doc.combat!.entries.find((e) => e.name === 'Goblin')!;
    expect(goblin.delayed).toBe(true);
    // Verzögerte werden übersprungen
    expect(nextTurn(doc, opt).newRound).toBe(3);
    // Goblin handelt jetzt – vor dem Held, mit dessen Initiative
    doc = apply(doc, actNow(doc, goblin.id));
    expect(currentEntry(doc)).toMatchObject({ name: 'Goblin', delayed: false, initiative: 21 });
    expect(order(doc)).toEqual(['Goblin', 'Held', 'Ork']);
  });

  it('Hinzufügen, eigener Eintrag, Entfernen, Verschieben, Beenden – alles rückgängig machbar', () => {
    let { doc } = ready();
    let extra = createMap({ name: 'x', cols: 10, rows: 10 });
    void extra;
    const { result, ids } = spawnTokens(doc, { ...base, name: 'Wolf' }, { x: 15, y: 15 }, 1);
    doc = apply(doc, result);
    doc = apply(doc, addCombatants(doc, ids));
    expect(order(doc).at(-1)).toBe('Wolf');
    expect(addCombatants(doc, ids).ok).toBe(false);
    doc = apply(doc, addCustomEntry(doc, 'Hortaktion', 20, 'bonus'));
    expect(order(doc)).toEqual(['Held', 'Hortaktion', 'Ork', 'Goblin', 'Wolf']);
    expect(currentEntry(doc)?.name).toBe('Held');
    doc = apply(doc, moveEntry(doc, doc.combat!.entries[1]!.id, -1));
    expect(order(doc)[0]).toBe('Hortaktion');
    expect(currentEntry(doc)?.name).toBe('Held'); // Zeiger folgt dem Teilnehmer
    doc = apply(doc, removeEntry(doc, doc.combat!.entries[0]!.id));
    expect(currentEntry(doc)?.name).toBe('Held');
    const r = endCombat(doc);
    const ended = apply(doc, r);
    expect(ended.combat).toBeNull();
    if (!r.ok) throw new Error();
    expect(applyPatch(ended, invertPatch(r.patch)).combat).toEqual(doc.combat);
    extra = ended;
  });
});
