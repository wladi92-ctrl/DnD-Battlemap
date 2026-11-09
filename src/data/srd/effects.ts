/**
 * Effektbibliothek (SRD 5.1): Zauber, Gegenstände, Odemwaffen, Merkmale und Fallen mit Bereich.
 * Erzeugt mit scripts/build-srd-effects.mjs; Texte im englischen Original.
 * Wird erst bei Bedarf geladen (eigener Chunk).
 */
import type { AoeShape } from '../../core/aoe';
import type { DamageType, SaveAbility } from '../../storage/mapDocument';

export type EffectKind = 'spell' | 'item' | 'breath' | 'feature' | 'trap' | 'custom';
export const EFFECT_KINDS: readonly EffectKind[] = [
  'spell',
  'item',
  'breath',
  'feature',
  'trap',
  'custom',
];

export interface EffectSource {
  id: string;
  kind: EffectKind;
  name: string;
  /** Zaubergrad (0 = Zaubertrick). */
  level?: number;
  school?: string;
  range?: string;
  shape: Exclude<AoeShape, 'free'>;
  size: number;
  width?: number;
  damage?: {
    type: DamageType;
    /** Schaden je Grad ("3": "8d6") bzw. Charakterstufe oder "base". */
    dice: Record<string, string>;
    scaling?: 'slot' | 'character';
  };
  save?: { ability: SaveAbility; dc?: number; success: 'half' | 'none' };
  duration: string;
  /** Dauer in Runden (0 = sofort, null = unbegrenzt/besonders). */
  rounds: number | null;
  concentration: boolean;
  /** "spreads around corners" laut SRD-Text. */
  spreads: boolean;
  desc: string;
  higherLevel?: string;
  creature?: string;
  usage?: { type: string; times?: number; dice?: string; min_value?: number } | string;
  rarity?: string;
  viaSpell?: string;
}

let cache: Promise<EffectSource[]> | null = null;

export function loadEffectSources(): Promise<EffectSource[]> {
  cache ??= import('./effects.json').then(
    (m) => (m.default as unknown as { effects: EffectSource[] }).effects,
  );
  return cache;
}

/** Wählbare Grade für die Schadensskalierung (Zauber mit Schaden je Grad). */
export function slotLevels(src: EffectSource): number[] {
  if (src.damage?.scaling !== 'slot') return [];
  return Object.keys(src.damage.dice)
    .map(Number)
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);
}

/** Schadenswürfel für einen Grad (Zauber) bzw. Charakterstufe (Zaubertricks) oder Grundwert. */
export function damageDice(src: EffectSource, level?: number): string | undefined {
  const d = src.damage?.dice;
  if (!d) return undefined;
  if (d.base) return d.base;
  const keys = Object.keys(d)
    .map(Number)
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);
  if (!keys.length) return undefined;
  const want = level ?? keys[0] ?? 0;
  // Höchster Eintrag ≤ gewünschtem Grad/Stufe (Zaubertricks: 1/5/11/17).
  const key = [...keys].reverse().find((k) => k <= want) ?? keys[0];
  return d[String(key)];
}
