import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createSnapshot, restoreSnapshot } from '../editor/snapshot';
import { spawnEncounter, newEncounter, rateEncounter } from '../editor/encounter';
import { applyPatch } from '../editor/patch';
import { spawnTokens, type TokenTemplate } from '../editor/tokens';
import type { Creature } from '../data/srd/creatures';
import {
  createCampaign,
  decodeCampaign,
  encodeCampaign,
  isCampaignFile,
  parseCampaign,
} from './campaignFile';
import { ProjectFileError } from './errors';
import { createMap } from './mapDocument';
import { decodeProject, encodeProject } from './projectFile';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const hero: TokenTemplate = {
  name: 'Held',
  kind: 'pc',
  size: 'medium',
  team: 'player',
  hpMax: 20,
  ac: 15,
  speed: 30,
  reach: 5,
  initiativeBonus: 2,
  passivePerception: 12,
  darkvision: 0,
};

function creature(id: string, name: string, xp: number): Creature {
  return {
    id,
    name,
    size: 'medium',
    type: 'humanoid',
    alignment: '',
    ac: 13,
    hp: 7,
    hitDice: '2d6',
    speed: { walk: 30 },
    abilities: [8, 14, 10, 10, 8, 8],
    saves: {},
    skills: {},
    vulnerable: [],
    resist: [],
    immune: [],
    conditionImmune: [],
    senses: { passive: 9 },
    languages: '',
    cr: 0.25,
    xp,
    prof: 2,
    reach: 5,
    traits: [],
    actions: [{ name: 'Scimitar', desc: 'Melee Weapon Attack: +4 to hit.' }],
    reactions: [],
    legendary: [],
  };
}

describe('Schnappschüsse', () => {
  it('werden in der .dndmap mitgespeichert – samt Bildern, die nur sie brauchen', () => {
    let doc = createMap({ name: 'Gruft', cols: 12, rows: 10 });
    const r = spawnTokens(doc, { ...hero, image: 'tokens/a.png' }, { x: 2, y: 2 }, 1).result;
    if (!r.ok) throw new Error('spawn');
    doc = applyPatch(doc, r.patch);
    const snap = createSnapshot(doc, 'Vor dem Kampf', new Date('2026-11-13T10:00:00Z'));
    const empty = { ...doc, tokens: [] };
    const bytes = encodeProject(empty, new Map([['tokens/a.png', PNG]]), null, [snap]);
    const back = decodeProject(bytes);
    expect(back.snapshots).toHaveLength(1);
    expect(back.snapshots[0]).toMatchObject({
      name: 'Vor dem Kampf',
      createdAt: '2026-11-13T10:00:00.000Z',
    });
    expect(back.snapshots[0]!.doc.tokens[0]!.name).toBe('Held');
    expect(back.assets.get('tokens/a.png')).toEqual(PNG);
  });

  it('Wiederherstellen ist ein Patch; Kampflog bleibt', () => {
    let doc = createMap({ name: 'A', cols: 10, rows: 10 });
    const snap = createSnapshot(doc, 'leer');
    const r = spawnTokens(doc, hero, { x: 1, y: 1 }, 2).result;
    if (!r.ok) throw new Error('spawn');
    doc = {
      ...applyPatch(doc, r.patch),
      combatLog: [{ id: 'l', time: '', round: null, kind: 'note', text: 'x' }],
    };
    const res = restoreSnapshot(doc, snap);
    if (!res.ok) throw new Error('restore');
    const restored = applyPatch(doc, res.patch);
    expect(restored.tokens).toEqual([]);
    expect(restored.combatLog).toHaveLength(1);
    expect(applyPatch(restored, res.patch, 'b').tokens).toHaveLength(2); // rückgängig
    expect(restoreSnapshot(restored, snap)).toEqual({ ok: false, reason: 'nothing' });
  });

  it('ungültige Schnappschüsse werden übersprungen, die Karte bleibt lesbar', () => {
    const doc = createMap({ name: 'A', cols: 10, rows: 10 });
    const files = unzipSync(encodeProject(doc));
    files['snapshots.json'] = strToU8(
      JSON.stringify([{ id: 's', name: 'kaputt', doc: { format: 'x' } }, 'Unsinn']),
    );
    expect(decodeProject(zipSync(files)).snapshots).toEqual([]);
  });
});

