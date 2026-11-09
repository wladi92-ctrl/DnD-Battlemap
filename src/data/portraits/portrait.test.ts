import { describe, expect, it } from 'vitest';
import data from '../srd/creatures.json';
import { GLYPH_IDS } from './glyphs';
import { baseName, glyphFor, portraitSvg, portraitUrl, typeKey } from './portrait';

const creatures = (data as { creatures: { id: string; name: string; type: string }[] }).creatures;

/** Grobe XML-Prüfung: keine doppelten Attribute, ausgeglichene Tags, keine leeren Werte. */
function wellFormed(svg: string): boolean {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  return !doc.querySelector('parsererror') && doc.documentElement.nodeName === 'svg';
}

describe('Kreaturen-Porträts', () => {
  it('jede SRD-Kreatur erhält ein gültiges, eigenes Porträt', () => {
    expect(creatures.length).toBeGreaterThan(300);
    for (const c of creatures) {
      const svg = portraitSvg(c);
      expect(wellFormed(svg), c.name).toBe(true);
      expect(svg).not.toMatch(/NaN|undefined/);
    }
  });

  it('jede Silhouette ist gültiges SVG (auch die, die keine SRD-Kreatur nutzt)', () => {
    for (const g of GLYPH_IDS) {
      const svg = portraitSvg({ name: g, type: 'humanoid' });
      expect(wellFormed(svg), g).toBe(true);
    }
  });

  it('passende Silhouetten nach Name und Typ', () => {
    const pick = (name: string, type?: string) => glyphFor({ name, ...(type ? { type } : {}) });
    expect(pick('Wolf', 'beast')).toBe('canine');
    expect(pick('Giant Spider', 'beast')).toBe('spider');
    expect(pick('Adult Red Dragon', 'dragon')).toBe('dragon');
    expect(pick('Skeleton', 'undead')).toBe('skull');
    expect(pick('Lich', 'undead')).toBe('lich');
    expect(pick('Goblin', 'humanoid')).toBe('goblin');
    expect(pick('Guard', 'humanoid')).toBe('helm');
    expect(pick('Archmage', 'humanoid')).toBe('wizard');
    expect(pick('Fire Giant', 'giant')).toBe('giant');
    expect(pick('Giant Ape', 'beast')).toBe('ape');
    expect(pick('Fire Elemental', 'elemental')).toBe('flame');
    expect(pick('Swarm of Rats', 'swarm of Tiny beasts')).toBe('rodent');
    expect(pick('Unbekanntes Ding', 'aberration')).toBe('eye');
    // Spielercharaktere: Heldenbild, Klassen-/Rollenwörter werden erkannt
    expect(glyphFor({ name: 'Mira', kind: 'pc' })).toBe('helm');
    expect(glyphFor({ name: 'Elaria die Magierin', kind: 'pc' })).toBe('wizard');
  });

  it('Drachen in ihrer Farbe; deterministisch; Typ-Normierung', () => {
    const red = portraitSvg({ name: 'Young Red Dragon', type: 'dragon' });
    const blue = portraitSvg({ name: 'Young Blue Dragon', type: 'dragon' });
    expect(red).toContain('#b3261e');
    expect(blue).toContain('#2a5fb3');
    expect(portraitSvg({ name: 'Wolf', type: 'beast' })).toBe(
      portraitSvg({ name: 'Wolf', type: 'beast' }),
    );
    expect(typeKey('swarm of Tiny beasts')).toBe('swarm');
    expect(typeKey('humanoid (goblinoid)')).toBe('humanoid');
    expect(baseName('Goblin 12')).toBe('Goblin');
    expect(baseName('42')).toBe('42');
    expect(portraitUrl({ name: 'Wolf', type: 'beast' })).toMatch(/^data:image\/svg\+xml/);
  });
});
