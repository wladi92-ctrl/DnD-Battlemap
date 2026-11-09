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

/** Größter geprüfter Teiler beim Erkennen von Vielfachen der Feldgröße. */
const MAX_DIVISOR = 20;
/**
 * Mindesthöhe der Zwischen-Zähne eines Bruchteils P/q (Anteil an der Höhe des Hauptzahns über
 * der Grundlinie). Echte Bruchteile eines Rasters liegen im Tal, also darunter.
 */
const DIVISOR_SHARE = 0.12;

/** Bruchteile j/q (q = 2…7) zwischen zwei Kammzähnen, mit Abstand zu den Zähnen (¼…¾). */
const GAP_FRACTIONS = (() => {
  const out = new Set<number>();
  for (let q = 2; q <= 7; q++)
    for (let j = 1; j < q; j++) if (j / q >= 0.25 && j / q <= 0.75) out.add(j / q);
  return [...out];
})();

/**
 * Logarithmische Stauchung: Die Autokorrelation multipliziert Werte, dicke Wände und Rahmen
 * würden die vielen schwachen Rasterlinien sonst quadratisch überstimmen. Maßstab ist der
 * typische Ausschlag (Median der lokalen Spitzen).
 */
function compress(p: Float64Array): Float64Array {
  const peaks: number[] = [];
  for (let i = 1; i < p.length - 1; i++) {
    const v = p[i] ?? 0;
    if (v > 0 && v >= (p[i - 1] ?? 0) && v >= (p[i + 1] ?? 0)) peaks.push(v);
  }
  if (!peaks.length) return p;
  peaks.sort((a, b) => a - b);
  const scale = peaks[Math.floor(peaks.length / 2)] ?? 1;
  return p.map((v) => Math.log1p(v / scale));
}

/** Periode und Phase eines Profils. */
export function findPeriod(profile: Float64Array, minP: number, maxP: number): Periodicity | null {
  // Schmaler Hochpass: Rasterlinien sind wenige Pixel breit; breitere Strukturen (Wände, Möbel,
  // Verläufe) werden so weitgehend entfernt.
  const p = compress(highPass(profile, Math.max(3, Math.min(8, Math.round(minP / 2)))));
  const n = p.length;
  const hi = Math.min(Math.floor(maxP), Math.floor(n / 3));
  if (hi <= minP) return null;
  let energy = 0;
  for (let i = 0; i < n; i++) energy += (p[i] ?? 0) ** 2;
  if (energy <= 0) return null;

  // Autokorrelation bis zu einem Mehrfachen der größten Feldgröße (für die Oberwellen).
  const maxLag = Math.min(n - 2, Math.max(hi * 2, Math.floor(n / 2)));
  const acf = new Float64Array(maxLag + 2);
  for (let lag = 1; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += (p[i] ?? 0) * (p[i + lag] ?? 0);
    acf[lag] = (s / (n - lag)) * (n / energy);
  }
  const at = (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    return (acf[i] ?? 0) * (1 - f) + (acf[i + 1] ?? 0) * f;
  };

  /*
   * Kamm-Bewertung: Ein Raster mit Feldgröße P korreliert bei P, 2P, 3P … stark und dazwischen
   * schwach. Bewertet wird „Zähne minus Lücken“, wobei als Lücke der höchste Wert an den
   * Bruchteilstellen ½, ⅓, ¼ … zwischen zwei Zähnen zählt, und zwar das untere Quartil über alle
   * Zähne (jeder Zahn muss tragen). Das wählt die Grundperiode: Bei einem Vielfachen (2P, 3P)
   * fällt eine Bruchteilstelle auf eine echte Rasterlinie, bei einem Bruchteil (P/2) liegt jeder
   * zweite Zahn im Tal.
   */
  const comb = (period: number) => {
    const contrast: number[] = [];
    for (let m = 1; m * period <= maxLag && m <= 24; m++) {
      let gap = 0;
      for (const f of GAP_FRACTIONS) gap = Math.max(gap, at((m - f) * period));
      contrast.push(at(m * period) - gap);
    }
    if (contrast.length < 2) return -Infinity;
    contrast.sort((x, y) => x - y);
    return contrast[Math.floor((contrast.length - 1) / 4)] ?? -Infinity;
  };
  let period = -1;
  let best = 0;
  for (let c = minP; c <= hi; c += 0.05) {
    const v = comb(c);
    if (v > best) {
      best = v;
      period = c;
    }
  }
  if (period < 0 || best <= 0) return null;

  /*
   * Teiler-Prüfung: Gedruckte Karten haben oft dicke Wände oder Rahmen genau auf jeder n-ten
   * Rasterlinie (Räume von 2, 4 oder 11 Feldern). Deren Kamm kann den der feinen Linien
   * überstimmen. Ein Bruchteil P/q ist die eigentliche Feldgröße, wenn auch seine
   * Zwischen-Zähne (m nicht durch q teilbar) deutlich über der Grundlinie der Korrelation liegen –
   * mit kleiner Toleranz, weil Wandkanten 2–3 px neben den dünnen Linien liegen. Bei einem
   * echten Bruchteil des Rasters (P/2) liegen diese Zwischen-Zähne im Tal.
   */
  const sorted = Array.from(acf.subarray(Math.max(1, Math.floor(minP / 2)), maxLag + 1)).sort(
    (x, y) => x - y,
  );
  const baseline = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const near = (x: number, r: number) => {
    let v = Math.max(at(x - r), at(x + r), at(x));
    for (let i = Math.ceil(x - r); i <= x + r; i++) v = Math.max(v, acf[i] ?? 0);
    return v;
  };
  // Unter den passenden Teilern gewinnt der mit den deutlichsten Zwischen-Zähnen; danach wird
  // das Ergebnis erneut geprüft (100 → 50 → 25 bei Räumen von vier Feldern).
  const strength = near(period, Math.max(1, period * 0.02)) - baseline;
  for (let round = 0; round < 4; round++) {
    let bestLow = 0;
    let bestSub = -1;
    for (let q = MAX_DIVISOR; q >= 2; q--) {
      const sub = period / q;
      if (sub < minP) continue;
      const r = Math.min(4, Math.max(1, sub * 0.07));
      const lifts: number[] = [];
      for (let m = 1; m * sub <= maxLag && lifts.length < 24; m++) {
        if (m % q === 0) continue;
        // Lokale Spitze: höher als die Stellen eine halbe Teilperiode daneben (bei einem
        // halbierten Raster liegen dort die echten Linien) und über der Grundlinie.
        const side = Math.max(at((m - 0.5) * sub), at((m + 0.5) * sub), baseline);
        lifts.push(near(m * sub, r) - side);
      }
      if (lifts.length < 2) continue;
      lifts.sort((x, y) => x - y);
      const low = lifts[Math.floor((lifts.length - 1) / 4)] ?? 0;
      if (low > DIVISOR_SHARE * strength && low > bestLow) {
        bestLow = low;
        bestSub = sub;
      }
    }
    if (bestSub < 0) break;
    period = bestSub;
  }

  // Feinabstimmung: exakte Lage der Zähne (Mittelwert aller Vielfachen) im Umfeld ±2 %.
  const teethMean = (c: number) => {
    let sum = 0;
    let k = 0;
    for (let m = 1; m * c <= maxLag && m <= 24; m++, k++) sum += at(m * c);
    return k ? sum / k : 0;
  };
  let fineBest = teethMean(period);
  const center = period;
  const span = Math.max(0.05, center * 0.02);
  for (let c = center - span; c <= center + span; c += 0.005) {
    const v = teethMean(c);
    if (v > fineBest) {
      fineBest = v;
      period = c;
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
