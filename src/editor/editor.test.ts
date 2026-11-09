import { describe, expect, it } from 'vitest';
import { floodFill, lineCells, rectBetween, rectCells } from '../core/shapes';
import { builtinInfo, getBuiltinElement } from '../data/elements';
import { createMap, type MapDocument, type PlacedObject } from '../storage/mapDocument';
import { computeTerrainGrid, effectiveTerrain, footprintCells, footprintSize } from './footprint';
import { buildTemplate, generateDungeon, placeStamp, TEMPLATE_IDS } from './generators';
import { HISTORY_LIMIT, emptyHistory, popRedo, popUndo, pushHistory } from './history';
import {
  alignObjects,
  deleteObjects,
  eraseCells,
  fillArea,
  flipObjects,
  moveObjects,
  objectsAt,
  paintCells,
  pasteObjects,
  resizeGrid,
  rotateObjects,
  setLayerState,
  upsertNote,
  type OpResult,
  type PaintSource,
} from './ops';
import { applyPatch, invertPatch, mergePatches, type DocPatch } from './patch';

const c = (x: number, y: number) => ({ x, y });
const map = (cols = 10, rows = 10) => createMap({ name: 'T', cols, rows });
const el = (id: string): PaintSource => {
  const def = getBuiltinElement(id);
  if (!def) throw new Error(id);
  return { kind: 'element', element: builtinInfo(def, 'de') };
};
const apply = (doc: MapDocument, r: OpResult): MapDocument => {
  if (!r.ok) throw new Error(`Operation fehlgeschlagen: ${r.reason}`);
  return applyPatch(doc, r.patch);
};
const patchOf = (r: OpResult): DocPatch => {
  if (!r.ok) throw new Error(r.reason);
  return r.patch;
};
const floorAt = (d: MapDocument, x: number, y: number) => d.floor[y * d.grid.cols + x];

describe('Formen', () => {
  it('Linie (Bresenham) inkl. Endpunkte, auch rückwärts', () => {
    expect(lineCells(c(0, 0), c(3, 0))).toEqual([c(0, 0), c(1, 0), c(2, 0), c(3, 0)]);
    expect(lineCells(c(0, 0), c(3, 3))).toHaveLength(4);
    // Rückwärts: gleiche Endpunkte, lückenlos (jeder Schritt höchstens ein Feld)
    const back = lineCells(c(4, 1), c(0, 3));
    expect([back[0], back[back.length - 1]]).toEqual([c(4, 1), c(0, 3)]);
    for (let i = 1; i < back.length; i++) {
      const [p, q] = [back[i - 1]!, back[i]!];
      expect(Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y))).toBe(1);
    }
  });

  it('Rechteck gefüllt und als Umriss', () => {
    const r = rectBetween(c(3, 4), c(1, 1));
    expect(r).toEqual({ x: 1, y: 1, w: 3, h: 4 });
    expect(rectCells(r, true)).toHaveLength(12);
    expect(rectCells(r, false)).toHaveLength(10);
  });

  it('Flutfüllung bleibt im zusammenhängenden Bereich', () => {
    const wall = new Set([2, 12, 22, 32, 42, 52, 62, 72, 82, 92]); // Spalte 2 in 10×10
    const region = floodFill({ cols: 10, rows: 10 }, c(0, 0), (i) => !wall.has(i));
    expect(region).toHaveLength(20);
    expect(floodFill({ cols: 200, rows: 200 }, c(5, 5), () => true)).toHaveLength(40_000);
  });
});

