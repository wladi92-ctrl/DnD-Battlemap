import { describe, expect, it } from 'vitest';
import type { Rng } from '../core/dice';
import { loadCreatures, type Creature } from '../data/srd/creatures';
import { attackOptions, attackRoll, damageAgainst, rollDamage } from './attack';

const seq = (...values: number[]): Rng => {
  let i = 0;
  return () => values[i++ % values.length] as number;
};

describe('Angriffs-Helfer', () => {
  it('liest Angriffe aus dem Statblock (Goblin: Krummsäbel und Kurzbogen)', async () => {
    const goblin = (await loadCreatures()).find((c) => c.id === 'goblin');
    const opts = attackOptions(goblin);
    expect(opts.map((o) => o.name)).toEqual(['Scimitar', 'Shortbow']);
    expect(opts[0]).toMatchObject({ bonus: 4, parts: [{ dice: '1d6+2', type: 'slashing' }] });
  });

  it('Treffer gegen RK, natürliche 20 kritisch, natürliche 1 verfehlt', () => {
    expect(attackRoll(4, 15, 'normal', seq(11))).toMatchObject({
      total: 15,
      hit: true,
      critical: false,
    });
    expect(attackRoll(4, 15, 'normal', seq(10))).toMatchObject({ hit: false });
    expect(attackRoll(-5, 30, 'normal', seq(20))).toMatchObject({ hit: true, critical: true });
    expect(attackRoll(20, 5, 'normal', seq(1))).toMatchObject({ hit: false });
    expect(attackRoll(0, 15, 'advantage', seq(3, 16))).toMatchObject({ natural: 16, hit: true });
  });

  it('kritischer Schaden verdoppelt die Würfel, nicht den Modifikator; Resistenzen je Art', () => {
    const parts = rollDamage(
      [
        { dice: '1d6+2', type: 'slashing' },
        { dice: '2d6', type: 'fire' },
      ],
      true,
      seq(3),
    );
    expect(parts).toEqual([
      { dice: '2d6+2', type: 'slashing', total: 8 },
      { dice: '4d6', type: 'fire', total: 12 },
    ]);
    const target = {
      immune: ['fire'],
      resist: ['slashing'],
      vulnerable: [],
    } as unknown as Creature;
    expect(damageAgainst(parts, target)).toBe(4);
    expect(damageAgainst(parts, undefined)).toBe(20);
  });
});
