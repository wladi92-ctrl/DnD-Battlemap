#!/usr/bin/env node
/**
 * Erzeugt die Effektbibliothek (Flächeneffekte) aus SRD-5.1-Daten (5e-bits/5e-database, MIT):
 * Zauber mit Bereich, magische Gegenstände mit Bereich, Odemwaffen der Kreaturen,
 * einige Klassenmerkmale und Fallen. Wird nur zur Entwicklungszeit ausgeführt.
 *
 * Aufruf: node scripts/build-srd-effects.mjs <Ordner mit 5e-SRD-Spells/Magic-Items.json> <Commit-SHA>
 * Liest zusätzlich src/data/srd/creatures.json (vorher scripts/build-srd.mjs ausführen).
 * Ausgabe: src/data/srd/effects.json
 *
 * Bereiche, die das SRD nur im Fließtext nennt, werden per Muster erkannt
 * ("20-foot-radius sphere", "60-foot cone", "90-foot line that is 5 feet wide").
 * Für wenige Zauber ohne strukturierte Angabe steht die Größe in OVERRIDES – jeweils
 * mit dem zitierten SRD-Satzteil als Beleg.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , rawDir, commit] = process.argv;
if (!rawDir || !commit) {
  console.error('Aufruf: node scripts/build-srd-effects.mjs <Rohdaten-Ordner> <Commit-SHA>');
  process.exit(1);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'src', 'data', 'srd');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

const SOURCE = {
  name: 'System Reference Document 5.1 (CC-BY-4.0), maschinenlesbar über 5e-bits/5e-database (MIT)',
  repository: 'https://github.com/5e-bits/5e-database',
  commit,
};

const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
];

/** Zauber, deren Bereich nur im Text steht (Beleg aus dem SRD-Text). */
const OVERRIDES = {
  'spirit-guardians': { shape: 'emanation', size: 15, evidence: 'to a distance of 15 feet' },
  'hypnotic-pattern': { shape: 'cube', size: 30, evidence: '30-foot cube' },
  'glyph-of-warding': { shape: 'sphere', size: 20, evidence: '20-foot-radius sphere' },
  'plant-growth': { shape: 'sphere', size: 100, evidence: '100-foot radius' },
};

/** Dauer-Text → Runden (1 Runde = 6 s); null = unbegrenzt/unbekannt, 0 = sofort. */
export function durationRounds(text) {
  const t = String(text).toLowerCase();
  if (t.includes('instantaneous')) return 0;
  const m = /(\d+)\s*(round|minute|hour|day)/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  return { round: n, minute: n * 10, hour: n * 600, day: n * 14400 }[m[2]];
}

const AREA_RE =
  /(\d+)[- ]foot(?:[- ]radius)?[- ](sphere|cone|cube|line|cylinder|radius|square)(?:[^.]*?(\d+) feet wide)?/i;

/** Bereich aus Fließtext: { shape, size, width? } oder null. */
export function areaFromText(text) {
  const m = AREA_RE.exec(text);
  if (!m) return null;
  const size = Number(m[1]);
  let shape = m[2].toLowerCase();
  if (shape === 'radius') shape = 'sphere';
  const out = { shape, size };
  if (shape === 'line') out.width = m[3] ? Number(m[3]) : 5;
  return out;
}

