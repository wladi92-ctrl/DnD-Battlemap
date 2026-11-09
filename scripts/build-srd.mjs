#!/usr/bin/env node
/**
 * Wandelt die SRD-5.1-Rohdaten aus 5e-bits/5e-database (MIT) in das schlanke Format der App um.
 * Wird nur zur Entwicklungszeit ausgeführt; die App bündelt das Ergebnis (offline).
 *
 * Aufruf: node scripts/build-srd.mjs <Ordner mit 5e-SRD-*.json> <Commit-SHA>
 * Ausgabe: src/data/srd/creatures.json, src/data/srd/conditions.json
 *
 * Bewusst NICHT übernommen: Bildverweise (offizielle Artworks) und URLs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [, , rawDir, commit] = process.argv;
if (!rawDir || !commit) {
  console.error('Aufruf: node scripts/build-srd.mjs <Rohdaten-Ordner> <Commit-SHA>');
  process.exit(1);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'src', 'data', 'srd');
const read = (name) => JSON.parse(readFileSync(join(rawDir, name), 'utf8'));

const SOURCE = {
  name: 'System Reference Document 5.1 (CC-BY-4.0), maschinenlesbar über 5e-bits/5e-database (MIT)',
  repository: 'https://github.com/5e-bits/5e-database',
  commit,
};

/** "30 ft." → 30; "60 ft. (blind beyond this radius)" → 60 */
export function feet(value) {
  const m = /(\d+)\s*ft/.exec(String(value));
  return m ? Number(m[1]) : 0;
}

const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

function speeds(s) {
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'hover') out.hover = Boolean(v);
    else out[k] = feet(v);
  }
  return out;
}

function senses(s) {
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'passive_perception') out.passive = Number(v);
    else out[k] = feet(v);
  }
  return out;
}

function action(a) {
  const out = { name: a.name, desc: a.desc ?? '' };
  if (typeof a.attack_bonus === 'number') out.attack = a.attack_bonus;
  const dmg = (a.damage ?? [])
    .filter((d) => d.damage_dice && d.damage_type)
    .map((d) => ({ dice: d.damage_dice.replace(/\s+/g, ''), type: d.damage_type.index }));
  if (dmg.length) out.damage = dmg;
  if (a.dc?.dc_type && a.dc.dc_value) {
    out.dc = {
      ability: a.dc.dc_type.index,
      value: a.dc.dc_value,
      success: a.dc.success_type ?? 'none',
    };
  }
  if (a.usage) {
    const u = a.usage;
    out.usage =
      u.type === 'recharge on roll'
        ? `Recharge ${u.min_value}–6`
        : u.type === 'per day'
          ? `${u.times}/Day`
          : u.rest_types?.length
            ? `Recharges after a ${u.rest_types.join(' or ')} rest`
            : u.type;
  }
  return out;
}

/** Größte Nahkampfreichweite aus den Angriffstexten ("reach 10 ft."), sonst 5 ft. */
export function meleeReach(actions) {
  let reach = 0;
  for (const a of actions) {
    const m = /reach (\d+) ft/.exec(a.desc ?? '');
    if (m) reach = Math.max(reach, Number(m[1]));
  }
  return reach || 5;
}

function creature(m) {
  if (!SIZES.includes(m.size)) throw new Error(`Unbekannte Größe bei ${m.index}: ${m.size}`);
  const ac = m.armor_class[0];
  const acNote = m.armor_class
    .map((a) =>
      a.armor?.length
        ? a.armor.map((x) => x.name.toLowerCase()).join(', ')
        : a.type === 'natural'
          ? 'natural armor'
          : a.type === 'condition' && a.condition
            ? `${a.value} with ${a.condition.name.toLowerCase()}`
            : a.type === 'spell' && a.spell
              ? `${a.value} with ${a.spell.name.toLowerCase()}`
              : '',
    )
    .filter(Boolean)
    .join('; ');
  const saves = {};
  const skills = {};
  for (const p of m.proficiencies ?? []) {
    const idx = p.proficiency.index;
    if (idx.startsWith('saving-throw-')) saves[idx.slice(13)] = p.value;
    else if (idx.startsWith('skill-')) skills[idx.slice(6)] = p.value;
  }
  const actions = (m.actions ?? []).map(action);
  const out = {
    id: m.index,
    name: m.name,
    size: m.size.toLowerCase(),
    type: m.type,
    ...(m.subtype ? { subtype: m.subtype } : {}),
    alignment: m.alignment,
    ac: ac.value,
    ...(acNote ? { acNote } : {}),
    hp: m.hit_points,
    hitDice: m.hit_points_roll ?? m.hit_dice,
    speed: speeds(m.speed),
    abilities: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].map(
      (k) => m[k],
    ),
    saves,
    skills,
    vulnerable: m.damage_vulnerabilities ?? [],
    resist: m.damage_resistances ?? [],
    immune: m.damage_immunities ?? [],
    conditionImmune: (m.condition_immunities ?? []).map((c) => c.index),
    senses: senses(m.senses),
    languages: m.languages ?? '',
    cr: m.challenge_rating,
    xp: m.xp,
    prof: m.proficiency_bonus,
    reach: meleeReach(m.actions ?? []),
    traits: (m.special_abilities ?? []).map(action),
    actions,
    reactions: (m.reactions ?? []).map(action),
    legendary: (m.legendary_actions ?? []).map(action),
  };
  return out;
}

const monsters = read('5e-SRD-Monsters.json');
const creatures = monsters.map(creature).sort((a, b) => a.name.localeCompare(b.name, 'en'));
const conditions = read('5e-SRD-Conditions.json').map((c) => ({
  id: c.index,
  name: c.name,
  desc: (Array.isArray(c.desc) ? c.desc : [c.desc]).map((d) => d.replace(/^-\s*/, '')),
}));

writeFileSync(join(outDir, 'creatures.json'), JSON.stringify({ source: SOURCE, creatures }) + '\n');
writeFileSync(
  join(outDir, 'conditions.json'),
  JSON.stringify({ source: SOURCE, conditions }, null, 1) + '\n',
);
console.log(`${creatures.length} Kreaturen, ${conditions.length} Zustände → ${outDir}`);
