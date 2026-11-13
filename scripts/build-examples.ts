/**
 * Erzeugt die mitgelieferten Beispiele (src/data/examples/) mit dem Programmcode selbst:
 *   taverne.dndmap        – Taverne mit Gruppe und Gästen
 *   gruft.dndmap          – Verlies mit Nebel, Dunkelheit, Fackeln und Untoten
 *   leistungstest.dndmap  – 100 × 100 Felder mit 150 Tokens (Abnahmekriterium Leistung)
 *   kampagne.dndcampaign  – „Die Gruft unter der Taverne“ (3 Szenen, Verknüpfungen,
 *                           Begegnung, Handout, Notizen)
 * Aufruf: npm run examples
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Cell } from '../src/core/grid';
import { rngFrom } from '../src/core/random';
import creaturesJson from '../src/data/srd/creatures.json';
import effectsJson from '../src/data/srd/effects.json';
import type { Creature } from '../src/data/srd/creatures';
import type { EffectSource } from '../src/data/srd/effects';
import { addEffect, effectFromTemplate, templateFromSource } from '../src/editor/effects';
import { newEncounter } from '../src/editor/encounter';
import { buildTemplate, generateDungeon, placeStamp, type Stamp } from '../src/editor/generators';
import type { OpResult } from '../src/editor/ops';
import { applyPatch } from '../src/editor/patch';
import { spawnTokens, templateFromCreature, type TokenTemplate } from '../src/editor/tokens';
import {
  addLight,
  LIGHT_PRESETS,
  lightFromPreset,
  revealCells,
  setFogEnabled,
  setLighting,
} from '../src/editor/vision';
import { createCampaign, encodeCampaign } from '../src/storage/campaignFile';
import { createMap, type MapDocument, type Team } from '../src/storage/mapDocument';
import { encodeProject } from '../src/storage/projectFile';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'examples');
const creatures = (creaturesJson as { creatures: Creature[] }).creatures;
const effects = (effectsJson as { effects: EffectSource[] }).effects;

function run(doc: MapDocument, r: OpResult): MapDocument {
  if (!r.ok) throw new Error(`Operation fehlgeschlagen: ${r.reason}`);
  return applyPatch(doc, r.patch);
}

const creature = (id: string) => {
  const c = creatures.find((x) => x.id === id);
  if (!c) throw new Error(`Kreatur fehlt: ${id}`);
  return c;
};

function spawn(doc: MapDocument, t: TokenTemplate, at: Cell, n: number) {
  const r = spawnTokens(doc, t, at, n);
  return { doc: run(doc, r.result), ids: r.ids };
}

const heroes: TokenTemplate[] = [
  {
    name: 'Mira',
    size: 'medium',
    ac: 15,
    hpMax: 28,
    speed: 30,
    darkvision: 0,
    initiativeBonus: 3,
    passivePerception: 14,
  },
  {
    name: 'Thorin',
    size: 'medium',
    ac: 18,
    hpMax: 34,
    speed: 25,
    darkvision: 60,
    initiativeBonus: 0,
    passivePerception: 11,
  },
  {
    name: 'Elaria',
    size: 'medium',
    ac: 12,
    hpMax: 18,
    speed: 30,
    darkvision: 60,
    initiativeBonus: 2,
    passivePerception: 12,
  },
  {
    name: 'Bram',
    size: 'small',
    ac: 14,
    hpMax: 22,
    speed: 25,
    darkvision: 0,
    initiativeBonus: 4,
    passivePerception: 15,
  },
].map((h) => ({ ...h, kind: 'pc', team: 'player', reach: 5 }) as TokenTemplate);

function addHeroes(doc: MapDocument, at: Cell) {
  const ids: string[] = [];
  for (const h of heroes) {
    const r = spawn(doc, h, at, 1);
    doc = r.doc;
    ids.push(...r.ids);
  }
  return { doc, ids };
}

/** Begehbare Felder der Vorlage (Boden gesetzt, Gelände nicht blockierend). */
function walkable(stamp: Stamp, ox = 0, oy = 0): Cell[] {
  const out: Cell[] = [];
  for (let y = 0; y < stamp.h; y++)
    for (let x = 0; x < stamp.w; x++) {
      const i = y * stamp.w + x;
      if (!stamp.floor[i] || stamp.terrain[`${x},${y}`]?.blocksMovement) continue;
      out.push({ x: x + ox, y: y + oy });
    }
  return out;
}

function stamped(name: string, stamp: Stamp, margin: number, bg?: string): MapDocument {
  const doc = createMap({
    name,
    cols: stamp.w + 2 * margin,
    rows: stamp.h + 2 * margin,
    ...(bg ? { backgroundColor: bg } : {}),
  });
  return run(doc, placeStamp(doc, stamp, { x: margin, y: margin }, true));
}

