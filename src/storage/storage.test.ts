import Ajv from 'ajv';
import schema from '../../docs/schema/map.v4.schema.json';
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

/** Karte mit allen Inhaltsarten (Boden, Objekte, Gelände, Notizen, eigene Elemente). */
const richSample = (): MapDocument => {
  const d = sample();
  const floor = d.floor.slice();
  floor[0] = 'floor.grass';
  floor[31] = 'floor.stone';
  return {
    ...d,
    layers: d.layers.map((l) => (l.id === 'gm' ? { ...l, visible: false, locked: true } : l)),
    floor,
    objects: [
      {
        id: 'o1',
        element: 'wall.stone',
        layer: 'walls',
        x: 1,
        y: 1,
        w: 1,
        h: 1,
        rotation: 0,
        flipX: false,
        flipY: false,
      },
      {
        id: 'o2',
        element: 'furniture.table_long',
        layer: 'walls',
        x: 4.5,
        y: 2,
        w: 2,
        h: 1,
        rotation: 90,
        flipX: true,
        flipY: false,
      },
      {
        id: 'o3',
        element: 'custom.0123abcd',
        layer: 'decor',
        x: 7,
        y: 7,
        w: 1,
        h: 1,
        rotation: 0,
        flipX: false,
        flipY: true,
      },
    ],
    terrain: { '3,4': { difficult: true, cover: 'half', elevation: -10, damage: 'fire' } },
    notes: [{ id: 'n1', x: 2, y: 2, text: 'Geheimgang hinter dem Regal' }],
    customElements: [
      {
        id: 'custom.0123abcd',
        name: 'Brunnen',
        category: 'furniture',
        layer: 'decor',
        w: 1,
        h: 1,
        asset: 'custom/0123abcd.png',
      },
    ],
    background: {
      color: d.background.color,
      image: {
        asset: 'background/karte.jpg',
        width: 2000,
        height: 1400,
        rotation: 90,
        cellPx: 70,
        originX: 12.5,
        originY: 3,
        crop: { x: 0, y: 0, w: 1400, h: 2000 },
        brightness: 1.2,
        contrast: -0.1,
      },
    },
    walls: [
      { id: 'w1', x1: 1, y1: 1, x2: 5, y2: 1, kind: 'wall' },
      { id: 'w2', x1: 5, y1: 1, x2: 5, y2: 2, kind: 'door', state: 'locked' },
      { id: 'w3', x1: 5, y1: 2, x2: 5.5, y2: 3.25, kind: 'window' },
    ],
    tokens: [
      {
        id: 't1',
        name: 'Goblin 1',
        kind: 'creature',
        source: 'goblin',
        size: 'small',
        x: 3,
        y: 4,
        team: 'enemy',
        color: '#c0392b',
        hp: { current: 4, max: 7, temp: 2 },
        ac: 15,
        speed: 30,
        reach: 5,
        initiativeBonus: 2,
        passivePerception: 9,
        darkvision: 60,
        conditions: ['prone', 'frightened'],
        markers: [{ label: 'Hexenfluch', color: '#8e44ad' }],
        deathSaves: { success: 0, failure: 0 },
        hidden: true,
        facing: 90,
        movementUsed: 15,
        actionsUsed: { action: true, bonus: false, reaction: true },
        groupId: 'g1',
      },
      {
        id: 't2',
        name: 'Mira',
        kind: 'pc',
        size: 'medium',
        x: 10,
        y: 10,
        team: 'player',
        color: '#2f7de1',
        image: 'tokens/mira.png',
        hp: { current: 0, max: 24, temp: 0 },
        ac: 16,
        speed: 30,
        reach: 5,
        initiativeBonus: 3,
        passivePerception: 14,
        darkvision: 0,
        conditions: ['unconscious'],
        markers: [],
        deathSaves: { success: 1, failure: 2 },
        hidden: false,
        facing: 0,
        movementUsed: 0,
        actionsUsed: { action: false, bonus: false, reaction: false },
        pc: { className: 'Schurkin', level: 3 },
      },
    ],
  };
};

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
    expect(doc.version).toBe(4);
    expect(doc.walls).toEqual([]);
    expect(doc.tokens).toEqual([]);
    expect(doc.background.image).toBeUndefined();
    expect(doc.floor).toHaveLength(10 * 200);
    expect(doc.layers.map((l) => l.id)).toEqual(['floor', 'walls', 'decor', 'tokens', 'gm']);
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

  it('Round-Trip mit allen Inhaltsarten ist identisch', () => {
    const doc = richSample();
    const assets = new Map([['custom/0123abcd.png', new Uint8Array([137, 80, 78, 71])]]);
    const loaded = decodeProject(encodeProject(doc, assets));
    expect(loaded.doc).toEqual(doc);
    expect(loaded.assets.get('custom/0123abcd.png')).toEqual(new Uint8Array([137, 80, 78, 71]));
  });

  it('Version-3-Dateien werden auf Version 4 migriert (Token-Ebene vor GM)', () => {
    const rich = richSample();
    const { tokens: _tokens, ...v3 } = {
      ...rich,
      version: 3,
      layers: rich.layers.filter((l) => l.id !== 'tokens'),
    };
    const doc = decodeProject(zipSync({ 'map.json': strToU8(JSON.stringify(v3)) })).doc;
    expect(doc.version).toBe(4);
    expect(doc.tokens).toEqual([]);
    expect(doc.layers.map((l) => l.id)).toEqual(['floor', 'walls', 'decor', 'tokens', 'gm']);
    expect(doc.layers.find((l) => l.id === 'gm')).toMatchObject({ visible: false, locked: true });
  });

  it('Version-2-Dateien werden auf Version 4 migriert', () => {
    const rich = richSample();
    const {
      walls: _walls,
      tokens: _tokens,
      ...v2
    } = {
      ...rich,
      version: 2,
      layers: rich.layers.filter((l) => l.id !== 'tokens'),
      background: { color: '#ffffff' },
    };
    const doc = decodeProject(zipSync({ 'map.json': strToU8(JSON.stringify(v2)) })).doc;
    expect(doc).toMatchObject({
      version: 4,
      walls: [],
      tokens: [],
      background: { color: '#ffffff' },
    });
    expect(doc.objects).toHaveLength(3);
  });

  it('Version-1-Dateien werden schrittweise auf Version 4 migriert', () => {
    const v1 = {
      format: 'dndmap',
      version: 1,
      id: 'alt',
      name: 'Alte Karte',
      createdAt: '2026-11-09T10:00:00.000Z',
      modifiedAt: '2026-11-09T10:00:00.000Z',
      grid: { cols: 12, rows: 10, feetPerCell: 5, visible: true, color: '#000000', opacity: 0.35 },
      background: { color: '#d9cfb8' },
    };
    const doc = decodeProject(zipSync({ 'map.json': strToU8(JSON.stringify(v1)) })).doc;
    expect(doc).toMatchObject({
      version: 4,
      name: 'Alte Karte',
      objects: [],
      notes: [],
      terrain: {},
      walls: [],
    });
    expect(doc.floor).toHaveLength(120);
    expect(doc.layers).toHaveLength(5);
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
    const d = structuredClone(richSample()) as unknown as Loose;
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
      richSample(),
      mutate((d) => (d.objects[0].rotation = 45)),
      mutate((d) => (d.objects[1].layer = 'floor')),
      mutate((d) => (d.objects[0].w = 0)),
      mutate((d) => delete d.objects[2].flipY),
      mutate((d) => (d.terrain['3,4'].cover = 'viel')),
      mutate((d) => (d.terrain['3,4'].fliegen = true)),
      mutate((d) => (d.terrain['3,4'].damage = 'holy')),
      mutate((d) => (d.terrain['a,b'] = {})),
      mutate((d) => (d.layers[0].id = 'tokens')),
      mutate((d) => d.layers.pop()),
      mutate((d) => (d.notes[0].x = 1.5)),
      mutate((d) => (d.notes[0].text = 'x'.repeat(2001))),
      mutate((d) => (d.customElements[0].category = 'zauber')),
      mutate((d) => (d.customElements[0].asset = '../../etc/passwd')),
      mutate((d) => (d.customElements[0].id = 'kein-prefix')),
      mutate((d) => (d.floor[5] = 42)),
      mutate((d) => (d.background.image.cellPx = 1)),
      mutate((d) => (d.background.image.rotation = 45)),
      mutate((d) => (d.background.image.asset = 'custom/x.png')),
      mutate((d) => (d.background.image.brightness = 5)),
      mutate((d) => delete d.background.image.crop),
      mutate((d) => delete d.background.image),
      mutate((d) => (d.walls[0].kind = 'zaun')),
      mutate((d) => (d.walls[0].state = 'open')),
      mutate((d) => (d.walls[1].state = 'ajar')),
      mutate((d) => (d.walls[2].x2 = -1)),
      mutate((d) => delete d.walls),
      mutate((d) => delete d.tokens),
      mutate((d) => (d.tokens[0].size = 'riesig')),
      mutate((d) => (d.tokens[0].team = 'boss')),
      mutate((d) => (d.tokens[0].hp.max = 7.5)),
      mutate((d) => (d.tokens[0].conditions = ['vergiftet'])),
      mutate((d) => (d.tokens[0].deathSaves.failure = 4)),
      mutate((d) => (d.tokens[0].markers[0].color = 'lila')),
      mutate((d) => (d.tokens[0].facing = 360)),
      mutate((d) => delete d.tokens[0].actionsUsed),
      mutate((d) => (d.tokens[1].image = '../geheim.png')),
      mutate((d) => (d.tokens[1].pc.level = 0)),
      mutate((d) => (d.tokens[1].kind = 'npc')),
      mutate((d) => (d.tokens[0].x = -1)),
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
