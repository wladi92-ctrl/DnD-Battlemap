/**
 * Würfel: Ausdrücke wie "8d6", "2d6+3", "1d20-1", "3d8 + 2d6 + 4" sowie W20 mit Vorteil/Nachteil.
 * Zufall standardmäßig kryptografisch (crypto.getRandomValues) ohne Modulo-Verzerrung.
 */

export type Rng = (sides: number) => number;

/** Gleichverteilte Zahl 1…sides aus crypto.getRandomValues (Rejection Sampling). */
export const cryptoRng: Rng = (sides) => {
  const n = Math.max(1, Math.floor(sides));
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const v = buf[0] as number;
    if (v < limit) return (v % n) + 1;
  }
};

export interface DiceTerm {
  count: number;
  sides: number;
  /** -1 bei abgezogenen Würfeln ("1d20-1d4"). */
  sign: 1 | -1;
}

export interface DiceExpression {
  terms: DiceTerm[];
  modifier: number;
  /** Normalisierte Schreibweise, z. B. "2d6+3". */
  text: string;
}

export const DICE_MAX_COUNT = 1000;
export const DICE_SIDES = [2, 3, 4, 6, 8, 10, 12, 20, 100];

/** Zerlegt einen Ausdruck; null bei ungültiger Eingabe. "W" (deutsch) wird wie "d" akzeptiert. */
export function parseDice(input: string): DiceExpression | null {
  const src = input.replace(/\s+/g, '').toLowerCase().replace(/w/g, 'd');
  if (!src || !/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(src)) return null;
  const terms: DiceTerm[] = [];
  let modifier = 0;
  for (const m of src.matchAll(/([+-]?)(\d*d\d+|\d+)/g)) {
    const sign = m[1] === '-' ? -1 : 1;
    const part = m[2] as string;
    if (part.includes('d')) {
      const [c, s] = part.split('d');
      const count = c ? Number(c) : 1;
      const sides = Number(s);
      if (count < 1 || count > DICE_MAX_COUNT || sides < 1 || sides > 1000) return null;
      terms.push({ count, sides, sign });
    } else {
      modifier += sign * Number(part);
    }
  }
  const text =
    terms.map((t, i) => `${t.sign < 0 ? '-' : i ? '+' : ''}${t.count}d${t.sides}`).join('') +
    (modifier ? `${modifier > 0 && terms.length ? '+' : ''}${modifier}` : terms.length ? '' : '0');
  return { terms, modifier, text };
}

export interface DiceRoll {
  expression: string;
  /** Einzelergebnisse je Würfelterm. */
  rolls: number[][];
  modifier: number;
  total: number;
}

export function rollExpression(expr: DiceExpression, rng: Rng = cryptoRng): DiceRoll {
  const rolls = expr.terms.map((t) => Array.from({ length: t.count }, () => rng(t.sides)));
  const dice = rolls.reduce(
    (sum, r, i) => sum + (expr.terms[i]?.sign ?? 1) * r.reduce((a, b) => a + b, 0),
    0,
  );
  return { expression: expr.text, rolls, modifier: expr.modifier, total: dice + expr.modifier };
}

/** Würfelt einen Ausdruck; null bei ungültiger Eingabe. */
export function roll(input: string, rng: Rng = cryptoRng): DiceRoll | null {
  const e = parseDice(input);
  return e ? rollExpression(e, rng) : null;
}

/** Durchschnitt (abgerundet wie im Statblock, z. B. 8d6 → 28). */
export function averageOf(input: string): number | null {
  const e = parseDice(input);
  if (!e) return null;
  const avg = e.terms.reduce((s, t) => s + t.sign * t.count * ((t.sides + 1) / 2), 0) + e.modifier;
  return Math.floor(avg);
}

/** Doppelte Würfelanzahl (kritischer Treffer): "2d6+3" → "4d6+3". */
export function doubleDice(input: string): string | null {
  const e = parseDice(input);
  if (!e) return null;
  return (
    parseDice(
      e.terms
        .map((t, i) => `${t.sign < 0 ? '-' : i ? '+' : ''}${t.count * 2}d${t.sides}`)
        .join('') +
        (e.modifier ? `${e.modifier > 0 && e.terms.length ? '+' : ''}${e.modifier}` : ''),
    )?.text ?? null
  );
}

export type Advantage = 'normal' | 'advantage' | 'disadvantage';

export interface D20Roll {
  rolls: number[];
  /** Gewerteter W20. */
  natural: number;
  total: number;
}

/** W20 + Bonus; bei Vorteil/Nachteil zwei Würfe, der höhere/niedrigere zählt. */
export function rollD20(bonus: number, mode: Advantage = 'normal', rng: Rng = cryptoRng): D20Roll {
  const rolls = mode === 'normal' ? [rng(20)] : [rng(20), rng(20)];
  const natural =
    mode === 'advantage'
      ? Math.max(...rolls)
      : mode === 'disadvantage'
        ? Math.min(...rolls)
        : (rolls[0] as number);
  return { rolls, natural, total: natural + bonus };
}
