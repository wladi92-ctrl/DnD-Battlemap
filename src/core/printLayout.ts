/**
 * Seitenaufteilung für den Kartendruck.
 * - Maßstab: 1 Feld = 1 Zoll (72 pt) – auf mehrere Seiten gekachelt, je Seite ganze Felder,
 *   Hoch- oder Querformat, je nachdem, was weniger Seiten ergibt.
 * - Einpassen: ganze Karte auf eine Seite, Ausrichtung nach Seitenverhältnis.
 * Koordinaten der Platzierung in Punkt mit Ursprung links unten (PDF).
 */

export interface PrintPage {
  /** Spalte/Zeile der Kachel (0-basiert). */
  col: number;
  row: number;
  /** Ausschnitt der Karte in Feldern. */
  cells: { x: number; y: number; w: number; h: number };
  /** Platzierung des Bildes auf der Seite (pt). */
  placement: { x: number; y: number; width: number; height: number };
}

export interface PrintLayout {
  pageWidth: number;
  pageHeight: number;
  across: number;
  down: number;
  pages: PrintPage[];
  /** Punkt pro Feld. */
  cellPt: number;
}

export const INCH_PT = 72;

function orient(paper: { width: number; height: number }, landscape: boolean) {
  const long = Math.max(paper.width, paper.height);
  const short = Math.min(paper.width, paper.height);
  return landscape ? { width: long, height: short } : { width: short, height: long };
}

/** Maßstabsgetreu (Standard: 1 Feld = 1 Zoll), mehrseitig. */
export function tiledLayout(
  cols: number,
  rows: number,
  paper: { width: number; height: number },
  margin: number,
  cellPt = INCH_PT,
): PrintLayout {
  const build = (landscape: boolean): PrintLayout => {
    const { width, height } = orient(paper, landscape);
    const perX = Math.max(1, Math.floor((width - 2 * margin) / cellPt));
    const perY = Math.max(1, Math.floor((height - 2 * margin) / cellPt));
    const across = Math.ceil(cols / perX);
    const down = Math.ceil(rows / perY);
    const pages: PrintPage[] = [];
    for (let row = 0; row < down; row++) {
      for (let col = 0; col < across; col++) {
        const x = col * perX;
        const y = row * perY;
        const w = Math.min(perX, cols - x);
        const h = Math.min(perY, rows - y);
        pages.push({
          col,
          row,
          cells: { x, y, w, h },
          placement: {
            x: margin,
            y: height - margin - h * cellPt,
            width: w * cellPt,
            height: h * cellPt,
          },
        });
      }
    }
    return { pageWidth: width, pageHeight: height, across, down, pages, cellPt };
  };
  const portrait = build(false);
  const landscape = build(true);
  return landscape.pages.length < portrait.pages.length ? landscape : portrait;
}

/** Ganze Karte auf eine Seite (zentriert, so groß wie möglich). */
export function fitLayout(
  cols: number,
  rows: number,
  paper: { width: number; height: number },
  margin: number,
): PrintLayout {
  const { width, height } = orient(paper, cols > rows);
  const cellPt = Math.min((width - 2 * margin) / cols, (height - 2 * margin) / rows);
  const w = cols * cellPt;
  const h = rows * cellPt;
  return {
    pageWidth: width,
    pageHeight: height,
    across: 1,
    down: 1,
    cellPt,
    pages: [
      {
        col: 0,
        row: 0,
        cells: { x: 0, y: 0, w: cols, h: rows },
        placement: { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h },
      },
    ],
  };
}

/** Kachelbezeichnung wie auf Landkarten: Spalte als Buchstabe, Zeile als Zahl („B3“). */
export function tileName(col: number, row: number): string {
  let s = '';
  let c = col;
  do {
    s = String.fromCharCode(65 + (c % 26)) + s;
    c = Math.floor(c / 26) - 1;
  } while (c >= 0);
  return `${s}${row + 1}`;
}
