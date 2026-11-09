import { describe, expect, it } from 'vitest';
import {
  createLocalStorageLibrary,
  dataUrlToBytes,
  listHomebrew,
  listPcs,
  normalizeCreature,
  normalizePc,
  savePc,
} from './library';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

describe('Bibliothek', () => {
  it('normalisiert Spielercharaktere (Grenzen, Standardwerte, Bild nur als gültige Data-URL)', () => {
    const pc = normalizePc('p1', '  Mira  ', {
      level: 99,
      ac: 'hoch',
      hpMax: 24.4,
      size: 'riesig',
      image: 'javascript:alert(1)',
    });
    expect(pc).toEqual({
      id: 'p1',
      name: 'Mira',
      className: '',
      level: 30,
      size: 'medium',
      ac: 10,
      hpMax: 24,
      initiativeBonus: 0,
      passivePerception: 10,
      speed: 30,
      darkvision: 0,
    });
    expect(normalizePc('p', 'X', { image: 'data:image/png;base64,iVBORw0KGgo=' }).image).toBe(
      'data:image/png;base64,iVBORw0KGgo=',
    );
  });

  it('normalisiert eigene Kreaturen ins SRD-Format', () => {
    const c = normalizeCreature('hb-1', 'Moorschrat', {
      size: 'large',
      cr: 2,
      abilities: [16, 12, 40],
      speed: { walk: 20, swim: 30, fly: -5 },
      senses: { darkvision: 60 },
      actions: [{ name: 'Klaue', desc: 'Hieb' }, { desc: 'ohne Namen' }, 'kaputt'],
    });
    expect(c).toMatchObject({
      homebrew: true,
      size: 'large',
      cr: 2,
      abilities: [16, 12, 30, 10, 10, 10],
      speed: { walk: 20, swim: 30 },
      senses: { passive: 10, darkvision: 60 },
      actions: [{ name: 'Klaue', desc: 'Hieb' }],
      reach: 5,
    });
    expect(c.speed).not.toHaveProperty('fly');
  });

  it('localStorage-Backend: speichern, auflisten, ersetzen, löschen; kaputte Einträge überspringen', async () => {
    const storage = memoryStorage();
    const lib = createLocalStorageLibrary(storage);
    await savePc(normalizePc('b', 'Bruno', { level: 2 }), lib);
    await savePc(normalizePc('a', 'anna', {}), lib);
    await savePc(normalizePc('b', 'Bruno', { level: 3 }), lib);
    await lib.put('pc', 'x', 'Kaputt', '{nicht json');
    const pcs = await listPcs(lib);
    expect(pcs.map((p) => [p.name, p.level])).toEqual([
      ['anna', 1],
      ['Bruno', 3],
    ]);
    expect(await lib.delete('pc', 'a')).toBe(true);
    expect(await lib.delete('pc', 'a')).toBe(false);
    expect(await listHomebrew(lib)).toEqual([]);
    storage.setItem('dndmap.library.v1', 'kein json');
    expect(await listPcs(lib)).toEqual([]);
  });

  it('wandelt Data-URLs in Bytes', () => {
    expect(dataUrlToBytes('data:image/jpeg;base64,AQID')).toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      ext: 'jpg',
    });
    expect(dataUrlToBytes('data:text/html;base64,AQID')).toBeNull();
  });
});
