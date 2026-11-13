import { describe, expect, it } from 'vitest';
import { createPdf, PAPER, toWinAnsi, wrapText } from './pdf';
import { fitLayout, INCH_PT, tiledLayout, tileName } from './printLayout';

const ascii = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');
// kleinstes gültiges JPEG-Gerüst genügt für die Struktur (Inhalt wird nicht dekodiert)
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

describe('PDF-Schreiber', () => {
  it('Struktur: Kopf, Seiten, Bilder, Text, gültige xref-Offsets', () => {
    const pdf = createPdf([
      {
        ...PAPER.a4,
        images: [{ jpeg: JPEG, pxWidth: 10, pxHeight: 5, x: 20, y: 20, width: 100, height: 50 }],
        texts: [{ x: 20, y: 800, size: 12, text: 'Grüße (Test) \\ Übung', bold: true }],
        lines: [{ x1: 0, y1: 0, x2: 10, y2: 10, width: 1, dash: 3 }],
      },
      { ...PAPER.letter, texts: [{ x: 10, y: 10, size: 9, text: 'Seite 2 – Ende' }] },
    ]);
    const s = ascii(pdf);
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(s).toContain('/Count 2');
    expect(s).toContain('/Filter /DCTDecode');
    expect(s).toContain('/Width 10 /Height 5');
    // Umlaute als WinAnsi-Oktal, Klammern/Backslash maskiert
    expect(s).toContain('(Gr\\374\\337e \\(Test\\) \\\\ \\334bung) Tj');
    expect(s).toContain('(Seite 2 \\226 Ende) Tj');
    // Jeder xref-Eintrag zeigt auf „n 0 obj“
    const xref = s.slice(s.lastIndexOf('\nxref\n'));
    const offsets = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets.length).toBeGreaterThan(6);
    offsets.forEach((o, i) => expect(s.slice(o, o + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
    const start = Number(/startxref\n(\d+)/.exec(s)?.[1]);
    expect(s.slice(start, start + 4)).toBe('xref');
  });

  it('WinAnsi und Zeilenumbruch', () => {
    expect(toWinAnsi('ä€✓')).toEqual([0xe4, 0x80, 0x3f]);
    const lines = wrapText('eins zwei drei vier fünf sechs', 10, 60);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('eins zwei drei vier fünf sechs');
  });
});

describe('Drucklayout', () => {
  it('1 Feld = 1 Zoll auf A4 mit 10 mm Rand: 7×10 Felder je Seite (hoch)', () => {
    const l = tiledLayout(30, 20, PAPER.a4, 10 * (72 / 25.4));
    // Querformat: 10×7 je Seite → 3×3 = 9 Seiten; Hochformat: 7×10 → 5×2 = 10 Seiten
    expect(l.pages).toHaveLength(9);
    expect(l.pageWidth).toBeGreaterThan(l.pageHeight);
    expect(l.across).toBe(3);
    expect(l.down).toBe(3);
    const last = l.pages[l.pages.length - 1]!;
    expect(last.cells).toEqual({ x: 20, y: 14, w: 10, h: 6 });
    expect(last.placement.width).toBe(10 * INCH_PT);
    // alle Felder genau einmal
    const area = l.pages.reduce((a, p) => a + p.cells.w * p.cells.h, 0);
    expect(area).toBe(600);
  });

  it('Einpassen und Kachelnamen', () => {
    const l = fitLayout(40, 20, PAPER.letter, 36);
    expect(l.pages).toHaveLength(1);
    expect(l.pageWidth).toBeGreaterThan(l.pageHeight); // quer
    expect(l.pages[0]!.placement.width).toBeCloseTo(l.pageWidth - 72, 5);
    expect(tileName(0, 0)).toBe('A1');
    expect(tileName(2, 4)).toBe('C5');
    expect(tileName(27, 0)).toBe('AB1');
  });
});