function saveFromDesc(desc) {
  const m =
    /DC (\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/.exec(
      desc,
    );
  if (!m) return null;
  return {
    ability: m[2].slice(0, 3).toLowerCase(),
    dc: Number(m[1]),
    success: /half as much damage/.test(desc) ? 'half' : 'none',
  };
}

function damageFromDesc(desc) {
  const m = /\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s+(\w+) damage/.exec(desc);
  if (!m || !DAMAGE_TYPES.includes(m[2])) return null;
  return { type: m[2], dice: { base: m[1].replace(/\s+/g, '') } };
}

// ------------------------------------------------------------------ Zauber

const spellsRaw = read(join(rawDir, '5e-SRD-Spells.json'));
const spells = [];
for (const s of spellsRaw) {
  const desc = s.desc.join('\n');
  let area = s.area_of_effect
    ? { shape: s.area_of_effect.type, size: s.area_of_effect.size }
    : OVERRIDES[s.index]
      ? { shape: OVERRIDES[s.index].shape, size: OVERRIDES[s.index].size }
      : null;
  if (!area) continue;
  if (OVERRIDES[s.index] && !desc.includes(OVERRIDES[s.index].evidence)) {
    throw new Error(`Beleg fehlt für ${s.index}`);
  }
  // Selbst-zentrierte Kugeln wandern mit dem Zaubernden → Aura (Emanation).
  if (/^self/i.test(s.range) && area.shape === 'sphere') area = { ...area, shape: 'emanation' };
  if (area.shape === 'line') {
    const w = /(\d+) feet wide/.exec(desc);
    area.width = w ? Number(w[1]) : 5;
  }
  // Schaden steht je nach Datenstand als Objekt oder als Liste.
  const d0 = Array.isArray(s.damage) ? s.damage[0] : s.damage;
  const dmg = d0?.damage_type
    ? {
        type: d0.damage_type.index,
        dice: d0.damage_at_slot_level ?? d0.damage_at_character_level ?? {},
        scaling: d0.damage_at_slot_level ? 'slot' : 'character',
      }
    : null;
  spells.push({
    id: `spell.${s.index}`,
    kind: 'spell',
    name: s.name,
    level: s.level,
    school: s.school?.index,
    range: s.range,
    ...area,
    ...(dmg ? { damage: dmg } : {}),
    ...(s.dc?.dc_type
      ? {
          save: {
            ability: s.dc.dc_type.index,
            success: s.dc.dc_success === 'half' ? 'half' : 'none',
          },
        }
      : {}),
    duration: s.duration,
    rounds: durationRounds(s.duration),
    concentration: Boolean(s.concentration),
    spreads: /spreads around corners/i.test(desc),
    desc,
    ...(s.higher_level?.length ? { higherLevel: s.higher_level.join('\n') } : {}),
  });
}

// ------------------------------------------------------------------ Magische Gegenstände

const spellByName = new Map(spells.map((s) => [s.name.toLowerCase(), s]));
const itemsRaw = read(join(rawDir, '5e-SRD-Magic-Items.json'));
const items = [];
for (const it of itemsRaw) {
  if (it.variant) continue;
  const desc = it.desc.join('\n');
  const own = areaFromText(desc);
  // Gegenstände, die Bereichszauber wirken (z. B. Zauberstab der Feuerbälle).
  const casts = [...spellByName.keys()].filter((n) =>
    new RegExp(`\\b${n} spell\\b`, 'i').test(desc),
  );
  const viaSpell = !own && casts.length ? spellByName.get(casts[0]) : null;
  const area =
    own ??
    (viaSpell
      ? {
          shape: viaSpell.shape,
          size: viaSpell.size,
          ...(viaSpell.width ? { width: viaSpell.width } : {}),
        }
      : null);
  if (!area || area.size < 5) continue;
  const save = saveFromDesc(desc) ?? (viaSpell?.save ? { ...viaSpell.save } : null);
  const damage = damageFromDesc(desc) ?? (viaSpell?.damage ? viaSpell.damage : null);
  // Nur echte Wirkungsbereiche (Rettungswurf oder Schaden), keine Lichtradien o. Ä.
  if (!save && !damage) continue;
  items.push({
    id: `item.${it.index}`,
    kind: 'item',
    name: it.name,
    rarity: it.rarity?.name,
    ...area,
    ...(damage ? { damage } : {}),
    ...(save ? { save } : {}),
    ...(viaSpell ? { viaSpell: viaSpell.id } : {}),
    duration: viaSpell?.duration ?? 'Instantaneous',
    rounds: viaSpell?.rounds ?? 0,
    concentration: false,
    spreads: viaSpell?.spreads ?? false,
    desc,
  });
}

// ------------------------------------------------------------------ Odemwaffen

const creatures = read(join(outDir, 'creatures.json')).creatures;
const breaths = [];
const BREATH_RE = /(\d+)[- ]foot[- ](cone|line)(?: that is (\d+) feet wide)?/gi;
for (const c of creatures) {
  for (const a of c.actions) {
    if (!/breath/i.test(a.name)) continue;
    // Mehrere Odemwaffen in einer Aktion (z. B. Messingdrache): je Satz auswerten.
    const parts = a.desc.split(/(?<=\.)\s+(?=[A-Z][a-z]+ Breath\.)/);
    let n = 0;
    for (const part of parts) {
      BREATH_RE.lastIndex = 0;
      const m = BREATH_RE.exec(part);
      if (!m) continue;
      const shape = m[2].toLowerCase();
      const label = /^([A-Z][a-z]+ Breath)\./.exec(part)?.[1] ?? a.name;
      const save = saveFromDesc(part);
      const damage = damageFromDesc(part);
      breaths.push({
        id: `breath.${c.id}${n ? `-${n}` : ''}`,
        kind: 'breath',
        name: `${c.name}: ${label}`,
        creature: c.id,
        shape,
        size: Number(m[1]),
        ...(shape === 'line' ? { width: m[3] ? Number(m[3]) : 5 } : {}),
        ...(damage ? { damage } : {}),
        ...(save ? { save } : {}),
        duration: 'Instantaneous',
        rounds: 0,
        concentration: false,
        spreads: false,
        desc: part,
        ...(a.usage ? { usage: a.usage } : {}),
      });
      n++;
    }
  }
}

// ------------------------------------------------------------------ Merkmale und Fallen (SRD 5.1)

const features = [
  {
    id: 'feature.aura-of-protection',
    kind: 'feature',
    name: 'Aura of Protection (Paladin 6)',
    shape: 'emanation',
    size: 10,
    duration: 'Special',
    rounds: null,
    concentration: false,
    spreads: false,
    desc: "Paladin, 6th level: friendly creatures within 10 feet of the paladin gain a bonus to saving throws equal to the paladin's Charisma modifier (minimum +1). At 18th level, the range increases to 30 feet.",
  },
  {
    id: 'feature.aura-of-courage',
    kind: 'feature',
    name: 'Aura of Courage (Paladin 10)',
    shape: 'emanation',
    size: 10,
    duration: 'Special',
    rounds: null,
    concentration: false,
    spreads: false,
    desc: "Paladin, 10th level: the paladin and friendly creatures within 10 feet of them can't be frightened while the paladin is conscious. At 18th level, the range increases to 30 feet.",
  },
];
const traps = [
  {
    id: 'trap.fire-breathing-statue',
    kind: 'trap',
    name: 'Fire-Breathing Statue',
    shape: 'cone',
    size: 30,
    damage: { type: 'fire', dice: { base: '4d10' } },
    save: { ability: 'dex', dc: 13, success: 'half' },
    duration: 'Instantaneous',
    rounds: 0,
    concentration: false,
    spreads: false,
    desc: 'Magic trap: when activated, the statue exhales a 30-foot cone of fire. Each creature in the fire must make a DC 13 Dexterity saving throw, taking 22 (4d10) fire damage on a failed save, or half as much damage on a successful one.',
  },
];

const effects = [...spells, ...items, ...breaths, ...features, ...traps];
for (const e of effects) {
  if (!['sphere', 'cylinder', 'cone', 'cube', 'line', 'emanation', 'square'].includes(e.shape)) {
    throw new Error(`Unbekannte Form ${e.shape} bei ${e.id}`);
  }
  if (e.damage && !DAMAGE_TYPES.includes(e.damage.type)) delete e.damage;
}
writeFileSync(join(outDir, 'effects.json'), JSON.stringify({ source: SOURCE, effects }));
const count = (k) => effects.filter((e) => e.kind === k).length;
console.log(
  `effects.json: ${effects.length} (Zauber ${count('spell')}, Gegenstände ${count('item')}, Odem ${count('breath')}, Merkmale ${count('feature')}, Fallen ${count('trap')})`,
);
