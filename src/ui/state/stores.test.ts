import { beforeEach, describe, expect, it } from 'vitest';
import { referencedAssets, useMapStore } from './mapStore';
import { rulerPath, useViewStore } from './viewStore';

describe('mapStore', () => {
  beforeEach(() => useMapStore.getState().closeMap());

  it('neue Karte ist ungespeichert', () => {
    useMapStore.getState().newMap({ name: 'Wald', cols: 20, rows: 15 });
    const s = useMapStore.getState();
    expect(s.doc?.name).toBe('Wald');
    expect(s.dirty).toBe(true);
    expect(s.filePath).toBeNull();
  });

  it('Änderungen erhöhen die Revision nur bei echtem Unterschied', () => {
    const { newMap, markSaved, updateGrid } = useMapStore.getState();
    newMap({ name: 'Wald', cols: 20, rows: 15 });
    markSaved({ path: 'C:\\w.dndmap', name: 'w.dndmap' });
    const rev = useMapStore.getState().revision;
    updateGrid({ cols: 20 });
    expect(useMapStore.getState()).toMatchObject({ revision: rev, dirty: false });
    // Größe und Darstellung sind zwei getrennte Undo-Schritte.
    updateGrid({ cols: 25, visible: false });
    expect(useMapStore.getState()).toMatchObject({ revision: rev + 2, dirty: true });
    expect(useMapStore.getState().doc?.grid).toMatchObject({ cols: 25, visible: false });
    expect(useMapStore.getState().history.undo.map((e) => e.label)).toEqual([
      'action.resize',
      'action.grid',
    ]);
  });

  it('Undo/Redo stellen den Zustand wieder her; Striche sind ein Schritt', () => {
    const s = useMapStore.getState();
    s.newMap({ name: 'Wald', cols: 20, rows: 15 });
    const before = useMapStore.getState().doc;
    s.rename('Höhle');
    expect(useMapStore.getState().undo()).toBe('action.rename');
    expect(useMapStore.getState().doc?.name).toBe(before?.name);
    expect(useMapStore.getState().redo()).toBe('action.rename');
    expect(useMapStore.getState().doc?.name).toBe('Höhle');

    s.beginStroke('action.paint');
    const patch = (i: number) => ({
      ok: true as const,
      patch: { floor: [[i, '', 'floor.grass'] as [number, string, string]] },
    });
    s.strokeApply(patch(0));
    s.strokeApply(patch(1));
    s.endStroke();
    expect(useMapStore.getState().doc?.floor.slice(0, 2)).toEqual(['floor.grass', 'floor.grass']);
    expect(useMapStore.getState().history.undo.at(-1)?.label).toBe('action.paint');
    useMapStore.getState().undo();
    expect(useMapStore.getState().doc?.floor.slice(0, 2)).toEqual(['', '']);
  });

  it('nur referenzierte Assets werden gespeichert', () => {
    const s = useMapStore.getState();
    s.newMap({ name: 'A', cols: 10, rows: 10 });
    s.addAsset('custom/a.png', new Uint8Array([1]));
    s.addAsset('custom/b.png', new Uint8Array([2]));
    const doc = {
      ...useMapStore.getState().doc!,
      customElements: [
        {
          id: 'custom.aaaaaaaa',
          name: 'A',
          category: 'custom',
          layer: 'decor' as const,
          w: 1,
          h: 1,
          asset: 'custom/a.png',
        },
      ],
    };
    expect([...referencedAssets(doc, useMapStore.getState().assets).keys()]).toEqual([
      'custom/a.png',
    ]);
  });

  it('Name und Hintergrund werden geprüft', () => {
    const { newMap, rename, setBackgroundColor } = useMapStore.getState();
    newMap({ name: 'Wald', cols: 20, rows: 15 });
    rename('   ');
    expect(useMapStore.getState().doc?.name).toBe('Wald');
    setBackgroundColor('grün');
    setBackgroundColor('#AABBCC');
    expect(useMapStore.getState().doc?.background.color).toBe('#aabbcc');
  });
});

describe('Lineal', () => {
  beforeEach(() => useViewStore.getState().reset());
  const c = (x: number, y: number) => ({ x, y });

  it('Messung mit Wegpunkten', () => {
    const v = useViewStore.getState();
    v.rulerBegin(c(0, 0));
    v.rulerMove(c(2, 0));
    v.rulerAddWaypoint();
    v.rulerAddWaypoint(); // doppelter Wegpunkt wird ignoriert
    v.rulerMove(c(2, 3));
    expect(rulerPath(useViewStore.getState().ruler)).toEqual([c(0, 0), c(2, 0), c(2, 3)]);
    v.rulerEnd();
    const r = useViewStore.getState().ruler;
    expect(r).toEqual({ points: [c(0, 0), c(2, 0), c(2, 3)], preview: null, active: false });
    v.rulerMove(c(9, 9)); // nach Ende keine Änderung
    expect(useViewStore.getState().ruler).toBe(r);
    v.rulerClear();
    expect(useViewStore.getState().ruler.points).toEqual([]);
  });

  it('Kamera bleibt bei Pan/Zoom im Rahmen', () => {
    const v = useViewStore.getState();
    v.setViewport({ width: 800, height: 600 });
    const world = { width: 640, height: 640 };
    v.fit(world);
    v.panBy(100_000, 0, world);
    expect(useViewStore.getState().camera.x).toBeLessThanOrEqual(800 - 64);
    v.zoomAt({ x: 400, y: 300 }, 2, world);
    expect(useViewStore.getState().camera.zoom).toBeGreaterThan(0.8);
  });
});
