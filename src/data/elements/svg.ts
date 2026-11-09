/**
 * Kleine Hilfen zum Erzeugen der Element-Grafiken als SVG.
 * Koordinaten: 100 Einheiten pro Feld; ein 2×1-Element hat also viewBox 0 0 200 100.
 */
import { rngFrom, type Rng } from '../../core/random';

export const U = 100;

const n = (v: number) => Math.round(v * 10) / 10;

export function svgDoc(w: number, h: number, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w * U} ${h * U}" ` +
    `width="${w * 128}" height="${h * 128}">${body}</svg>`
  );
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
