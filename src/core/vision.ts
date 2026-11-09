/**
 * Sicht, Licht und Nebel des Krieges auf dem Quadratraster (SRD 5.1).
 *
 * - Lichtstufen je Feld: dunkel, dämmrig, hell, magische Dunkelheit. Grundhelligkeit der Karte,
 *   jede Lichtquelle erhellt Felder in Sichtlinie (helles Licht im inneren Radius, dämmriges bis
 *   zum äußeren). Magische Dunkelheit verdrängt jedes Licht und blockiert Dunkelsicht.
 * - Sicht einer Figur: Sichtlinie (Kantenwände außer Fenstern und offenen Türen, undurchsichtige
 *   Felder) und das Feld ist hell/dämmrig – oder dunkel, aber innerhalb der Dunkelsicht.
 * - Spielermaske: 0 = nie gesehen (schwarz), 1 = erkundet (abgedunkelt, ohne Figuren),
 *   2 = sichtbar. Manuell verdeckte Felder bleiben in jedem Fall schwarz.
 */
import { LineOfEffect, type AoeEnvironment } from './aoe';
import type { Point } from './grid';
import { wallBlocksSight } from './walls';

export const LIGHT_DARK = 0;
export const LIGHT_DIM = 1;
export const LIGHT_BRIGHT = 2;
export const LIGHT_MAGIC_DARK = 3;

export const MASK_HIDDEN = 0;
export const MASK_EXPLORED = 1;
export const MASK_VISIBLE = 2;

export type Ambient = 'bright' | 'dim' | 'dark';
export const AMBIENTS: readonly Ambient[] = ['bright', 'dim', 'dark'];

export interface LightSource {
  /** Mittelpunkt in Feldkoordinaten. */
  x: number;
  y: number;
  /** Radius hellen Lichts in ft. */
  bright: number;
  /** Radius dämmrigen Lichts in ft (gesamt, ≥ bright). */
  dim: number;
  /** Magische Dunkelheit statt Licht. */
  darkness?: boolean;
}

export interface Viewer {
  /** Augenpunkt (Mitte des Tokens) in Feldkoordinaten. */
  x: number;
  y: number;
  /** Dunkelsicht in ft (0 = keine). */
  darkvision: number;
}

/** Sichtumgebung: wie bei Effekten, nur blockieren Fenster und offene Türen die Sicht nicht. */
export type VisionEnvironment = AoeEnvironment;

const PROBES: readonly [number, number][] = [
  [0.5, 0.5],
  [0.15, 0.15],
  [0.85, 0.15],
  [0.15, 0.85],
  [0.85, 0.85],
];

/** Sichtbarkeit eines Feldes von einem Punkt aus (mindestens ein Prüfpunkt frei). */
function cellInSight(los: LineOfEffect, from: Point, x: number, y: number): boolean {
  return PROBES.some(([px, py]) => los.clear(from, { x: x + px, y: y + py }));
}

const ambientLevel = (a: Ambient) =>
  a === 'bright' ? LIGHT_BRIGHT : a === 'dim' ? LIGHT_DIM : LIGHT_DARK;

/** Lichtstufe je Feld (Index y·cols+x). */
export function lightLevels(
  env: VisionEnvironment,
  lights: readonly LightSource[],
  ambient: Ambient,
): Uint8Array {
  const { cols, rows, feetPerCell: fpc } = env;
  const levels = new Uint8Array(cols * rows).fill(ambientLevel(ambient));
  const los = new LineOfEffect(env, wallBlocksSight);
  const apply = (l: LightSource, darkness: boolean) => {
    const r = Math.max(l.dim, l.bright) / fpc;
    if (r <= 0) return;
    const x0 = Math.max(0, Math.floor(l.x - r));
    const x1 = Math.min(cols - 1, Math.ceil(l.x + r));
    const y0 = Math.max(0, Math.floor(l.y - r));
    const y1 = Math.min(rows - 1, Math.ceil(l.y + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - l.x, y + 0.5 - l.y);
        if (d > r) continue;
        if (!cellInSight(los, l, x, y)) continue;
        const i = y * cols + x;
        if (darkness) levels[i] = LIGHT_MAGIC_DARK;
        else if ((levels[i] as number) !== LIGHT_MAGIC_DARK) {
          const lvl = d <= l.bright / fpc ? LIGHT_BRIGHT : LIGHT_DIM;
          if (lvl > (levels[i] as number)) levels[i] = lvl;
        }
      }
    }
  };
  for (const l of lights) if (!l.darkness) apply(l, false);
  // Magische Dunkelheit zuletzt: sie überdeckt jedes (nichtmagische) Licht.
  for (const l of lights) if (l.darkness) apply(l, true);
  return levels;
}

