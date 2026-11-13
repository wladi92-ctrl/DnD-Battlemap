import { describe, expect, it } from 'vitest';
import { encounterMultiplier, evaluateEncounter, partyThresholds } from './encounter';

describe('Begegnungsschwierigkeit (DMG 2014)', () => {
  it('Schwellen der Gruppe', () => {
    // DMG-Beispiel: vier Charaktere der Stufe 3 → mittel 600, schwer 900, tödlich 1600
    expect(partyThresholds([3, 3, 3, 3])).toEqual({
      easy: 300,
      medium: 600,
      hard: 900,
      deadly: 1600,
    });
    expect(partyThresholds([0, 25])).toEqual(partyThresholds([1, 20]));
  });

  it('Multiplikatoren nach Monsteranzahl und Gruppengröße', () => {
    expect([1, 2, 3, 6, 7, 10, 11, 14, 15, 30].map((n) => encounterMultiplier(n, 4))).toEqual([
      1, 1.5, 2, 2, 2.5, 2.5, 3, 3, 4, 4,
    ]);
    // weniger als 3 Charaktere: nächsthöhere Stufe (bis ×5)
    expect(encounterMultiplier(1, 2)).toBe(1.5);
    expect(encounterMultiplier(15, 1)).toBe(5);
    // 6 und mehr Charaktere: nächstniedrigere Stufe (bis ×0,5)
    expect(encounterMultiplier(1, 6)).toBe(0.5);
    expect(encounterMultiplier(4, 7)).toBe(1.5);
    expect(encounterMultiplier(0, 4)).toBe(0);
  });

  it('Bewertung: vier Charaktere Stufe 3 gegen ein Oger und zwei Goblins', () => {
    // Oger 450 XP, Goblin 50 XP → 550 XP, 3 Monster ×2 = 1100 → schwer (≥ 900, < 1600)
    const r = evaluateEncounter(
      [3, 3, 3, 3],
      [
        { xp: 450, count: 1 },
        { xp: 50, count: 2 },
      ],
    );
    expect(r).toMatchObject({
      totalXp: 550,
      monsterCount: 3,
      multiplier: 2,
      adjustedXp: 1100,
      difficulty: 'hard',
      xpPerCharacter: 137,
    });
  });

  it('Grenzfälle: trivial, tödlich, leere Gruppe', () => {
    expect(evaluateEncounter([5, 5, 5, 5], [{ xp: 10, count: 1 }]).difficulty).toBe('trivial');
    expect(evaluateEncounter([1, 1, 1, 1], [{ xp: 450, count: 1 }]).difficulty).toBe('deadly');
    expect(evaluateEncounter([1], [{ xp: 25, count: 1 }]).difficulty).toBe('easy');
    expect(evaluateEncounter([], [{ xp: 100, count: 1 }])).toMatchObject({
      difficulty: 'trivial',
      xpPerCharacter: 0,
    });
  });
});
