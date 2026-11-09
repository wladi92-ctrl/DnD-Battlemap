import { describe, expect, it } from 'vitest';
import { createMap, type BackgroundImage, type MapDocument } from '../storage/mapDocument';
import { buildTemplate, placeStamp } from './generators';
import { resizeGrid, setLayerState, type OpResult } from './ops';
import { applyPatch, invertPatch } from './patch';
import {
  addWalls,
  deleteItems,
  moveItems,
  setBackgroundImage,
  updateBackgroundImage,
  updateWalls,
  wallsInRect,
  wallsNear,
} from './wallOps';

const map = () => createMap({ name: 'W', cols: 20, rows: 15 });
const apply = (doc: MapDocument, r: OpResult) => {
  if (!r.ok) throw new Error(r.reason);
  return applyPatch(doc, r.patch);
};
const seg = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  kind: 'wall' | 'door' | 'window' | 'secret' = 'wall',
) => ({
  x1,
  y1,
  x2,
  y2,
  kind,
});

const image: BackgroundImage = {
  asset: 'background/a.png',
  width: 1400,
  height: 1000,
  rotation: 0,
  cellPx: 50,
  originX: 20,
  originY: 0,
  crop: { x: 0, y: 0, w: 1400, h: 1000 },
  brightness: 1,
  contrast: 0,
};

describe('Kantenwände', () => {
  it('fügt hinzu, begrenzt auf die Karte, ignoriert Länge 0 und Duplikate', () => {
    let d = apply(map(), addWalls(map(), [seg(1, 1, 4, 1), seg(4, 1, 4, 99), seg(2, 2, 2, 2)]));
    expect(d.walls.map((w) => [w.x1, w.y1, w.x2, w.y2])).toEqual([
      [1, 1, 4, 1],
      [4, 1, 4, 15],
    ]);
    expect(addWalls(d, [seg(4, 1, 1, 1)])).toEqual({ ok: false, reason: 'nothing' });
    d = apply(d, addWalls(d, [seg(0, 0, 0, 3, 'door')]));
    expect(d.walls[2]).toMatchObject({ kind: 'door', state: 'closed' });
  });

  it('Treffertest, Rahmen, Art/Zustand ändern', () => {
    const d = apply(map(), addWalls(map(), [seg(1, 1, 5, 1), seg(5, 1, 5, 4, 'door')]));
    expect(wallsNear(d, { x: 3, y: 1.1 }, 0.2).map((w) => w.x2)).toEqual([5]);
    expect(wallsNear(d, { x: 3, y: 2 }, 0.2)).toEqual([]);
    expect(wallsInRect(d, { x: 0, y: 0, w: 6, h: 2 })).toHaveLength(1);
    const door = d.walls[1]!;
    const d2 = apply(d, updateWalls(d, new Set([door.id]), { state: 'open' }));
    expect(d2.walls[1]!.state).toBe('open');
    const d3 = apply(d2, updateWalls(d2, new Set([door.id]), { kind: 'window' }));
    expect(d3.walls[1]).not.toHaveProperty('state');
  });

  it('gemeinsames Verschieben und Löschen von Objekten und Wänden; gesperrte Ebene', () => {
    let d = apply(map(), addWalls(map(), [seg(1, 1, 3, 1)]));
    const ids = new Set(d.walls.map((w) => w.id));
    d = apply(d, moveItems(d, ids, 2, 100));
    expect(d.walls[0]).toMatchObject({ x1: 3, y1: 15, x2: 5, y2: 15 });
    const locked = apply(d, setLayerState(d, 'walls', { locked: true }));
    expect(deleteItems(locked, ids)).toEqual({ ok: false, reason: 'locked' });
    d = apply(d, deleteItems(d, ids));
    expect(d.walls).toEqual([]);
  });

  it('Größe ändern und Vorlage mit "ersetzen" entfernen Wände', () => {
    let d = apply(map(), addWalls(map(), [seg(1, 1, 3, 1), seg(15, 1, 18, 1)]));
    const small = apply(d, resizeGrid(d, 12, 12));
    expect(small.walls).toHaveLength(1);
    d = apply(d, placeStamp(d, buildTemplate('tavern'), { x: 0, y: 0 }, true));
    expect(d.walls.map((w) => w.x1)).toEqual([15]);
  });
});

describe('Hintergrundbild', () => {
  it('setzen passt das Raster an und ist ein Undo-Schritt', () => {
    const d0 = map();
    const r = setBackgroundImage(d0, image, true);
    const d1 = apply(d0, r);
    expect(d1.background.image).toEqual(image);
    // (1400 − 20) / 50 = 27,6 → 27 Spalten; 1000 / 50 = 20 Zeilen
    expect(d1.grid).toMatchObject({ cols: 27, rows: 20 });
    expect(d1.floor).toHaveLength(27 * 20);
    if (!r.ok) throw new Error();
    expect(applyPatch(d1, invertPatch(r.patch))).toEqual(d0);
  });

  it('ändern und entfernen', () => {
    const d1 = apply(map(), setBackgroundImage(map(), image, false));
    expect(d1.grid.cols).toBe(20);
    const d2 = apply(d1, updateBackgroundImage(d1, { brightness: 1.4 }));
    expect(d2.background.image?.brightness).toBe(1.4);
    const d3 = apply(d2, setBackgroundImage(d2, undefined, false));
    expect(d3.background).toEqual({ color: d2.background.color });
    expect(updateBackgroundImage(d3, { brightness: 2 })).toEqual({ ok: false, reason: 'nothing' });
  });
});
