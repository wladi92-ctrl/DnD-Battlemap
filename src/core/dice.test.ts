import { describe, expect, it } from 'vitest';
import { averageOf, cryptoRng, doubleDice, parseDice, roll, rollD20, type Rng } from './dice';

/** Liefert die Zahlen der Reihe nach (für deterministische Tests). */
const seq = (...values: number[]): Rng => {
  let i = 0;
  return () => values[i++ % values.length] as number;
};

describe('Würfel', () => {
  it('zerlegt Ausdrücke (auch deutsch "W") und lehnt Unsinn ab', () => {
    expect(parseDice('8d6')).toMatchObject({
      terms: [{ count: 8, sides: 6, sign: 1 }],
      modifier: 0,
      text: '8d6',
    });
    expect(parseDice(' 2W6 + 3 ')?.text).toBe('2d6+3');
    expect(parseDice('d20-1')?.text).toBe('1d20-1');
    expect(parseDice('3d8+2d6+4')?.terms).toHaveLength(2);
    expect(parseDice('1d20-1d4')?.terms[1]?.sign).toBe(-1);
    expect(parseDice('5')?.text).toBe('5');
    for (const bad of ['', 'abc', '2d', 'd', '2d6++3', '0d6', '1001d6', '2x6'])
      expect(parseDice(bad)).toBeNull();
  });

  it('würfelt mit Zufallsquelle und summiert korrekt', () => {
    expect(roll('2d6+3', seq(4, 5))).toMatchObject({ rolls: [[4, 5]], total: 12 });
    expect(roll('1d20-1d4', seq(15, 3))?.total).toBe(12);
    expect(roll('kaputt')).toBeNull();
  });

  it('Durchschnitt wie im Statblock und doppelte Würfel bei kritischen Treffern', () => {
    expect(averageOf('8d6')).toBe(28);
    expect(averageOf('4d10')).toBe(22);
    expect(averageOf('2d6+3')).toBe(10);
    expect(doubleDice('2d6+3')).toBe('4d6+3');
  });

  it('W20 mit Vorteil/Nachteil', () => {
    expect(rollD20(3, 'normal', seq(11))).toEqual({ rolls: [11], natural: 11, total: 14 });
    expect(rollD20(0, 'advantage', seq(4, 17)).natural).toBe(17);
    expect(rollD20(2, 'disadvantage', seq(4, 17)).total).toBe(6);
  });

  it('kryptografischer Zufall bleibt im Bereich und trifft alle Werte', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = cryptoRng(6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });
});
