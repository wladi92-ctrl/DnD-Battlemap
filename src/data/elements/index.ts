/**
 * Eingebaute Elementbibliothek: Register, Namen (de/en), SVG-Cache und Suche.
 * Alle Grafiken sind selbst erzeugt (siehe *.ts in diesem Ordner).
 */
import type { Locale } from '../../i18n';
import type { CustomElement, ElementLayerId, TerrainProps } from '../../storage/mapDocument';
import type { CategoryId } from './categories';
import { floorElements } from './floors';
import { furnitureElements, lightElements } from './furniture';
import namesDe from './names.de.json';
import namesEn from './names.en.json';
import { miscElements, natureElements } from './nature';
import {
  doorElements,
  stairElements,
  trapElements,
  wallElements,
  windowElements,
} from './structure';
import type { ElementDef } from './types';

export type { ElementDef } from './types';

export const builtinElements: readonly ElementDef[] = [
  ...floorElements,
  ...wallElements,
  ...doorElements,
  ...windowElements,
  ...stairElements,
  ...trapElements,
  ...furnitureElements,
  ...lightElements,
  ...natureElements,
  ...miscElements,
];

const byId = new Map(builtinElements.map((e) => [e.id, e]));

export const elementNames: Record<Locale, Record<string, string>> = { de: namesDe, en: namesEn };

export function getBuiltinElement(id: string): ElementDef | undefined {
  return byId.get(id);
}

/** Einheitliche Sicht auf eingebaute und eigene Elemente. */
export interface ElementInfo {
  id: string;
  name: string;
  category: CategoryId | string;
  layer: ElementLayerId;
  w: number;
  h: number;
  color: string;
  props: TerrainProps;
  tags: readonly string[];
  custom: boolean;
  /** Bei eigenen Elementen: Pfad in assets/. */
  asset?: string;
}

export function builtinInfo(def: ElementDef, locale: Locale): ElementInfo {
  return {
    id: def.id,
    name: elementNames[locale][def.id] ?? elementNames.de[def.id] ?? def.id,
    category: def.category,
    layer: def.layer,
    w: def.w,
    h: def.h,
    color: def.color,
    props: def.props ?? {},
    tags: def.tags ?? [],
    custom: false,
  };
}

export function customInfo(el: CustomElement): ElementInfo {
  return {
    id: el.id,
    name: el.name,
    category: el.category,
    layer: el.layer,
    w: el.w,
    h: el.h,
    color: '#a0a0a0',
    props: {},
    tags: [],
    custom: true,
    asset: el.asset,
  };
}

/** Sucht ein Element (eingebaut oder eigenes der Karte). */
export function resolveElement(
  id: string,
  custom: readonly CustomElement[],
  locale: Locale = 'de',
): ElementInfo | undefined {
  const def = byId.get(id);
  if (def) return builtinInfo(def, locale);
  const c = custom.find((e) => e.id === id);
  return c ? customInfo(c) : undefined;
}

const svgCache = new Map<string, string>();

export function elementSvg(id: string): string | undefined {
  const cached = svgCache.get(id);
  if (cached) return cached;
  const def = byId.get(id);
  if (!def) return undefined;
  const svg = def.draw();
  svgCache.set(id, svg);
  return svg;
}

/** data:-URL für Vorschaubilder (CSP: img-src erlaubt data:). */
export function elementDataUrl(id: string): string | undefined {
  const svg = elementSvg(id);
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : undefined;
}

/** Normalisiert Text für die Suche (Kleinschreibung, einheitliche Unicode-Form). */
function norm(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase('de');
}

/** Filtert nach Kategorie und Suchtext (Name, Tags, Kategorie-Name). */
export function searchElements(
  items: readonly ElementInfo[],
  query: string,
  category: string | null,
  categoryName: (id: string) => string,
): ElementInfo[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  return items.filter((e) => {
    if (category && e.category !== category) return false;
    if (!words.length) return true;
    const hay = norm([e.name, ...e.tags, categoryName(e.category)].join(' '));
    return words.every((w) => hay.includes(w));
  });
}
