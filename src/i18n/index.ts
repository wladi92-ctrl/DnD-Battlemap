/**
 * Schlankes, typisiertes i18n ohne Laufzeitabhängigkeiten.
 * Deutsch ist die Referenzsprache: alle Schlüssel werden aus de.json abgeleitet,
 * weitere Sprachen müssen exakt dieselben Schlüssel liefern (per Test geprüft).
 */
import de from './de.json';
import en from './en.json';

export type MessageKey = keyof typeof de;
export type Messages = Record<MessageKey, string>;

export const locales = { de, en } satisfies Record<string, Messages>;
export type Locale = keyof typeof locales;
export const defaultLocale: Locale = 'de';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && Object.hasOwn(locales, value);
}

/** Ersetzt Platzhalter der Form {name} durch die übergebenen Werte. */
export function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

export function translate(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  // Fehlt eine Übersetzung, fällt die Anzeige auf Deutsch zurück.
  const template = locales[locale][key] ?? locales[defaultLocale][key];
  return format(template, params);
}