/**
 * Felder, die eine Figur sieht. `rangeFeet` begrenzt die Suche (Leistung); helles/dämmriges
 * Licht ist darüber hinaus nicht sichtbar – für Karten bis 200×200 reicht ein großzügiger Wert.
 */
export function visibleCells(
  env: VisionEnvironment,
  viewer: Viewer,
  levels: Uint8Array,
  rangeFeet: number,
  out: Uint8Array = new Uint8Array(env.cols * env.rows),
): Uint8Array {
  const { cols, rows, feetPerCell: fpc } = env;
  const los = new LineOfEffect(env, wallBlocksSight);
  const r = rangeFeet / fpc;
  const dv = viewer.darkvision / fpc;
  const x0 = Math.max(0, Math.floor(viewer.x - r));
  const x1 = Math.min(cols - 1, Math.ceil(viewer.x + r));
  const y0 = Math.max(0, Math.floor(viewer.y - r));
  const y1 = Math.min(rows - 1, Math.ceil(viewer.y + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * cols + x;
      if (out[i]) continue;
      const d = Math.hypot(x + 0.5 - viewer.x, y + 0.5 - viewer.y);
      if (d > r) continue;
      const level = levels[i] as number;
      if (level === LIGHT_MAGIC_DARK) continue;
      // Das eigene Feld ist immer bekannt (auch im Dunkeln tastet man sich).
      const own = d < 0.75;
      if (!own && level === LIGHT_DARK && d > dv) continue;
      if (!own && !cellInSight(los, viewer, x, y)) continue;
      out[i] = 1;
    }
  }
  return out;
}

/**
 * Spielermaske aus manuellem Nebel, aktueller Sicht und Erkundetem.
 * @param revealed manuell aufgedeckt (1) – nur wirksam, wenn fogEnabled
 * @param visible aktuell sichtbar (1) – nur wirksam, wenn visionEnabled
 * @param explored je gesehen (1)
 */
export function playerMask(
  size: number,
  opts: {
    fogEnabled: boolean;
    revealed: Uint8Array;
    visionEnabled: boolean;
    visible: Uint8Array;
    explored: Uint8Array;
  },
): Uint8Array {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    if (opts.fogEnabled && !opts.revealed[i]) continue;
    if (!opts.visionEnabled || opts.visible[i]) out[i] = MASK_VISIBLE;
    else if (opts.explored[i]) out[i] = MASK_EXPLORED;
  }
  return out;
}

// ------------------------------------------------------------------ Lauflängenkodierung

/**
 * Bitmaske (0/1 je Feld) als Lauflängen: abwechselnd Anzahl 0 und Anzahl 1, beginnend mit 0.
 * Kompakt für zusammenhängende Bereiche (aufgedeckte Räume).
 */
export function encodeRuns(mask: Uint8Array): number[] {
  const runs: number[] = [];
  let current = 0;
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] ? 1 : 0;
    if (v === current) count++;
    else {
      runs.push(count);
      current = v;
      count = 1;
    }
  }
  runs.push(count);
  // Abschließende Nullen weglassen (Rest ist implizit 0).
  if (current === 0) runs.pop();
  return runs;
}

export function decodeRuns(runs: readonly number[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let pos = 0;
  runs.forEach((n, k) => {
    const end = Math.min(size, pos + Math.max(0, Math.floor(n)));
    if (k % 2 === 1) out.fill(1, pos, end);
    pos = end;
  });
  return out;
}

/** Summe der Lauflängen (für die Prüfung beim Laden). */
export function runsLength(runs: readonly number[]): number {
  return runs.reduce((a, b) => a + b, 0);
}
