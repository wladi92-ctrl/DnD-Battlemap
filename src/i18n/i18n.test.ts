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
