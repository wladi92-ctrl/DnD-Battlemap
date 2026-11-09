import { beforeEach, describe, expect, it } from 'vitest';
import { useMapStore } from './mapStore';
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
    updateGrid({ cols: 25, visible: false });
    expect(useMapStore.getState()).toMatchObject({ revision: rev + 1, dirty: true });
    expect(useMapStore.getState().doc?.grid).toMatchObject({ cols: 25, visible: false });
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
