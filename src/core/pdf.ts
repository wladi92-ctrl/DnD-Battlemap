/**
 * Minimaler PDF-Schreiber (PDF 1.4) ohne Fremdbibliothek: Seiten mit JPEG-Bildern
 * (DCTDecode), Text in Helvetica/Helvetica-Bold (WinAnsi – deckt Deutsch ab) sowie Linien und
 * Rechtecken. Maßeinheit: Punkt (1/72 Zoll), Ursprung links unten wie in PDF üblich.
 */

export interface PdfImage {
  /** JPEG-Datei (Baseline oder progressiv). */
  jpeg: Uint8Array;
  /** Pixelmaße des JPEG. */
  pxWidth: number;
  pxHeight: number;
  /** Platzierung in Punkt. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfText {
  x: number;
  y: number;
  size: number;
  text: string;
  bold?: boolean;
  /** Grauwert 0 (schwarz) … 1 (weiß). */
  gray?: number;
}

export interface PdfLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  gray?: number;
  dash?: number;
}

export interface PdfPage {
  width: number;
  height: number;
  images?: PdfImage[];
  texts?: PdfText[];
  lines?: PdfLine[];
}

export const MM = 72 / 25.4;
export const PAPER = {
  a4: { width: 210 * MM, height: 297 * MM },
  letter: { width: 8.5 * 72, height: 11 * 72 },
} as const;
export type Paper = keyof typeof PAPER;

/** Unicode → WinAnsi (CP1252); nicht darstellbare Zeichen werden zu „?“. */
const CP1252_EXTRA: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

export function toWinAnsi(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 63;
    if (c === 0x2212) out.push(0x2d);
    else if ((c >= 0x20 && c < 0x7f) || (c >= 0xa0 && c <= 0xff)) out.push(c);
    else out.push(CP1252_EXTRA[c] ?? 0x3f);
  }
  return out;
}

/** Text als PDF-Literal (mit Escapes für Klammern und Backslash). */
function literal(text: string): string {
  let s = '(';
  for (const b of toWinAnsi(text)) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) s += `\\${String.fromCharCode(b)}`;
    else if (b < 0x20 || b > 0x7e) s += `\\${b.toString(8).padStart(3, '0')}`;
    else s += String.fromCharCode(b);
  }
  return `${s})`;
}

/** Ungefähre Textbreite in Punkt (Helvetica, für Zeilenumbruch und Ausrichtung). */
export function textWidth(text: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of text) {
    if ("il.,:;|!'`".includes(ch)) w += 0.28;
    else if ('ftrjI '.includes(ch)) w += 0.33;
    else if ('mwMW'.includes(ch)) w += 0.85;
    else if (ch >= 'A' && ch <= 'Z') w += 0.68;
    else w += 0.56;
  }
  return w * size * (bold ? 1.06 : 1);
}

/** Bricht Text auf eine Breite (Punkt) um. */
export function wrapText(text: string, size: number, width: number, bold = false): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && textWidth(next, size, bold) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

const n = (v: number) => (Math.round(v * 100) / 100).toString();

class Writer {
  private chunks: Uint8Array[] = [];
  private length = 0;
  readonly offsets: number[] = [];

  get position() {
    return this.length;
  }
  raw(b: Uint8Array) {
    this.chunks.push(b);
    this.length += b.length;
  }
  /** Nur ASCII (Inhaltsströme sind bereits auf WinAnsi/ASCII gebracht). */
  text(s: string) {
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
    this.raw(b);
  }
  object(id: number, body: string | (() => void)) {
    this.offsets[id] = this.length;
    this.text(`${id} 0 obj\n`);
    if (typeof body === 'string') this.text(body);
    else body();
    this.text('\nendobj\n');
  }
  stream(id: number, dict: string, data: Uint8Array) {
    this.object(id, () => {
      this.text(`<< ${dict} /Length ${data.length} >>\nstream\n`);
      this.raw(data);
      this.text('\nendstream');
    });
  }
  result(): Uint8Array {
    const out = new Uint8Array(this.length);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}

/** Erzeugt die PDF-Datei. */
export function createPdf(pages: readonly PdfPage[], title = 'DnD Battlemap'): Uint8Array {
  const w = new Writer();
  w.text('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  // Feste Objekte: 1 Katalog, 2 Seitenbaum, 3/4 Schriften, 5 Info
  const pageIds: number[] = [];
  let next = 6;
  const plan = pages.map((p) => {
    const page = next++;
    const content = next++;
    const images = (p.images ?? []).map(() => next++);
    pageIds.push(page);
    return { page, content, images };
  });

  w.object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  w.object(
    2,
    `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  );
  w.object(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  w.object(
    4,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );
  w.object(5, `<< /Title ${literal(title)} /Producer (DnD Battlemap) >>`);

  pages.forEach((p, i) => {
    const ids = plan[i];
    if (!ids) return;
    const xobjects = ids.images.map((id, k) => `/Im${k} ${id} 0 R`).join(' ');
    w.object(
      ids.page,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(p.width)} ${n(p.height)}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobjects ? ` /XObject << ${xobjects} >>` : ''} >> ` +
        `/Contents ${ids.content} 0 R >>`,
    );
    let ops = '';
    (p.images ?? []).forEach((img, k) => {
      ops += `q ${n(img.width)} 0 0 ${n(img.height)} ${n(img.x)} ${n(img.y)} cm /Im${k} Do Q\n`;
    });
    for (const l of p.lines ?? []) {
      ops +=
        `q ${n(l.gray ?? 0)} G ${n(l.width)} w ${l.dash ? `[${n(l.dash)}] 0 d ` : ''}` +
        `${n(l.x1)} ${n(l.y1)} m ${n(l.x2)} ${n(l.y2)} l S Q\n`;
    }
    for (const t of p.texts ?? []) {
      ops +=
        `BT ${n(t.gray ?? 0)} g /${t.bold ? 'F2' : 'F1'} ${n(t.size)} Tf ${n(t.x)} ${n(t.y)} Td ` +
        `${literal(t.text)} Tj ET\n`;
    }
    const content = new Uint8Array(ops.length);
    for (let c = 0; c < ops.length; c++) content[c] = ops.charCodeAt(c) & 0xff;
    w.stream(ids.content, '', content);
    (p.images ?? []).forEach((img, k) => {
      const id = ids.images[k];
      if (id === undefined) return;
      w.stream(
        id,
        `/Type /XObject /Subtype /Image /Width ${img.pxWidth} /Height ${img.pxHeight} ` +
          '/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode',
        img.jpeg,
      );
    });
  });

  const xref = w.position;
  const count = next;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id++)
    table += `${String(w.offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`;
  w.text(table);
  w.text(`trailer\n<< /Size ${count} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return w.result();
}
