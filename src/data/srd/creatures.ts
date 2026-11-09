/**
 * SRD-5.1-Kreaturen (englischer Originaltext) und Zustände.
 * Erzeugt mit scripts/build-srd.mjs aus 5e-bits/5e-database; Quelle/Commit in den JSON-Dateien.
 * Die Kreaturenliste (~0,5 MB) wird erst bei Bedarf geladen.
 */
import conditionsData from './conditions.json';

export type SizeCategory = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';
export const SIZE_CATEGORIES: readonly SizeCategory[] = [
  'tiny',
  'small',
  'medium',
  'large',
  'huge',
  'gargantuan',
];

/** Kantenlänge des belegten Bereichs in Feldern (SRD: Tiny 2½ ft, Large 10 ft, …). */
export const SIZE_CELLS: Record<SizeCategory, number> = {
  tiny: 0.5,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
};

export interface CreatureAction {
  name: string;
  desc: string;
  attack?: number;
  damage?: { dice: string; type: string }[];
  dc?: { ability: string; value: number; success: string };
  usage?: string;
}

export interface Creature {
  id: string;
  name: string;
  size: SizeCategory;
  type: string;
  subtype?: string;
  alignment: string;
  ac: number;
  acNote?: string;
  hp: number;
  hitDice: string;
  speed: {
    walk?: number;
    fly?: number;
    swim?: number;
    climb?: number;
    burrow?: number;
    hover?: boolean;
  };
  /** STR, DEX, CON, INT, WIS, CHA */
  abilities: number[];
  saves: Record<string, number>;
  skills: Record<string, number>;
  vulnerable: string[];
  resist: string[];
  immune: string[];
  conditionImmune: string[];
  senses: {
    darkvision?: number;
    blindsight?: number;
    truesight?: number;
    tremorsense?: number;
    passive?: number;
  };
  languages: string;
  cr: number;
  xp: number;
  prof: number;
  /** Größte Nahkampfreichweite in ft (aus den Angriffen, sonst 5). */
  reach: number;
  traits: CreatureAction[];
  actions: CreatureAction[];
  reactions: CreatureAction[];
  legendary: CreatureAction[];
}

export interface ConditionInfo {
  id: string;
  name: string;
  desc: string[];
}

export const CONDITIONS: readonly ConditionInfo[] = conditionsData.conditions;
/** Herkunft der SRD-Daten (Repository und Commit, gilt für Kreaturen und Zustände). */
export const SRD_DATA_SOURCE: { name: string; repository: string; commit: string } =
  conditionsData.source;
export const CONDITION_IDS = CONDITIONS.map((c) => c.id);

let cache: Promise<Creature[]> | null = null;

/** Lädt die SRD-Kreaturen (eigener Chunk). */
export function loadCreatures(): Promise<Creature[]> {
  cache ??= import('./creatures.json').then(
    (m) => (m.default as { creatures: Creature[] }).creatures,
  );
  return cache;
}

/** Herausforderungsgrad als Text ("1/4", "1/2", "17"). */
export function formatCr(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return String(cr);
}

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `−${Math.abs(mod)}`;
}

export interface CreatureFilter {
  query: string;
  type: string;
  size: string;
  crMin: number;
  crMax: number;
}

/** Filter nach Name, Typ (auch deutsch, über `typeLabel`), Größe und HG-Bereich. */
export function filterCreatures(
  list: readonly Creature[],
  f: CreatureFilter,
  typeLabel: (type: string) => string,
): Creature[] {
  const q = f.query.trim().toLocaleLowerCase('de');
  return list.filter(
    (c) =>
      (!f.type || c.type === f.type) &&
      (!f.size || c.size === f.size) &&
      c.cr >= f.crMin &&
      c.cr <= f.crMax &&
      (!q ||
        c.name.toLocaleLowerCase('de').includes(q) ||
        typeLabel(c.type).toLocaleLowerCase('de').includes(q) ||
        (c.subtype ?? '').includes(q)),
  );
}