describe('Patches & Verlauf', () => {
  it('apply und invert sind zueinander invers', () => {
    const d0 = map();
    const p = patchOf(paintCells(d0, [c(1, 1), c(2, 1)], el('floor.grass')));
    const d1 = applyPatch(d0, p);
    expect(floorAt(d1, 1, 1)).toBe('floor.grass');
    expect(applyPatch(d1, invertPatch(p))).toEqual(d0);
    expect(applyPatch(d1, p, 'b')).toEqual(d0);
  });

  it('zusammengeführte Pinselstriche: erster Vorher-, letzter Nachher-Wert', () => {
    const d0 = map();
    const p1 = patchOf(paintCells(d0, [c(0, 0)], el('floor.grass')));
    const d1 = applyPatch(d0, p1);
    const p2 = patchOf(paintCells(d1, [c(0, 0), c(1, 0)], el('floor.sand')));
    const merged = mergePatches(p1, p2);
    const d2 = applyPatch(d0, merged);
    expect([floorAt(d2, 0, 0), floorAt(d2, 1, 0)]).toEqual(['floor.sand', 'floor.sand']);
    expect(applyPatch(d2, invertPatch(merged))).toEqual(d0);
  });

  it(`mindestens 200 Undo-Schritte (Limit ${HISTORY_LIMIT})`, () => {
    let doc = map(20, 20);
    let h = emptyHistory;
    const docs = [doc];
    for (let i = 0; i < 250; i++) {
      const p = patchOf(
        paintCells(doc, [c(i % 20, Math.floor(i / 20))], el(i % 2 ? 'floor.grass' : 'floor.sand')),
      );
      doc = applyPatch(doc, p);
      docs.push(doc);
      h = pushHistory(h, { label: 'x', patch: p, time: i * 2000 });
    }
    for (let i = 250; i > 0; i--) {
      const u = popUndo(h);
      expect(u).not.toBeNull();
      doc = applyPatch(doc, u!.patch);
      h = u!.history;
      expect(doc).toEqual(docs[i - 1]);
    }
    expect(popUndo(h)).toBeNull();
    const r = popRedo(h)!;
    expect(applyPatch(doc, r.patch)).toEqual(docs[1]);
  });

  it('gleicher mergeKey innerhalb 1 s wird ein Schritt; neue Aktion leert Redo', () => {
    const p: DocPatch = { whole: { name: { b: 'a', a: 'b' } } };
    const q: DocPatch = { whole: { name: { b: 'b', a: 'c' } } };
    let h = pushHistory(emptyHistory, { label: 'x', patch: p, mergeKey: 'name', time: 0 });
    h = pushHistory(h, { label: 'x', patch: q, mergeKey: 'name', time: 500 });
    expect(h.undo).toHaveLength(1);
    expect(h.undo[0]!.patch.whole?.name).toEqual({ b: 'a', a: 'c' });
    h = pushHistory(h, { label: 'x', patch: q, mergeKey: 'name', time: 5000 });
    expect(h.undo).toHaveLength(2);
    h = popUndo(h)!.history;
    expect(h.redo).toHaveLength(1);
    h = pushHistory(h, { label: 'y', patch: p, time: 6000 });
    expect(h.redo).toHaveLength(0);
  });
});

