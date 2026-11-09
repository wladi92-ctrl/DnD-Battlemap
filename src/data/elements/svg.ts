/**
 * Kleine Hilfen zum Erzeugen der Element-Grafiken als SVG.
 * Koordinaten: 100 Einheiten pro Feld; ein 2×1-Element hat also viewBox 0 0 200 100.
 */
import { rngFrom, type Rng } from '../../core/random';

export const U = 100;

const n = (v: number) => Math.round(v * 10) / 10;

/** Tintenfarbe der Umrisse (dunkles Sepia wie in gedruckten Abenteuerkarten). */
export const INK = '#2a1c11';

/**
 * Zeichenstil:
 * - `object`: Möbel, Natur, Bauteile – Tuschumriss um die Silhouette, Pinsel-/Papierkorn,
 *   Schattierung zur Lichtseite (Licht von oben links) und weicher Schlagschatten.
 * - `tile`: kachelbare Flächen (Böden, Mauerwerk) – nur das Korn; Umrisse und Schatten je
 *   Kachel würden aneinanderstoßende Kacheln in Einzelblöcke zerlegen.
 * - `flat`: unverändert (z. B. Glyphen, die selbst leuchten sollen).
 */
export type SvgStyle = 'object' | 'tile' | 'flat';

/** Papier-/Pinselkorn: dunkle, unregelmäßige Sprenkel nur innerhalb der Form. */
const GRAIN =
  '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="11" result="noise"/>' +
  '<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0.16  0 0 0 0 0.1  0 0 0 0 0.05  0 0 0 0.9 -0.32" result="speck"/>' +
  '<feComposite in="speck" in2="SourceAlpha" operator="in" result="grain"/>';

const FILTERS: Record<Exclude<SvgStyle, 'flat'>, string> = {
  tile:
    '<filter id="st" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">' +
    GRAIN +
    '<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="grain"/></feMerge></filter>',
  object:
    '<filter id="st" x="-8%" y="-8%" width="124%" height="128%" color-interpolation-filters="sRGB">' +
    // Deckende Silhouette (schwache Lichtschimmer unter 25 % zählen nicht dazu)
    '<feComponentTransfer in="SourceAlpha" result="solid"><feFuncA type="discrete" tableValues="0 1 1 1"/></feComponentTransfer>' +
    // Schlagschatten nach unten rechts
    '<feGaussianBlur in="solid" stdDeviation="3.2" result="sb"/><feOffset in="sb" dx="4" dy="6" result="so"/>' +
    `<feFlood flood-color="#1b120a" flood-opacity="0.42"/><feComposite in2="so" operator="in"/>` +
    '<feComposite in2="solid" operator="out" result="shadow"/>' +
    // Tuschumriss
    '<feMorphology in="solid" operator="dilate" radius="2.2" result="fat"/>' +
    `<feFlood flood-color="${INK}"/><feComposite in2="fat" operator="in"/>` +
    // nur als Ring außen – durchscheinende Flächen (Fallen, Glas) bleiben hell
    '<feComposite in2="solid" operator="out" result="outline"/>' +
    // Schattierung: Innenkante unten rechts abdunkeln
    '<feGaussianBlur in="solid" stdDeviation="5" result="ib"/><feOffset in="ib" dx="-5" dy="-6" result="io"/>' +
    '<feComposite in="solid" in2="io" operator="out" result="rim"/>' +
    `<feFlood flood-color="${INK}" flood-opacity="0.38"/><feComposite in2="rim" operator="in" result="shade"/>` +
    GRAIN +
    '<feMerge><feMergeNode in="shadow"/><feMergeNode in="outline"/><feMergeNode in="SourceGraphic"/>' +
    '<feMergeNode in="shade"/><feMergeNode in="grain"/></feMerge></filter>',
};

export function svgDoc(w: number, h: number, body: string, style: SvgStyle = 'object'): string {
  const head =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w * U} ${h * U}" ` +
    `width="${w * 128}" height="${h * 128}">`;
  if (style === 'flat') return `${head}${body}</svg>`;
  return `${head}<defs>${FILTERS[style]}</defs><g filter="url(#st)">${body}</g></svg>`;
}

export const rect = (x: number, y: number, w: number, h: number, fill: string, extra = '') =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}" ${extra}/>`;

export const rrect = (
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  extra = '',
) => rect(x, y, w, h, fill, `rx="${n(r)}" ${extra}`);

export const circle = (cx: number, cy: number, r: number, fill: string, extra = '') =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}" ${extra}/>`;

export const ellipse = (cx: number, cy: number, rx: number, ry: number, fill: string, extra = '') =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}" ${extra}/>`;

export const path = (d: string, fill: string, extra = '') =>
  `<path d="${d}" fill="${fill}" ${extra}/>`;

export const line = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  width: number,
  extra = '',
) =>
  `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${stroke}" ` +
  `stroke-width="${width}" stroke-linecap="round" ${extra}/>`;

export const poly = (points: readonly number[], fill: string, extra = '') =>
  `<polygon points="${points.map(n).join(' ')}" fill="${fill}" ${extra}/>`;

export const stroke = (color: string, width: number) =>
  `stroke="${color}" stroke-width="${width}" stroke-linejoin="round"`;

export const g = (body: string, extra = '') => `<g ${extra}>${body}</g>`;

/** Unregelmäßiges Polygon (Steine, Felsen, Büsche) um einen Mittelpunkt. */
export function blob(
  rng: Rng,
  cx: number,
  cy: number,
  r: number,
  jitter: number,
  points = 9,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r * (1 - jitter / 2 + rng() * jitter);
    out.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  return out;
}

/** Streut `count` Formen über die Fläche (für Texturen wie Gras, Sand, Kies). */
export function scatter(
  seed: string,
  count: number,
  w: number,
  h: number,
  draw: (x: number, y: number, rng: Rng, i: number) => string,
): string {
  const rng = rngFrom(seed);
  let out = '';
  for (let i = 0; i < count; i++) out += draw(rng() * w, rng() * h, rng, i);
  return out;
}

/** Hellt (+) oder dunkelt (−) eine #rrggbb-Farbe um `amount` (−1…1) auf. */
export function shade(hex: string, amount: number): string {
  const v = Number.parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const c = (v >> shift) & 0xff;
    const t = amount < 0 ? 0 : 255;
    return Math.round(c + (t - c) * Math.abs(amount));
  };
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

export { rngFrom };
