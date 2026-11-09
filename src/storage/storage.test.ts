import Ajv from 'ajv';
import schema from '../../docs/schema/map.v1.schema.json';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAutosave } from './autosave';
import { ProjectFileError } from './errors';
import { ensureExtension, baseName } from './fileAccess';
import { applyGridChanges, createMap, suggestFileName, type MapDocument } from './mapDocument';
import { migrate } from './migrations';
import { decodeProject, encodeProject } from './projectFile';
import { parseMapDocument } from './validate';

const sample = () =>
  createMap({ name: 'Taverne', cols: 30, rows: 20 }, new Date('2026-11-09T10:00:00.000Z'));

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof ProjectFileError ? e.code : 'other';
  }
  return undefined;
}

describe('Kartendokument', () => {
  it('erstellt Karten mit Standardwerten und Grenzen', () => {
    const doc = createMap({ name: '  ', cols: 5, rows: 999, feetPerCell: 0 });
    expect(doc.name).toBe('Neue Karte');
    expect(doc.grid).toMatchObject({ cols: 10, rows: 200, feetPerCell: 1, visible: true });
    expect(doc.version).toBe(1);
  });

  it('wendet Rasteränderungen begrenzt an', () => {
    const g = applyGridChanges(sample().grid, { cols: 500, opacity: 3, color: 'rot' });
    expect(g.cols).toBe(200);
    expect(g.opacity).toBe(1);
    expect(g.color).toBe('#000000');
  });

  it('schlägt sichere Dateinamen vor', () => {
    expect(suggestFileName('Höhle: Ebene 1/2?')).toBe('Höhle Ebene 12.dndmap');
    expect(suggestFileName('***')).toBe('Karte.dndmap');
    expect(ensureExtension('C:\\a\\b')).toBe('C:\\a\\b.dndmap');
    expect(ensureExtension('x.DNDMAP')).toBe('x.DNDMAP');
    expect(baseName('C:\\Karten\\verlies.dndmap')).toBe('verlies.dndmap');
  });
});

describe('Projektdatei (.dndmap)', () => {
  it('Speichern → Laden ergibt ein identisches Dokument (Round-Trip)', () => {
    const doc = sample();
    const assets = new Map([['bild.png', new Uint8Array([1, 2, 3])]]);
    const loaded = decodeProject(encodeProject(doc, assets));
    expect(loaded.doc).toEqual(doc);
    expect([...loaded.assets.keys()]).toEqual(['bild.png']);
    expect(loaded.assets.get('bild.png')).toEqual(new Uint8Array([1, 2, 3]));
    expect(loaded.recovery).toBeNull();
  });

  it('enthält Wiederherstellungsinfos nur in Autosaves', () => {
    const rec = { savedAt: '2026-11-09T10:01:00.000Z', filePath: 'C:\\k.dndmap' };
    expect(decodeProject(encodeProject(sample(), new Map(), rec)).recovery).toEqual(rec);
  });

  it('meldet kaputte Dateien verständlich', () => {
    expect(errorCode(() => decodeProject(new Uint8Array([1, 2, 3])))).toBe('notZip');
    expect(errorCode(() => decodeProject(zipSync({ 'x.txt': strToU8('a') })))).toBe(
      'missingMapJson',
    );
    expect(errorCode(() => decodeProject(zipSync({ 'map.json': strToU8('{kaputt') })))).toBe(
      'invalidJson',
    );
  });

  it('verwirft unbekannte Felder', () => {
    const raw = { ...sample(), extra: 1 } as unknown;
    expect(parseMapDocument(raw)).not.toHaveProperty('extra');
  });
});