describe('Malen, Radieren, Füllen', () => {
  it('Wände ersetzen: Tür auf Wandfeld entfernt die Wand', () => {
    let d = apply(map(), paintCells(map(), [c(1, 1), c(2, 1), c(3, 1)], el('wall.stone')));
    expect(d.objects).toHaveLength(3);
    d = apply(d, paintCells(d, [c(2, 1)], el('door.wood_closed')));
    expect(d.objects.map((o) => o.element).sort()).toEqual([
      'door.wood_closed',
      'wall.stone',
      'wall.stone',
    ]);
    // Gleiches Element auf gleichem Feld wird nicht doppelt gesetzt.
    expect(paintCells(d, [c(2, 1)], el('door.wood_closed'))).toEqual({
      ok: false,
      reason: 'nothing',
    });
  });

  it('gesperrte Ebene verhindert Änderungen', () => {
    const d = apply(map(), setLayerState(map(), 'floor', { locked: true }));
    expect(paintCells(d, [c(0, 0)], el('floor.grass'))).toEqual({ ok: false, reason: 'locked' });
    expect(eraseCells(d, [c(0, 0)], 'floor')).toEqual({ ok: false, reason: 'locked' });
  });

  it('Radierer arbeitet je Ebene', () => {
    let d = map();
    d = apply(d, paintCells(d, [c(1, 1)], el('floor.grass')));
    d = apply(d, paintCells(d, [c(1, 1)], el('furniture.barrel')));
    d = apply(d, paintCells(d, [c(1, 1)], { kind: 'terrain', props: { difficult: true } }));
    const e1 = apply(d, eraseCells(d, [c(1, 1)], 'walls'));
    expect([floorAt(e1, 1, 1), e1.objects.length]).toEqual(['floor.grass', 0]);
    const e2 = apply(d, eraseCells(d, [c(1, 1)], 'terrain'));
    expect(e2.terrain).toEqual({});
    expect(eraseCells(d, [c(5, 5)], 'floor')).toEqual({ ok: false, reason: 'nothing' });
  });

  it('Füllen ersetzt nur den zusammenhängenden gleichen Boden', () => {
    let d = map(10, 10);
    d = apply(d, paintCells(d, rectCells({ x: 2, y: 0, w: 1, h: 10 }, true), el('floor.stone')));
    d = apply(d, fillArea(d, c(0, 0), el('floor.grass')));
    expect(d.floor.filter((f) => f === 'floor.grass')).toHaveLength(20);
    expect(fillArea(d, c(0, 0), el('furniture.barrel'))).toEqual({
      ok: false,
      reason: 'fillObjects',
    });
  });

  it('Gelände: Vorgaben der Elemente plus gemaltes Gelände', () => {
    let d = map();
    d = apply(d, paintCells(d, [c(0, 0)], el('floor.water_deep')));
    d = apply(d, paintCells(d, [c(0, 0)], el('wall.stone')));
    d = apply(
      d,
      paintCells(d, [c(0, 0)], { kind: 'terrain', props: { elevation: 10, cover: 'half' } }),
    );
    expect(effectiveTerrain(d, c(0, 0))).toEqual({
      difficult: true,
      blocksMovement: true,
      blocksSight: true,
      elevation: 10,
      cover: 'half',
    });
    const hidden = apply(d, setLayerState(d, 'walls', { visible: false }));
    expect(effectiveTerrain(hidden, c(0, 0)).blocksMovement).toBeUndefined();
  });

  it('Gelände-Gitter für die ganze Karte entspricht der Einzelfeld-Berechnung', () => {
    let d = apply(map(20, 15), placeStamp(map(20, 15), buildTemplate('tavern'), c(1, 1), true));
    d = apply(
      d,
      paintCells(d, [c(18, 13), c(0, 0)], { kind: 'terrain', props: { damage: 'acid' } }),
    );
    const grid = computeTerrainGrid(d);
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 20; x++) {
        const single = effectiveTerrain(d, c(x, y));
        expect(grid.get(y * 20 + x) ?? {}, `${x},${y}`).toEqual(single);
      }
    }
  });
});

