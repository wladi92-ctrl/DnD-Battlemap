/** Übersetzte Bezeichnungen für SRD-Begriffe (Typen, Größen, Zustände, Seiten). */
import type { MessageKey } from '../../i18n';
import type { Team } from '../../storage/mapDocument';
import type { SizeCategory } from '../../data/srd/creatures';

type T = (key: MessageKey, params?: Record<string, string | number>) => string;

export const CREATURE_TYPES = [
  'aberration',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'giant',
  'humanoid',
  'monstrosity',
  'ooze',
  'plant',
  'swarm',
  'undead',
] as const;

/** SRD-Typ → Schlüssel ("swarm of Tiny beasts" → swarm). */
export function typeKey(type: string): string {
  return type.startsWith('swarm') ? 'swarm' : type;
}

export function typeLabel(t: T, type: string): string {
  const key = typeKey(type);
  return (CREATURE_TYPES as readonly string[]).includes(key)
    ? t(`ctype.${key}` as MessageKey)
    : type;
}

export const sizeLabel = (t: T, s: SizeCategory) => t(`size.${s}` as MessageKey);
export const teamLabel = (t: T, team: Team) => t(`team.${team}` as MessageKey);
export const conditionLabel = (t: T, id: string) => t(`condition.${id}` as MessageKey);