describe('Kampagnen-Datei', () => {
  function sample() {
    const a = createMap({ name: 'Taverne', cols: 20, rows: 15 });
    const b = createMap({ name: 'Keller', cols: 12, rows: 12 });
    const c = createCampaign('Die Gruft', { id: 's1', name: 'Taverne' });
    const enc = { ...newEncounter('Ratten'), party: [{ name: 'Mira', level: 3 }] };
    c.scenes.push({ id: 's2', name: 'Keller' });
    c.links.push({ id: 'l1', scene: 's1', x: 4, y: 7, target: 's2', label: 'Falltür' });
    c.notes = 'Der Wirt lügt.';
    c.encounters.push(enc);
    c.handouts.push({ id: 'h1', title: 'Brief', text: 'Kommt allein.', image: 'h1.png' });
    return {
      campaign: c,
      scenes: new Map([
        [
          's1',
          { doc: a, assets: new Map([['img/x.png', PNG]]), snapshots: [createSnapshot(a, 'S')] },
        ],
        ['s2', { doc: b, assets: new Map(), snapshots: [] }],
      ]),
      handoutImages: new Map([['h1.png', PNG]]),
    };
  }

  it('Round-Trip: Szenen, Verknüpfungen, Notizen, Begegnungen, Handouts', () => {
    const s = sample();
    const bytes = encodeCampaign(s, { savedAt: 'jetzt', filePath: 'D:\\k.dndcampaign' });
    expect(isCampaignFile(bytes)).toBe(true);
    expect(isCampaignFile(encodeProject(createMap({ name: 'x', cols: 10, rows: 10 })))).toBe(false);
    const back = decodeCampaign(bytes);
    expect(back.damaged).toEqual([]);
    expect(back.campaign).toMatchObject({
      name: 'Die Gruft',
      current: 's1',
      notes: 'Der Wirt lügt.',
      links: [{ id: 'l1', scene: 's1', target: 's2', x: 4, y: 7, label: 'Falltür' }],
    });
    expect(back.campaign.encounters[0]).toMatchObject({ name: 'Ratten', party: [{ level: 3 }] });
    expect(back.scenes.get('s1')!.doc.name).toBe('Taverne');
    expect(back.scenes.get('s1')!.assets.get('img/x.png')).toEqual(PNG);
    expect(back.scenes.get('s1')!.snapshots).toHaveLength(1);
    expect(back.handoutImages.get('h1.png')).toEqual(PNG);
    expect(back.recovery?.filePath).toBe('D:\\k.dndcampaign');
  });

  it('beschädigte Szene wird gemeldet, Verknüpfungen dorthin entfallen', () => {
    const files = unzipSync(encodeCampaign(sample()));
    files['scenes/s2.dndmap'] = strToU8('kein zip');
    const back = decodeCampaign(zipSync(files));
    expect(back.damaged).toEqual(['Keller']);
    expect(back.campaign.scenes.map((x) => x.id)).toEqual(['s1']);
    expect(back.campaign.links).toEqual([]);
  });

  it('Prüfung: Format, Version, leere Kampagne, Werte werden begrenzt', () => {
    const code = (raw: unknown, ids = new Set(['a'])) => {
      try {
        parseCampaign(raw, ids);
        return 'ok';
      } catch (e) {
        return e instanceof ProjectFileError ? e.code : 'other';
      }
    };
    expect(code({ format: 'dndmap', version: 1 })).toBe('wrongFormat');
    expect(code({ format: 'dndcampaign', version: 2, scenes: [{ id: 'a' }] })).toBe('newerVersion');
    expect(code({ format: 'dndcampaign', version: 1, scenes: [] })).toBe('invalidContent');
    const c = parseCampaign(
      {
        format: 'dndcampaign',
        version: 1,
        current: 'gibtsnicht',
        scenes: [{ id: 'a', name: 'A' }, { id: 'a' }, { id: 'b' }],
        encounters: [
          {
            id: 'e',
            name: 'E',
            party: [{ name: 'X', level: 99 }],
            groups: [{ source: 'goblin', count: 500, team: 'böse' }],
          },
        ],
      },
      new Set(['a']),
    );
    expect(c.current).toBe('a');
    expect(c.scenes).toEqual([{ id: 'a', name: 'A' }]);
    expect(c.encounters[0]).toMatchObject({
      party: [{ level: 20 }],
      groups: [{ source: 'goblin', count: 50, team: 'enemy' }],
    });
  });
});

describe('Begegnung auf die Karte', () => {
  it('alle Gruppen in einem Schritt, Bewertung nur mit Feinden', () => {
    const doc = createMap({ name: 'A', cols: 10, rows: 10 });
    const creatures = new Map([
      ['goblin', creature('goblin', 'Goblin', 50)],
      ['guard', creature('guard', 'Guard', 25)],
    ]);
    const enc = {
      ...newEncounter('Hinterhalt'),
      party: [3, 3, 3, 3].map((level, i) => ({ name: `C${i}`, level })),
      groups: [
        { source: 'goblin', name: 'Goblin', count: 3, team: 'enemy' as const },
        { source: 'guard', name: 'Guard', count: 1, team: 'ally' as const },
        { source: 'unbekannt', name: 'Geist', count: 1, team: 'enemy' as const },
      ],
    };
    const r = spawnEncounter(doc, enc, creatures, { x: 4, y: 4 }, (s) =>
      s === 'goblin' ? 'tokens/g.png' : undefined,
    );
    if (!r.result.ok) throw new Error('spawn');
    const after = applyPatch(doc, r.result.patch);
    expect(after.tokens.map((t) => t.name)).toEqual(['Goblin 1', 'Goblin 2', 'Goblin 3', 'Guard']);
    expect(after.tokens[0]!.image).toBe('tokens/g.png');
    expect(after.tokens[3]!.team).toBe('ally');
    expect(new Set(after.tokens.map((t) => `${t.x},${t.y}`)).size).toBe(4);
    expect(r.missing).toEqual(['Geist']);
    // 3 Goblins (150 XP, ×2 = 300) gegen 4× Stufe 3: leicht (300)
    expect(rateEncounter(enc, creatures)).toMatchObject({
      totalXp: 150,
      adjustedXp: 300,
      difficulty: 'easy',
    });
  });
});