describe('Objekte bearbeiten', () => {
  const withTable = () => {
    const d = map();
    return apply(d, paintCells(d, [c(2, 2)], el('furniture.table_long'))); // 2×1
  };

  it('große Objekte belegen mehrere Felder, gedreht vertauscht', () => {
    const o = withTable().objects[0]!;
    expect(footprintCells(o)).toEqual([c(2, 2), c(3, 2)]);
    expect(footprintSize({ ...o, rotation: 90 })).toEqual({ w: 1, h: 2 });
  });

  it('Drehen um die Mitte, Spiegeln, Verschieben mit Rand', () => {
    let d = withTable();
    const ids = new Set([d.objects[0]!.id]);
    d = apply(d, rotateObjects(d, ids, 1, true));
    expect(d.objects[0]).toMatchObject({ rotation: 90, x: 2, y: 1 });
    expect(footprintCells(d.objects[0]!)).toEqual([c(2, 1), c(2, 2)]);
    d = apply(d, flipObjects(d, ids, 'x'));
    expect(d.objects[0]!.flipX).toBe(true);
    d = apply(d, moveObjects(d, ids, 100, -100));
    expect(d.objects[0]).toMatchObject({ x: 9, y: 0 });
  });

  it('Auswahl findet oberstes Objekt; Kopieren/Einfügen; Ausrichten; Löschen', () => {
    let d = withTable();
    d = apply(d, paintCells(d, [c(2, 2)], el('misc.coins')));
    expect(objectsAt(d, 2.5, 2.5).map((o) => o.element)).toEqual([
      'misc.coins',
      'furniture.table_long',
    ]);
    const all = new Set(d.objects.map((o) => o.id));
    const { result, ids } = pasteObjects(d, d.objects, 0, 3);
    d = apply(d, result);
    expect(d.objects).toHaveLength(4);
    expect(ids).toHaveLength(2);
    d = apply(d, moveObjects(d, new Set([ids[0]!]), 4, 0));
    d = apply(d, alignObjects(d, new Set(ids), 'left'));
    expect(d.objects.filter((o) => ids.includes(o.id)).map((o) => o.x)).toEqual([2, 2]);
    d = apply(d, deleteObjects(d, all));
    expect(d.objects.map((o: PlacedObject) => o.id).sort()).toEqual([...ids].sort());
  });

  it('Notizen anlegen, ändern, löschen (leerer Text)', () => {
    let d = apply(map(), upsertNote(map(), { x: 1, y: 1, text: ' Falle! ' }));
    expect(d.notes).toMatchObject([{ x: 1, y: 1, text: 'Falle!' }]);
    d = apply(d, upsertNote(d, { x: 1, y: 1, text: 'Schatz' }));
    expect(d.notes).toHaveLength(1);
    d = apply(d, upsertNote(d, { x: 1, y: 1, text: '' }));
    expect(d.notes).toEqual([]);
  });

  it('Größe ändern schneidet Inhalte ab und ist umkehrbar', () => {
    let d = map(20, 20);
    d = apply(d, paintCells(d, [c(15, 15), c(2, 2)], el('floor.grass')));
    d = apply(d, paintCells(d, [c(15, 15)], el('furniture.barrel')));
    const r = resizeGrid(d, 12, 12);
    const small = apply(d, r);
    expect(small.floor).toHaveLength(144);
    expect(floorAt(small, 2, 2)).toBe('floor.grass');
    expect(small.objects).toEqual([]);
    expect(applyPatch(small, invertPatch(patchOf(r)))).toEqual(d);
  });
});

describe('Vorlagen und Zufallsverliese', () => {
  it.each(TEMPLATE_IDS)('Vorlage "%s" ist gültig und einsetzbar', (id) => {
    const s = buildTemplate(id);
    expect(s.floor).toHaveLength(s.w * s.h);
    for (const o of s.objects) expect(getBuiltinElement(o.element), o.element).toBeDefined();
    const d = map(40, 40);
    const placed = apply(d, placeStamp(d, s, c(2, 2), true));
    expect(placed.objects.length).toBe(s.objects.length);
    expect(placeStamp(d, s, c(39, 39), true)).toEqual({ ok: false, reason: 'outside' });
  });

  it('Zufallsverlies ist deterministisch und vollständig verbunden', () => {
    const a = generateDungeon('Drachenhort', 40, 30);
    const b = generateDungeon('Drachenhort', 40, 30);
    expect(a).toEqual(b);
    expect(generateDungeon('anders', 40, 30)).not.toEqual(a);
    const walkable = (i: number) => a.floor[i] !== '';
    const start = a.floor.findIndex((f) => f !== '');
    const region = floodFill(
      { cols: a.w, rows: a.h },
      c(start % a.w, Math.floor(start / a.w)),
      walkable,
    );
    expect(region.length).toBe(a.floor.filter((f) => f !== '').length);
    expect(a.objects.some((o) => o.element === 'stairs.up')).toBe(true);
    expect(a.objects.some((o) => o.element === 'stairs.down')).toBe(true);
  });

  it('Einsetzen ist mit einem Schritt rückgängig zu machen', () => {
    let d = map(30, 30);
    d = apply(d, paintCells(d, [c(5, 5)], el('furniture.barrel')));
    const r = placeStamp(d, buildTemplate('tavern'), c(0, 0), true);
    const after = apply(d, r);
    expect(after.objects.some((o) => o.element === 'furniture.bar_counter')).toBe(true);
    expect(
      after.objects.some((o) => o.element === 'furniture.barrel' && o.x === 5 && o.y === 5),
    ).toBe(false);
    expect(applyPatch(after, invertPatch(patchOf(r)))).toEqual(d);
  });
});
