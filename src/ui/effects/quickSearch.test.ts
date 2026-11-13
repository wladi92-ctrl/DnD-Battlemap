import { describe, expect, it } from 'vitest';
import effectsJson from '../../data/srd/effects.json';
import type { EffectSource } from '../../data/srd/effects';
import { translate, type MessageKey } from '../../i18n';
import { chooseSlot, parseQuickQuery, searchEffects } from './quickSearch';

const all = (effectsJson as { effects: EffectSource[] }).effects;
const t = (k: MessageKey) => translate('de', k);
const names = (q: string) => searchEffects(all, q, t).map((e) => e.name);

describe('Schnellsuche für Effekte', () => {
  it('Zahl am Ende ist der Grad', () => {
    expect(parseQuickQuery('fireball 5')).toEqual({ text: 'fireball', slot: 5 });
    expect(parseQuickQuery('  cone of cold ')).toEqual({ text: 'cone of cold', slot: null });
  });

  it('Namensanfang vor Wortanfang vor Teiltreffer', () => {
    expect(names('fire')[0]).toMatch(/^Fire/);
    // Exakter Name zuerst, danach z. B. Gegenstände mit „Fireball“ im Namen
    expect(names('fireball')[0]).toBe('Fireball');
    const ball = names('ball');
    expect(ball).toContain('Fireball'); // Teiltreffer
    expect(names('wall')[0]).toMatch(/^Wall of/); // Wortanfang „Wall of …“
  });

  it('deutsche Schadensart und Art finden Effekte', () => {
    const fire = searchEffects(all, 'Feuer', t, 50);
    expect(fire.length).toBeGreaterThan(5);
    expect(fire.every((e) => e.damage?.type === 'fire')).toBe(true);
    expect(searchEffects(all, 'Falle', t, 50).some((e) => e.kind === 'trap')).toBe(true);
    expect(names('xyzzy')).toEqual([]);
    expect(names('')).toEqual([]);
  });

  it('Grad: angegeben, falls zulässig, sonst der niedrigste', () => {
    const fireball = all.find((e) => e.id === 'spell.fireball')!;
    expect(chooseSlot(fireball, 5)).toBe(5);
    expect(chooseSlot(fireball, 1)).toBe(3); // Grad 1 gibt es für Feuerball nicht
    expect(chooseSlot(fireball, null)).toBe(3);
  });
});
