import { describe, expect, it } from 'vitest';
import {
  assignKey,
  buildKeymap,
  COMMANDS,
  isAssignable,
  keyIndex,
  keyLabel,
  resetCommand,
  sanitizeOverrides,
} from './keymap';

describe('Tastenbelegung', () => {
  it('Standardbelegung ist eindeutig', () => {
    const map = buildKeymap({});
    const all = COMMANDS.flatMap((c) => map[c.id]);
    expect(new Set(all).size).toBe(all.length);
    expect(keyIndex(map).get('b')).toBe('tool.brush');
    expect(keyIndex(map).get('pagedown')).toBe('nextTurn');
    expect(keyIndex(map).get('p')).toBe('ping');
  });

  it('neu belegen: der bisherige Inhaber verliert die Taste', () => {
    const r = assignKey({}, 'tool.brush', 'G');
    expect(r.displaced).toBe('grid');
    const map = buildKeymap(r.overrides);
    expect(map['tool.brush']).toEqual(['g']);
    expect(map.grid).toEqual([]);
    expect(keyIndex(map).get('b')).toBeUndefined();
    // zurücksetzen: B wieder für den Pinsel, G bleibt beim Pinsel? Nein – Standard heißt B.
    const back = resetCommand(r.overrides, 'tool.brush');
    expect(buildKeymap(back)['tool.brush']).toEqual(['b']);
  });

  it('zurücksetzen nimmt die Standardtaste einem anderen Befehl wieder weg', () => {
    const r = assignKey({}, 'dice', 'b'); // Pinsel verliert B
    expect(buildKeymap(r.overrides)['tool.brush']).toEqual([]);
    const back = resetCommand(r.overrides, 'tool.brush');
    const map = buildKeymap(back);
    expect(map['tool.brush']).toEqual(['b']);
    expect(map.dice).toEqual([]);
  });

  it('reservierte Tasten und ungültige Daten', () => {
    expect(isAssignable('Escape')).toBe(false);
    expect(isAssignable('ArrowUp')).toBe(false);
    expect(isAssignable(' ')).toBe(false);
    expect(isAssignable('F2')).toBe(true);
    const clean = sanitizeOverrides({
      'tool.brush': ['K', 'Escape', 42],
      gibtsnicht: ['x'],
      grid: 'g',
      dice: ['k'], // doppelt → Pinsel (früher gelistet) behält K
    });
    expect(clean).toEqual({ 'tool.brush': ['k'], dice: [] });
    expect(sanitizeOverrides('kaputt')).toEqual({});
  });

  it('Anzeige', () => {
    const t = (k: string) => ({ 'key.pageDown': 'Bild↓' })[k] ?? k;
    expect(keyLabel('b', t as never)).toBe('B');
    expect(keyLabel('pagedown', t as never)).toBe('Bild↓');
    expect(keyLabel('f2', t as never)).toBe('F2');
  });
});
