import { beforeEach, describe, expect, it } from 'vitest';
import { overlayVisuals, PING_MS, useOverlayStore } from './overlayStore';

describe('Temporäres Overlay', () => {
  beforeEach(() => useOverlayStore.getState().reset());

  it('Pfeil und Kreis: Endpunkt folgt, zu kleine Zeichnungen fallen weg', () => {
    const o = () => useOverlayStore.getState();
    o().begin({ x: 1, y: 1 });
    o().extend({ x: 4, y: 1 });
    o().extend({ x: 4, y: 3 });
    expect(o().draft?.points).toEqual([
      { x: 1, y: 1 },
      { x: 4, y: 3 },
    ]);
    o().commit();
    expect(o().drawings).toHaveLength(1);
    o().setShape('circle');
    o().begin({ x: 2, y: 2 });
    o().extend({ x: 2.1, y: 2 });
    o().commit();
    expect(o().drawings).toHaveLength(1); // zu klein
  });

  it('Freihand sammelt Punkte mit Mindestabstand', () => {
    const o = () => useOverlayStore.getState();
    o().setShape('free');
    o().begin({ x: 0, y: 0 });
    o().extend({ x: 0.05, y: 0 }); // zu nah
    o().extend({ x: 0.5, y: 0 });
    o().extend({ x: 1, y: 0.5 });
    expect(o().draft?.points).toHaveLength(3);
    // Entwurf wird mit angezeigt
    expect(overlayVisuals(o()).items).toHaveLength(1);
    o().commit();
    o().clear();
    expect(o().drawings).toEqual([]);
  });

  it('Pings laufen nach PING_MS ab', () => {
    const o = () => useOverlayStore.getState();
    o().ping({ x: 3, y: 3 }, 1000);
    o().ping({ x: 5, y: 5 }, 2000);
    expect(overlayVisuals(o(), 2500).pings.map((p) => p.age)).toEqual([1500, 500]);
    expect(overlayVisuals(o(), 1000 + PING_MS + 1).pings).toHaveLength(1);
    o().prunePings(2000 + PING_MS);
    expect(o().pings).toEqual([]);
  });
});
