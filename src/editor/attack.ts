/**
 * Angriffs-Helfer (SRD 5.1): Trefferwurf W20 + Bonus gegen RK; natürliche 20 trifft immer
 * kritisch (Schadenswürfel doppelt), natürliche 1 verfehlt immer. Schaden je Schadensart mit
 * Resistenz/Immunität/Anfälligkeit des Ziels.
 */
import { cryptoRng, doubleDice, roll, rollD20, type Advantage, type Rng } from '../core/dice';
import type { Creature } from '../data/srd/creatures';
import { DAMAGE_TYPES, type DamageType } from '../storage/mapDocument';
import { damageResponse, finalDamage } from './effects';

export interface AttackPart {
  dice: string;
  type?: DamageType;
}

export interface AttackOption {
  name: string;
  bonus: number;
  parts: AttackPart[];
}

/** Angriffe aus einem Statblock (Aktionen mit Trefferbonus und Schaden). */
export function attackOptions(c: Creature | undefined): AttackOption[] {
  if (!c) return [];
  return c.actions
    .filter((a) => typeof a.attack === 'number' && a.damage?.length)
    .map((a) => ({
      name: a.name,
      bonus: a.attack as number,
      parts: (a.damage ?? []).map((d) => ({
        dice: d.dice,
        ...(DAMAGE_TYPES.includes(d.type as DamageType) ? { type: d.type as DamageType } : {}),
      })),
    }));
}

export interface AttackRoll {
  rolls: number[];
  natural: number;
  total: number;
  hit: boolean;
  critical: boolean;
}

/** Trefferwurf gegen eine Rüstungsklasse. */
export function attackRoll(
  bonus: number,
  ac: number,
  mode: Advantage = 'normal',
  rng: Rng = cryptoRng,
): AttackRoll {
  const r = rollD20(bonus, mode, rng);
  const critical = r.natural === 20;
  const hit = r.natural !== 1 && (critical || r.total >= ac);
  return { rolls: r.rolls, natural: r.natural, total: r.total, hit, critical };
}

export interface DamageRollPart {
  dice: string;
  type?: DamageType;
  total: number;
}

/** Schaden würfeln (kritisch: doppelte Würfel, Modifikator einfach). */
export function rollDamage(
  parts: readonly AttackPart[],
  critical: boolean,
  rng: Rng = cryptoRng,
): DamageRollPart[] {
  return parts.map((p) => {
    const dice = critical ? (doubleDice(p.dice) ?? p.dice) : p.dice;
    return {
      dice,
      ...(p.type ? { type: p.type } : {}),
      total: Math.max(0, roll(dice, rng)?.total ?? 0),
    };
  });
}

/** Schaden am Ziel nach Resistenzen (je Schadensart einzeln). */
export function damageAgainst(
  parts: readonly DamageRollPart[],
  target: Creature | undefined,
): number {
  return parts.reduce(
    (sum, p) => sum + finalDamage(p.total, false, false, damageResponse(target, p.type)),
    0,
  );
}
