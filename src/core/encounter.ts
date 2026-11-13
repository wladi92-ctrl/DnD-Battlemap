/**
 * Begegnungsschwierigkeit nach den 5e-Regeln.
 *
 * HINWEIS: Die Schwellenwerte je Charakterstufe und die Multiplikatoren nach Monsteranzahl
 * stammen aus dem Dungeon Master's Guide (2014) und sind NICHT Teil des SRD 5.1. Sie werden
 * auf ausdrücklichen Wunsch verwendet und in der Oberfläche entsprechend gekennzeichnet.
 * Die XP-Werte der Kreaturen selbst stammen aus dem SRD.
 */

export type Difficulty = 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly';
export const DIFFICULTIES: readonly Exclude<Difficulty, 'trivial'>[] = [
  'easy',
  'medium',
  'hard',
  'deadly',
];

/** XP-Schwellen je Charakterstufe 1–20: [leicht, mittel, schwer, tödlich] (DMG 2014, S. 82). */
export const XP_THRESHOLDS: readonly (readonly [number, number, number, number])[] = [
  [25, 50, 75, 100],
  [50, 100, 150, 200],
  [75, 150, 225, 400],
  [125, 250, 375, 500],
  [250, 500, 750, 1100],
  [300, 600, 900, 1400],
  [350, 750, 1100, 1700],
  [450, 900, 1400, 2100],
  [550, 1100, 1600, 2400],
  [600, 1200, 1900, 2800],
  [800, 1600, 2400, 3600],
  [1000, 2000, 3000, 4500],
  [1100, 2200, 3400, 5100],
  [1250, 2500, 3800, 5700],
  [1400, 2800, 4300, 6400],
  [1600, 3200, 4800, 7200],
  [2000, 3900, 5900, 8800],
  [2100, 4200, 6300, 9500],
  [2400, 4900, 7300, 10900],
  [2800, 5700, 8500, 12700],
];

/** Multiplikatorstufen (DMG 2014, S. 82); die äußeren Stufen gelten nur nach Gruppenanpassung. */
const MULTIPLIERS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5] as const;

/** Stufe in MULTIPLIERS für die Anzahl der Monster (ohne Gruppenanpassung). */
function multiplierIndex(monsters: number): number {
  if (monsters <= 1) return 1;
  if (monsters === 2) return 2;
  if (monsters <= 6) return 3;
  if (monsters <= 10) return 4;
  if (monsters <= 14) return 5;
  return 6;
}

/**
 * Multiplikator für die Begegnung: Gruppen mit weniger als 3 Charakteren nehmen die nächsthöhere
 * Stufe, Gruppen mit 6 oder mehr die nächstniedrigere.
 */
export function encounterMultiplier(monsters: number, partySize: number): number {
  if (monsters <= 0) return 0;
  let i = multiplierIndex(monsters);
  if (partySize > 0 && partySize < 3) i += 1;
  else if (partySize >= 6) i -= 1;
  return MULTIPLIERS[Math.max(0, Math.min(MULTIPLIERS.length - 1, i))] ?? 1;
}

export interface EncounterMonster {
  xp: number;
  count: number;
}

export interface EncounterResult {
  /** Summe der XP aller Monster (das bekommen die Charaktere). */
  totalXp: number;
  monsterCount: number;
  multiplier: number;
  /** Angepasste XP (für die Schwierigkeit). */
  adjustedXp: number;
  /** Summen der Schwellen der Gruppe. */
  thresholds: Record<Exclude<Difficulty, 'trivial'>, number>;
  difficulty: Difficulty;
  /** XP pro Charakter. */
  xpPerCharacter: number;
}

export function clampLevel(level: number): number {
  return Math.min(20, Math.max(1, Math.round(level) || 1));
}

export function partyThresholds(levels: readonly number[]) {
  const sum = [0, 0, 0, 0];
  for (const l of levels) {
    const row = XP_THRESHOLDS[clampLevel(l) - 1];
    if (row) row.forEach((v, i) => (sum[i] = (sum[i] ?? 0) + v));
  }
  return { easy: sum[0] ?? 0, medium: sum[1] ?? 0, hard: sum[2] ?? 0, deadly: sum[3] ?? 0 };
}

export function evaluateEncounter(
  levels: readonly number[],
  monsters: readonly EncounterMonster[],
): EncounterResult {
  const monsterCount = monsters.reduce((a, m) => a + Math.max(0, m.count), 0);
  const totalXp = monsters.reduce((a, m) => a + Math.max(0, m.xp) * Math.max(0, m.count), 0);
  const multiplier = encounterMultiplier(monsterCount, levels.length);
  const adjustedXp = Math.round(totalXp * multiplier);
  const thresholds = partyThresholds(levels);
  let difficulty: Difficulty = 'trivial';
  if (levels.length && monsterCount) {
    for (const d of DIFFICULTIES) if (adjustedXp >= thresholds[d]) difficulty = d;
  }
  return {
    totalXp,
    monsterCount,
    multiplier,
    adjustedXp,
    thresholds,
    difficulty,
    xpPerCharacter: levels.length ? Math.floor(totalXp / levels.length) : 0,
  };
}