describe('Validierung', () => {
  // Absichtlich untypisiert, um beliebig kaputte Dokumente zu erzeugen.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Loose = Record<string, any>;
  const mutate = (fn: (d: Loose) => void) => {
    const d = structuredClone(sample()) as unknown as Loose;
    fn(d);
    return d;
  };

  it('erkennt falsches Format und neuere Versionen', () => {
    expect(errorCode(() => parseMapDocument(mutate((d) => (d.format = 'x'))))).toBe('wrongFormat');
    expect(errorCode(() => parseMapDocument(mutate((d) => (d.version = 99))))).toBe('newerVersion');
    expect(errorCode(() => parseMapDocument(mutate((d) => (d.version = '1'))))).toBe(
      'invalidContent',
    );
    expect(errorCode(() => parseMapDocument([]))).toBe('invalidContent');
  });

  it('listet alle Feldfehler auf', () => {
    try {
      parseMapDocument(
        mutate((d) => {
          d.grid.cols = 9;
          d.grid.opacity = -1;
          d.background.color = 'blau';
          delete d.name;
        }),
      );
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ProjectFileError);
      expect((e as ProjectFileError).details).toEqual([
        'name: Text erwartet',
        'grid.cols: außerhalb 10–200',
        'grid.opacity: außerhalb 0–1',
        'background.color: ungültiges Format',
      ]);
    }
  });

  it('JSON-Schema und Validator stimmen überein', () => {
    const validate = new Ajv({ allErrors: true }).compile(schema);
    const cases: unknown[] = [
      sample(),
      mutate((d) => (d.grid.cols = 201)),
      mutate((d) => (d.grid.feetPerCell = 2.5)),
      mutate((d) => (d.grid.color = '#12345')),
      mutate((d) => (d.name = '')),
      mutate((d) => (d.createdAt = 'gestern')),
      mutate((d) => delete d.background),
      mutate((d) => (d.grid.visible = 'ja')),
    ];
    for (const c of cases) {
      let ours = true;
      try {
        parseMapDocument(c);
      } catch {
        ours = false;
      }
      expect(validate(c), JSON.stringify(c)).toBe(ours);
    }
  });
});

describe('Migrationen', () => {
  it('wendet Migrationen schrittweise an', () => {
    const registry = {
      1: (d: Record<string, unknown>) => ({ ...d, version: 2, a: true }),
      2: (d: Record<string, unknown>) => ({ ...d, version: 3, b: true }),
    };
    expect(migrate({ version: 1 }, registry, 3)).toEqual({ version: 3, a: true, b: true });
    expect(migrate({ version: 3 }, registry, 3)).toEqual({ version: 3 });
  });

  it('fehlende oder fehlerhafte Migration bricht ab', () => {
    expect(errorCode(() => migrate({ version: 1 }, {}, 2))).toBe('missingMigration');
    expect(errorCode(() => migrate({ version: 1 }, { 1: (d) => d }, 2))).toBe('missingMigration');
  });
});

describe('Autosave', () => {
  afterEach(() => vi.useRealTimers());

  it('sichert nur bei Änderungen und neuer Revision', async () => {
    vi.useFakeTimers();
    const writes: Uint8Array[] = [];
    let snap: { doc: MapDocument; filePath: string | null; dirty: boolean; revision: number } = {
      doc: sample(),
      filePath: null,
      dirty: false,
      revision: 1,
    };
    const handle = startAutosave({
      intervalMs: 60_000,
      getSnapshot: () => snap,
      write: async (b) => void writes.push(b),
      now: () => new Date('2026-11-09T12:00:00.000Z'),
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(writes).toHaveLength(0); // nicht geändert
    snap = { ...snap, dirty: true, revision: 2, filePath: 'D:\\k.dndmap' };
    await vi.advanceTimersByTimeAsync(60_000);
    expect(writes).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(writes).toHaveLength(1); // gleiche Revision
    snap = { ...snap, revision: 3 };
    expect(await handle.flush()).toBe(true);
    handle.stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(writes).toHaveLength(2);
    const restored = decodeProject(writes[1]!);
    expect(restored.doc).toEqual(snap.doc);
    expect(restored.recovery).toEqual({
      savedAt: '2026-11-09T12:00:00.000Z',
      filePath: 'D:\\k.dndmap',
    });
  });

  it('meldet Schreibfehler, ohne abzubrechen', async () => {
    const onError = vi.fn();
    const handle = startAutosave({
      intervalMs: 1000,
      getSnapshot: () => ({ doc: sample(), filePath: null, dirty: true, revision: 1 }),
      write: () => Promise.reject(new Error('voll')),
      onError,
    });
    expect(await handle.flush()).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
    handle.stop();
  });
});
