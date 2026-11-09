import { describe, expect, it } from 'vitest';
import { CATEGORY_IDS } from './categories';
import {
  builtinElements,
  builtinInfo,
  elementNames,
  elementSvg,
  resolveElement,
  searchElements,
} from './index';

describe('Elementbibliothek', () => {
  it('enthält mindestens 150 Elemente mit eindeutigen IDs', () => {
    expect(builtinElements.length).toBeGreaterThanOrEqual(150);
    const ids = builtinElements.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('jede Kategorie außer "Eigene" ist belegt', () => {
    for (const cat of CATEGORY_IDS.filter((c) => c !== 'custom')) {
      expect(
        builtinElements.some((e) => e.category === cat),
        cat,
      ).toBe(true);
    }
  });

  it('jedes Element hat Namen auf Deutsch und Englisch – und keine überzähligen Namen', () => {
    const ids = builtinElements.map((e) => e.id).sort();
    expect(Object.keys(elementNames.de).sort()).toEqual(ids);
    expect(Object.keys(elementNames.en).sort()).toEqual(ids);
  });

  it('alle Grafiken sind gültiges SVG mit passender Größe', () => {
    const parser = new DOMParser();
    for (const e of builtinElements) {
      const svg = elementSvg(e.id) ?? '';
      const xml = parser.parseFromString(svg, 'image/svg+xml');
      expect(xml.querySelector('parsererror'), e.id).toBeNull();
      expect(xml.documentElement.getAttribute('viewBox'), e.id).toBe(
        `0 0 ${e.w * 100} ${e.h * 100}`,
      );
      expect(svg, e.id).not.toMatch(/NaN|undefined|https?:\/\/(?!www\.w3\.org)/);
      expect(e.w >= 1 && e.h >= 1 && e.w <= 10 && e.h <= 10, e.id).toBe(true);
    }
  });

  it('Böden liegen auf der Boden-Ebene und sind 1×1', () => {
    for (const e of builtinElements.filter((x) => x.category === 'floors')) {
      expect([e.layer, e.w, e.h], e.id).toEqual(['floor', 1, 1]);
    }
  });

  it('Wände blockieren standardmäßig, offene Türen nicht', () => {
    expect(builtinElements.find((e) => e.id === 'wall.stone')?.props).toEqual({
      blocksMovement: true,
      blocksSight: true,
    });
    expect(builtinElements.find((e) => e.id === 'door.wood_open')?.props ?? {}).toEqual({});
  });

  it('Suche über Name, Tags und Kategorie', () => {
    const items = builtinElements.map((e) => builtinInfo(e, 'de'));
    const cat = (id: string) => ({ doors: 'Türen' })[id] ?? id;
    const tür = searchElements(items, 'tür offen', null, cat).map((e) => e.id);
    expect(tür).toContain('door.wood_open');
    expect(tür).not.toContain('door.wood_closed');
    expect(searchElements(items, 'EICHE', null, cat).map((e) => e.id)).toEqual(['nature.tree_oak']);
    expect(searchElements(items, '', 'traps', cat)).toHaveLength(10);
    expect(searchElements(items, 'türen', null, cat).length).toBeGreaterThan(10);
  });

  it('löst eingebaute und eigene Elemente auf', () => {
    expect(resolveElement('floor.grass', [], 'en')?.name).toBe('Grass');
    const custom = [
      {
        id: 'custom.abc12345',
        name: 'Mein Tisch',
        category: 'furniture',
        layer: 'walls' as const,
        w: 2,
        h: 1,
        asset: 'custom/abc.png',
      },
    ];
    expect(resolveElement('custom.abc12345', custom)).toMatchObject({
      name: 'Mein Tisch',
      custom: true,
      w: 2,
    });
    expect(resolveElement('gibt.es.nicht', custom)).toBeUndefined();
  });
});
