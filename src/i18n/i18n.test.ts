import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { format, isLocale, locales, translate } from './index';

describe('i18n', () => {
  it('alle Sprachen haben exakt die Schlüssel der deutschen Referenz', () => {
    const reference = Object.keys(locales.de).sort();
    for (const [name, messages] of Object.entries(locales)) {
      expect(Object.keys(messages).sort(), name).toEqual(reference);
    }
  });

  it('keine leeren Texte', () => {
    for (const messages of Object.values(locales)) {
      for (const [key, value] of Object.entries(messages)) {
        expect(value.trim(), key).not.toBe('');
      }
    }
  });

  it('Platzhalter sind in allen Sprachen identisch', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(locales.de) as (keyof typeof locales.de)[]) {
      expect(placeholders(locales.en[key]), key).toEqual(placeholders(locales.de[key]));
    }
  });

  it('Deutsch vollständig: jeder im Code verwendete Schlüssel ist übersetzt', () => {
    // Alle Quelltexte nach t('…'), label: '…' und Aktions-Schlüsseln durchsuchen.
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && !name.includes('.test.')) {
          const src = readFileSync(p, 'utf8');
          for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)) used.add(m[1]!);
          for (const m of src.matchAll(/\b(?:label|title|description): '([a-z]+\.[\w.]+)'/g))
            used.add(m[1]!);
          for (const m of src.matchAll(/'(action\.\w+)'/g)) used.add(m[1]!);
        }
      }
    };
    walk(join(__dirname, '..'));
    expect(used.size).toBeGreaterThan(500);
    const missing = [...used].filter((k) => !(k in locales.de));
    expect(missing).toEqual([]);
  });

  it('ersetzt Platzhalter und lässt unbekannte stehen', () => {
    expect(format('{a} und {b}', { a: 1 })).toBe('1 und {b}');
    expect(translate('de', 'about.version', { version: '1.2.3' })).toBe('Version 1.2.3');
  });

  it('erkennt gültige Sprachen', () => {
    expect(isLocale('de')).toBe(true);
    expect(isLocale('xx')).toBe(false);
    expect(isLocale('toString')).toBe(false);
  });
});