// ------------------------------------------------------------------ Taverne

function taverne(): MapDocument {
  const stamp = buildTemplate('tavern');
  let doc = stamped('Taverne zum Grünen Drachen', stamp, 3, '#a9c27f');
  const cells = walkable(stamp, 3, 3);
  const rng = rngFrom('taverne');
  const pick = () => cells[Math.floor(rng() * cells.length)] ?? { x: 4, y: 4 };
  doc = addHeroes(doc, cells[0] ?? { x: 4, y: 4 }).doc;
  for (const [id, team, n] of [
    ['commoner', 'neutral', 4],
    ['thug', 'neutral', 2],
    ['noble', 'neutral', 1],
  ] as const) {
    doc = spawn(doc, templateFromCreature(creature(id), team as Team), pick(), n).doc;
  }
  doc = {
    ...doc,
    notes: [
      {
        id: crypto.randomUUID(),
        x: cells[Math.floor(cells.length / 2)]?.x ?? 5,
        y: cells[Math.floor(cells.length / 2)]?.y ?? 5,
        text: 'Der Wirt Gundo weiß von der Falltür im Keller. Er schweigt, bis man ihm 10 GM bietet.',
      },
    ],
  };
  return doc;
}

// ------------------------------------------------------------------ Gruft

function gruft(): MapDocument {
  const stamp = generateDungeon('gruft-der-schatten', 40, 30);
  let doc = stamped('Gruft der Schatten', stamp, 0);
  doc = { ...doc, background: { color: '#2b2621' } };
  const cells = walkable(stamp);
  const rng = rngFrom('gruft');
  const start = cells[0] ?? { x: 2, y: 2 };
  const hero = addHeroes(doc, start);
  doc = hero.doc;
  // Fackel bei Mira, Dunkelheit in der Gruft, Nebel des Krieges um den Eingang aufgedeckt
  const torch = LIGHT_PRESETS.find((p) => p.id === 'torch');
  const mira = doc.tokens.find((t) => t.id === hero.ids[0]);
  if (torch && mira)
    doc = run(doc, addLight(doc, lightFromPreset(torch, 'Fackel (Mira)', mira.x, mira.y, mira.id)));
  doc = run(doc, setLighting(doc, { enabled: true, ambient: 'dark' }));
  doc = run(doc, setFogEnabled(doc, true));
  const around: Cell[] = [];
  for (let y = start.y - 4; y <= start.y + 4; y++)
    for (let x = start.x - 4; x <= start.x + 4; x++) around.push({ x, y });
  doc = run(doc, revealCells(doc, around, true));
  // Untote in entfernten Teilen
  const far = cells.filter((c) => Math.abs(c.x - start.x) + Math.abs(c.y - start.y) > 15);
  const pick = () => far[Math.floor(rng() * far.length)] ?? { x: 20, y: 15 };
  for (const [id, n] of [
    ['skeleton', 4],
    ['zombie', 3],
    ['ghoul', 1],
  ] as const) {
    doc = spawn(doc, templateFromCreature(creature(id), 'enemy'), pick(), n).doc;
  }
  // Ein Nebelwolke-Zauber hängt in einem Gang (verborgen, bis die Gruppe ihn sieht)
  const fog = effects.find((e) => e.id === 'spell.fog-cloud');
  if (fog) {
    const at = pick();
    const e = effectFromTemplate(templateFromSource(fog, 1), { x: at.x + 0.5, y: at.y + 0.5 }, 0);
    doc = run(doc, addEffect(doc, { ...e, hidden: true }));
  }
  return doc;
}

// ------------------------------------------------------------------ Leistungstest

function leistungstest(): MapDocument {
  const stamp = generateDungeon('leistungstest', 100, 100);
  let doc = stamped('Leistungstest 100 × 100', stamp, 0);
  const cells = walkable(stamp);
  const rng = rngFrom('leistung');
  doc = addHeroes(doc, cells[0] ?? { x: 2, y: 2 }).doc;
  const kinds = [
    'goblin',
    'orc',
    'skeleton',
    'zombie',
    'wolf',
    'bandit',
    'hobgoblin',
    'giant-spider',
  ];
  while (doc.tokens.length < 150) {
    const id = kinds[Math.floor(rng() * kinds.length)] ?? 'goblin';
    const at = cells[Math.floor(rng() * cells.length)] ?? { x: 50, y: 50 };
    const n = Math.min(150 - doc.tokens.length, 2 + Math.floor(rng() * 6));
    doc = spawn(doc, templateFromCreature(creature(id), 'enemy'), at, n).doc;
  }
  const torch = LIGHT_PRESETS.find((p) => p.id === 'torch');
  if (torch)
    for (let i = 0; i < 25; i++) {
      const c = cells[Math.floor(rng() * cells.length)];
      if (c)
        doc = run(
          doc,
          addLight(doc, lightFromPreset(torch, `Fackel ${i + 1}`, c.x + 0.5, c.y + 0.5)),
        );
    }
  return doc;
}

