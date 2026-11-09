/**
 * Automatische Rastererkennung in Kartenbildern.
 *
 * Verfahren: Aus einem Graustufenbild werden horizontale und vertikale Kantenprofile
 * gebildet (Summe der Helligkeitssprünge je Spalte bzw. Zeile). Rasterlinien erzeugen darin
 * ein periodisches Muster. Die Periode (Feldgröße) liefert die Autokorrelation, die Lage
 * (Versatz) die Phase mit der größten Summe. Das Ergebnis ist ein Vorschlag, der in der
 * Kalibrierung immer von Hand nachjustiert werden kann.
 */

export interface GridGuess {
  /** Feldgröße in Pixeln (des analysierten Bildes). */
  cellPx: number;
  /** Lage der ersten Rasterlinie (0 ≤ offset < cellPx). */
  offsetX: number;
  offsetY: number;
  /** 0–1: wie deutlich das Muster ist. */
  confidence: number;
}

export interface DetectOptions {
  minCell?: number;
  maxCell?: number;
}

/** Hochpass: Wert minus gleitender Mittelwert (entfernt Helligkeitsverläufe). */
function highPass(p: Float64Array, radius: number): Float64Array {
  const n = p.length;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = (prefix[i] ?? 0) + (p[i] ?? 0);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - radius);
    const b = Math.min(n, i + radius + 1);
    const mean = ((prefix[b] ?? 0) - (prefix[a] ?? 0)) / (b - a);
    out[i] = Math.max(0, (p[i] ?? 0) - mean);
  }
  return out;
}

export function edgeProfiles(gray: ArrayLike<number>, w: number, h: number) {
  const px = new Float64Array(w);
  const py = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const v = gray[row + x] ?? 0;
      if (x + 1 < w) px[x] = (px[x] ?? 0) + Math.abs((gray[row + x + 1] ?? 0) - v);
      if (y + 1 < h) py[y] = (py[y] ?? 0) + Math.abs((gray[row + w + x] ?? 0) - v);
    }
  }
  return { px, py };
}

interface Periodicity {
  period: number;
  offset: number;
  score: number;
}

/** Periode und Phase eines Profils. */
export function findPeriod(profile: Float64Array, minP: number, maxP: number): Periodicity | null {
  const p = highPass(profile, Math.max(3, Math.round(maxP)));
  const n = p.length;
  const hi = Math.min(Math.floor(maxP), Math.floor(n / 3));
  if (hi <= minP) return null;
  let energy = 0;
  for (let i = 0; i < n; i++) energy += (p[i] ?? 0) ** 2;
  if (energy <= 0) return null;

  const acf = new Float64Array(hi + 2);
  for (let lag = 1; lag <= hi + 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += (p[i] ?? 0) * (p[i + lag] ?? 0);
    acf[lag] = (s / (n - lag)) * (n / energy);
  }
  let lag = -1;
  let best = 0;
  for (let l = minP; l <= hi; l++) {
    const v = acf[l] ?? 0;
    if (v > best) {
      best = v;
      lag = l;
    }
  }
  if (lag < 0 || best <= 0) return null;
  // Sub-Pixel-Verfeinerung per Parabel durch die Nachbarn.
  const a = acf[lag - 1] ?? 0;
  const c = acf[lag + 1] ?? 0;
  const denom = a - 2 * best + c;
  let period = denom !== 0 ? lag + (0.5 * (a - c)) / denom : lag;

  // Das Maximum kann bei einem Vielfachen der Feldgröße liegen (z. B. 75 statt 37,5 px, wenn
  // die Linien abwechselnd 37 und 38 px auseinander liegen). Ist auch ein Bruchteil deutlich
  // korreliert, ist der Bruchteil die eigentliche Feldgröße.
  for (const k of [4, 3, 2]) {
    const sub = period / k;
    if (sub < minP) continue;
    const v = Math.max(acf[Math.floor(sub)] ?? 0, acf[Math.ceil(sub)] ?? 0);
    if (v >= 0.35 * best) {
      period = sub;
      break;
    }
  }

  // Phase: Summe des Profils entlang der Rasterpositionen, fein abgetastet.
  let bestOffset = 0;
  let bestSum = -1;
  let total = 0;
  const steps = Math.max(1, Math.ceil(period * 4));
  for (let s = 0; s < steps; s++) {
    const off = (s / steps) * period;
    let sum = 0;
    for (let x = off; x < n - 1; x += period) {
      const i = Math.floor(x);
      const f = x - i;
      sum += (p[i] ?? 0) * (1 - f) + (p[i + 1] ?? 0) * f;
    }
    total += sum;
    if (sum > bestSum) {
      bestSum = sum;
      bestOffset = off;
    }
  }
  // Deutlichkeit: wie stark die beste Phase über dem Durchschnitt aller Phasen liegt.
  // Echte Rasterlinien liegen alle auf derselben Phase (Verhältnis ≫ 1), zufällige Kanten nicht.
  const mean = total / steps;
  const ratio = mean > 0 ? bestSum / mean : 0;
  const score = Math.max(0, Math.min(1, (ratio - 1.5) / 6));
  return { period, offset: bestOffset, score };
}

/** Erkennt ein quadratisches Raster; null, wenn kein deutliches Muster vorhanden ist. */
export function detectGrid(
  gray: ArrayLike<number>,
  w: number,
  h: number,
  opts: DetectOptions = {},
): GridGuess | null {
  const minP = Math.max(4, Math.round(opts.minCell ?? 8));
  const maxP = Math.round(opts.maxCell ?? Math.min(w, h) / 3);
  const { px, py } = edgeProfiles(gray, w, h);
  const gx = findPeriod(px, minP, maxP);
  const gy = findPeriod(py, minP, maxP);
  if (!gx && !gy) return null;

  let cellPx: number;
  if (gx && gy) {
    const ratio = gx.period / gy.period;
    if (ratio > 0.95 && ratio < 1.05) cellPx = (gx.period + gy.period) / 2;
    else cellPx = gx.score >= gy.score ? gx.period : gy.period;
  } else {
    cellPx = (gx ?? gy)?.period ?? 0;
  }
  const confidence = Math.min(gx?.score ?? 0, gy?.score ?? 0) || (gx ?? gy)?.score || 0;
  if (confidence < 0.15 || cellPx < minP) return null;
  const norm = (o: number | undefined) => (o === undefined ? 0 : ((o % cellPx) + cellPx) % cellPx);
  return {
    cellPx,
    offsetX: norm(gx?.offset),
    offsetY: norm(gy?.offset),
    confidence,
  };
}
