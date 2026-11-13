/**
 * Begegnungen: Gruppe (Charakterstufen) und Monstergruppen; Bewertung, Platzieren auf der Karte
 * (alle Gruppen in einem Rückgängig-Schritt) und Zusammenfassung als Markdown.
 */
import type { Cell } from '../core/grid';
import { evaluateEncounter, type EncounterResult } from '../core/encounter';
import { formatCr, type Creature } from '../data/srd/creatures';
import type { MapDocument, Team } from '../storage/mapDocument';
import { applyPatch, mergePatches, type DocPatch } from './patch';
import type { OpResult } from './ops';
import type { MessageKey } from '../i18n';
import { spawnTokens, templateFromCreature, type TokenTemplate } from './tokens';

export interface EncounterMember {
  name: string;
  level: number;
}

export interface EncounterGroup {
  /** Kreatur-ID (SRD oder „custom:…“). */
  source: string;
  name: string;
  count: number;
  team: Team;
}

export interface Encounter {
  id: string;
  name: string;
  party: EncounterMember[];
  groups: EncounterGroup[];
  notes: string;
}

export const ENCOUNTER_GROUPS_MAX = 30;

export function newEncounter(name: string): Encounter {
  return { id: crypto.randomUUID(), name, party: [], groups: [], notes: '' };
}

/** Bewertung mit den XP der Kreaturen (unbekannte Kreaturen zählen mit 0 XP). */
export function rateEncounter(
  e: Pick<Encounter, 'party' | 'groups'>,
  creatures: ReadonlyMap<string, Creature>,
): EncounterResult {
  return evaluateEncounter(
    e.party.map((m) => m.level),
    e.groups
      .filter((g) => g.team === 'enemy')
      .map((g) => ({ xp: creatures.get(g.source)?.xp ?? 0, count: g.count })),
  );
}

/**
 * Setzt alle Gruppen nebeneinander ab `at` (freie Felder werden gesucht); ein gemeinsamer
 * Rückgängig-Schritt. `image` liefert optional ein Token-Bild (Pfad in assets/) je Kreatur.
 */
export function spawnEncounter(
  doc: MapDocument,
  e: Pick<Encounter, 'groups'>,
  creatures: ReadonlyMap<string, Creature>,
  at: Cell,
  image?: (source: string) => string | undefined,
): { result: OpResult; ids: string[]; missing: string[] } {
  let current = doc;
  let patch: DocPatch | null = null;
  const ids: string[] = [];
  const missing: string[] = [];
  for (const g of e.groups) {
    const c = creatures.get(g.source);
    if (!c) {
      missing.push(g.name);
      continue;
    }
    const img = image?.(g.source);
    const template: TokenTemplate = {
      ...templateFromCreature(c, g.team),
      ...(img ? { image: img } : {}),
    };
    const r = spawnTokens(current, template, at, g.count);
    if (!r.result.ok) {
      if (r.result.reason === 'locked') return { result: r.result, ids: [], missing };
      continue;
    }
    current = applyPatch(current, r.result.patch);
    patch = patch ? mergePatches(patch, r.result.patch) : r.result.patch;
    ids.push(...r.ids);
  }
  return {
    result: patch ? { ok: true, patch } : { ok: false, reason: 'outside' },
    ids,
    missing,
  };
}

type T = (key: MessageKey, params?: Record<string, string | number>) => string;

/** Zusammenfassung als Markdown (für Notizen, Ausdruck, Weitergabe). */
export function encounterMarkdown(
  e: Encounter,
  creatures: ReadonlyMap<string, Creature>,
  t: T,
): string {
  const r = rateEncounter(e, creatures);
  const lines: string[] = [`# ${e.name}`, ''];
  lines.push(`## ${t('encounter.party')}`, '');
  if (e.party.length) {
    for (const m of e.party)
      lines.push(`- ${m.name} – ${t('encounter.levelN', { level: m.level })}`);
  } else lines.push(`- ${t('encounter.noParty')}`);
  lines.push('', `## ${t('encounter.monsters')}`, '');
  lines.push(
    `| ${t('encounter.col.count')} | ${t('encounter.col.creature')} | ${t('encounter.col.cr')} | XP | ${t('encounter.col.ac')} | ${t('encounter.col.hp')} | ${t('encounter.col.side')} |`,
    '| ---: | --- | ---: | ---: | ---: | ---: | --- |',
  );
  for (const g of e.groups) {
    const c = creatures.get(g.source);
    lines.push(
      `| ${g.count} | ${g.name} | ${c ? formatCr(c.cr) : '–'} | ${c ? c.xp * g.count : 0} | ${c?.ac ?? '–'} | ${c ? `${c.hp} (${c.hitDice})` : '–'} | ${t(`team.${g.team}`)} |`,
    );
  }
  lines.push('', `## ${t('encounter.rating')}`, '');
  lines.push(
    `- ${t('encounter.totalXp')}: ${r.totalXp} (${t('encounter.perCharacter', { xp: r.xpPerCharacter })})`,
    `- ${t('encounter.adjustedXp')}: ${r.adjustedXp} (× ${r.multiplier}, ${t('encounter.monsterCount', { count: r.monsterCount })})`,
    `- ${t('encounter.thresholds')}: ${t('difficulty.easy')} ${r.thresholds.easy} · ${t('difficulty.medium')} ${r.thresholds.medium} · ${t('difficulty.hard')} ${r.thresholds.hard} · ${t('difficulty.deadly')} ${r.thresholds.deadly}`,
    `- **${t('encounter.difficulty')}: ${t(`difficulty.${r.difficulty}`)}**`,
    '',
    `_${t('encounter.dmgNote')}_`,
  );
  // Kurzwerte der beteiligten Kreaturen (aus dem SRD bzw. eigenen Kreaturen)
  const seen = new Set<string>();
  const blocks: string[] = [];
  for (const g of e.groups) {
    const c = creatures.get(g.source);
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    const speed = Object.entries(c.speed)
      .map(([k, v]) => (k === 'walk' ? `${v} ft` : `${k} ${v} ft`))
      .join(', ');
    blocks.push(
      `### ${c.name}`,
      '',
      `${t('encounter.col.ac')} ${c.ac} · ${t('encounter.col.hp')} ${c.hp} (${c.hitDice}) · ${speed} · ${t('encounter.col.cr')} ${formatCr(c.cr)}`,
      '',
      ...c.actions.map((a) => `- **${a.name}.** ${a.desc}`),
      '',
    );
  }
  if (blocks.length) lines.push('', `## ${t('encounter.statblocks')}`, '', ...blocks);
  if (e.notes.trim()) lines.push('', `## ${t('encounter.notes')}`, '', e.notes.trim());
  return `${lines.join('\n').trimEnd()}\n`;
}
