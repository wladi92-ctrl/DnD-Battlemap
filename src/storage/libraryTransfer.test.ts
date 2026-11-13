import { describe, expect, it } from 'vitest';
import {
  createLocalStorageLibrary,
  listHomebrew,
  listHomebrewEffects,
  listPcs,
  listPortraits,
  normalizeCreature,
  normalizeEffect,
  normalizePc,
  saveHomebrew,
  saveHomebrewEffect,
  savePc,
  savePortrait,
} from './library';
import {
  conflictingEntries,
  exportLibrary,
  importEntries,
  LibraryImportError,
  parseLibraryImport,
} from './libraryTransfer';

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

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));

async function filledLibrary() {
  const lib = createLocalStorageLibrary(memoryStorage());
  await savePc(normalizePc('pc1', 'Mira', { className: 'Waldläuferin', level: 5, ac: 15 }), lib);
  await saveHomebrew(
    normalizeCreature('custom:moor', 'Moorschrat', { type: 'fey', cr: 2, hp: 30, image: PNG }),
    lib,
  );
  await saveHomebrewEffect(
    normalizeEffect('custom:nebel', 'Säurenebel', {
      kind: 'spell',
      shape: 'sphere',
      size: 15,
      damage: { type: 'acid', dice: '3d6' },
      save: { ability: 'dex', success: 'half' },
      rounds: 10,
    }),
    lib,
  );
  await savePortrait({ id: 'goblin', name: 'Goblin', image: PNG }, lib);
  return lib;
}

describe('Bibliothek teilen (JSON)', () => {
  it('Export → Import in eine leere Bibliothek ergibt dieselben Einträge', async () => {
    const src = await filledLibrary();
    const { text, count } = await exportLibrary(
      ['pc', 'creature', 'effect', 'portrait'],
      src,
      new Date('2026-11-13T10:00:00Z'),
    );
    expect(count).toBe(4);
    expect(JSON.parse(text)).toMatchObject({
      format: 'dndbattlemap-library',
      version: 1,
      exportedAt: '2026-11-13T10:00:00.000Z',
    });

    const dst = createLocalStorageLibrary(memoryStorage());
    const parsed = parseLibraryImport(new TextEncoder().encode(text));
    expect(parsed.skipped).toBe(0);
    expect(await conflictingEntries(parsed.entries, dst)).toEqual([]);
    expect(await importEntries(parsed.entries, dst)).toBe(4);

    expect(await listPcs(dst)).toEqual(await listPcs(src));
    expect(await listHomebrew(dst)).toEqual(await listHomebrew(src));
    expect(await listHomebrewEffects(dst)).toEqual(await listHomebrewEffects(src));
    expect(await listPortraits(dst)).toEqual(await listPortraits(src));
    // Erneuter Import: alle vier wären Überschreibungen
    expect(await conflictingEntries(parsed.entries, dst)).toHaveLength(4);
  });

  it('nur ausgewählte Arten exportieren', async () => {
    const { count, text } = await exportLibrary(['pc'], await filledLibrary());
    expect(count).toBe(1);
    expect(JSON.parse(text).entries[0]).toMatchObject({ kind: 'pc', id: 'pc1', name: 'Mira' });
  });

  it('ungültige Einträge werden übersprungen, Werte normalisiert', async () => {
    const parsed = parseLibraryImport(
      enc({
        format: 'dndbattlemap-library',
        version: 1,
        entries: [
          { kind: 'pc', id: 'p', name: 'Anton', data: { level: 99, ac: -5 } },
          { kind: 'zauber', id: 'x', name: 'X', data: {} },
          { kind: 'pc', id: 'bad id!', name: 'Y', data: {} },
          { kind: 'pc', id: 'q', name: '   ', data: {} },
          { kind: 'portrait', id: 'wolf', name: 'Wolf', data: { image: 'http://evil/x.png' } },
          null,
        ],
      }),
    );
    expect(parsed.entries.map((e) => e.id)).toEqual(['p']);
    expect(parsed.skipped).toBe(5);
    const lib = createLocalStorageLibrary(memoryStorage());
    await importEntries(parsed.entries, lib);
    expect((await listPcs(lib))[0]).toMatchObject({ name: 'Anton', level: 30, ac: 0 });
  });

  it('falsches Format, neuere Version, kein JSON', () => {
    const code = (bytes: Uint8Array) => {
      try {
        parseLibraryImport(bytes);
        return 'ok';
      } catch (e) {
        return e instanceof LibraryImportError ? e.code : 'other';
      }
    };
    expect(code(new TextEncoder().encode('{kaputt'))).toBe('notJson');
    expect(code(enc({ format: 'dndmap', entries: [] }))).toBe('wrongFormat');
    expect(code(enc({ format: 'dndbattlemap-library', version: 2, entries: [] }))).toBe(
      'newerVersion',
    );
  });
});
