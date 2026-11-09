/** Kategorien der Elementbibliothek (Anzeigenamen in i18n unter category.<id>). */
export const CATEGORY_IDS = [
  'floors',
  'walls',
  'doors',
  'windows',
  'stairs',
  'traps',
  'furniture',
  'light',
  'nature',
  'misc',
  'custom',
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === 'string' && (CATEGORY_IDS as readonly string[]).includes(value);
}