// ------------------------------------------------------------------ Kampagne

function kampagne(tav: MapDocument, gru: MapDocument) {
  const clearingStamp = buildTemplate('clearing');
  let lichtung = stamped('Waldlichtung am Bach', clearingStamp, 4, '#8db267');
  lichtung = addHeroes(lichtung, walkable(clearingStamp, 4, 4)[0] ?? { x: 5, y: 5 }).doc;
  lichtung = spawn(
    lichtung,
    templateFromCreature(creature('wolf'), 'enemy'),
    { x: lichtung.grid.cols - 6, y: 6 },
    4,
  ).doc;

  const ids = { tav: 'taverne', gruft: 'gruft', wald: 'lichtung' };
  const c = createCampaign('Die Gruft unter der Taverne', { id: ids.tav, name: tav.name });
  c.scenes.push({ id: ids.gruft, name: gru.name }, { id: ids.wald, name: lichtung.name });
  const tavCells = walkable(buildTemplate('tavern'), 3, 3);
  const trapdoor = tavCells[tavCells.length - 1] ?? { x: 6, y: 6 };
  const gruftStart = gru.tokens[0] ?? { x: 1, y: 1 };
  c.links.push(
    {
      id: 'l1',
      scene: ids.tav,
      x: trapdoor.x,
      y: trapdoor.y,
      target: ids.gruft,
      label: 'Falltür in den Keller',
    },
    {
      id: 'l2',
      scene: ids.gruft,
      x: gruftStart.x,
      y: gruftStart.y,
      target: ids.tav,
      label: 'Leiter nach oben',
    },
    {
      id: 'l3',
      scene: ids.tav,
      x: 1,
      y: Math.floor(tav.grid.rows / 2),
      target: ids.wald,
      label: 'Weg in den Wald',
    },
  );
  c.notes =
    'Aufhänger: Seit drei Nächten verschwinden Gäste der Taverne. Gundo, der Wirt, hat unter dem ' +
    'Keller eine alte Gruft entdeckt und sie verschlossen – doch etwas kommt heraus.\n\n' +
    '1. Taverne: Gerüchte sammeln, den Wirt zum Reden bringen.\n' +
    '2. Gruft: Untote, Fackeln sind wichtig (Grundhelligkeit dunkel).\n' +
    '3. Waldlichtung: Wölfe folgen der Spur eines Flüchtigen.';
  c.encounters.push({
    ...newEncounter('Untote in der Gruft'),
    party: heroes.map((h) => ({ name: h.name, level: 3 })),
    groups: [
      { source: 'skeleton', name: 'Skeleton', count: 4, team: 'enemy' },
      { source: 'zombie', name: 'Zombie', count: 3, team: 'enemy' },
      { source: 'ghoul', name: 'Ghoul', count: 1, team: 'enemy' },
    ],
    notes: 'Die Skelette stehen still, bis jemand den Sarkophag berührt.',
  });
  c.handouts.push({
    id: 'brief',
    title: 'Ein zerknitterter Brief',
    text:
      'Gundo,\n\nwas du unter dem Keller gefunden hast, gehört dir nicht. Versiegle die Tür ' +
      'wieder, bevor der Neumond kommt – oder wir holen uns, was uns zusteht.\n\n– A.',
  });
  return encodeCampaign({
    campaign: c,
    scenes: new Map([
      [ids.tav, { doc: tav, assets: new Map(), snapshots: [] }],
      [ids.gruft, { doc: gru, assets: new Map(), snapshots: [] }],
      [ids.wald, { doc: lichtung, assets: new Map(), snapshots: [] }],
    ]),
    handoutImages: new Map(),
  });
}

mkdirSync(OUT, { recursive: true });
const tav = taverne();
const gru = gruft();
const perf = leistungstest();
writeFileSync(join(OUT, 'taverne.dndmap'), encodeProject(tav));
writeFileSync(join(OUT, 'gruft.dndmap'), encodeProject(gru));
writeFileSync(join(OUT, 'leistungstest.dndmap'), encodeProject(perf));
writeFileSync(join(OUT, 'kampagne.dndcampaign'), kampagne(tav, gru));
console.log(
  `Beispiele erzeugt: Taverne ${tav.tokens.length} Tokens, Gruft ${gru.tokens.length}, ` +
    `Leistungstest ${perf.grid.cols}×${perf.grid.rows} mit ${perf.tokens.length} Tokens`,
);
