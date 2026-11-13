/**
 * Einfache Markdown-Teilmenge → PDF (für Zusammenfassungen): Überschriften (#, ##, ###),
 * Aufzählungen (-), Tabellen (| … |), Absätze; **fett** und _kursiv_ werden als Text ohne
 * Markierung ausgegeben (fett bei ganzen Zeilen). Automatischer Seitenumbruch.
 */
import { createPdf, MM, PAPER, wrapText, type Paper, type PdfPage, type PdfText } from './pdf';

const MARGIN = 18 * MM;

const strip = (s: string) =>
  s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|\s)_(.+?)_(?=\s|$)/g, '$1$2');

export function markdownToPdf(md: string, title: string, paper: Paper = 'a4'): Uint8Array {
  const { width, height } = PAPER[paper];
  const pages: PdfPage[] = [];
  let texts: PdfText[] = [];
  let y = height - MARGIN;
  const usable = width - 2 * MARGIN;

  const newPage = () => {
    if (texts.length) pages.push({ width, height, texts });
    texts = [];
    y = height - MARGIN;
  };
  const line = (
    text: string,
    size: number,
    opts: { bold?: boolean; indent?: number; gray?: number } = {},
  ) => {
    const lh = size * 1.35;
    if (y - lh < MARGIN) newPage();
    y -= lh;
    texts.push({
      x: MARGIN + (opts.indent ?? 0),
      y,
      size,
      text,
      ...(opts.bold ? { bold: true } : {}),
      ...(opts.gray !== undefined ? { gray: opts.gray } : {}),
    });
  };
  const para = (
    text: string,
    size: number,
    opts: { bold?: boolean; indent?: number; gray?: number } = {},
  ) => {
    for (const l of wrapText(text, size, usable - (opts.indent ?? 0), opts.bold))
      line(l, size, opts);
  };

  for (const raw of md.split('\n')) {
    const s = raw.trimEnd();
    if (!s.trim()) {
      y -= 4;
      continue;
    }
    if (s.startsWith('# ')) para(strip(s.slice(2)), 17, { bold: true });
    else if (s.startsWith('## ')) {
      y -= 4;
      para(strip(s.slice(3)), 12.5, { bold: true });
    } else if (s.startsWith('### ')) para(strip(s.slice(4)), 10.5, { bold: true });
    else if (/^\|[\s:-|]+\|$/.test(s))
      continue; // Tabellen-Trennzeile
    else if (s.startsWith('|')) {
      const cells = s
        .slice(1, -1)
        .split('|')
        .map((c) => strip(c.trim()));
      para(cells.join('   ·   '), 9);
    } else if (s.startsWith('- ')) {
      const whole = /^\*\*.+\*\*$/.test(s.slice(2).trim());
      para(`•  ${strip(s.slice(2))}`, 9.5, { indent: 6, bold: whole });
    } else if (/^_.+_$/.test(s)) para(strip(s.slice(1, -1)), 8.5, { gray: 0.35 });
    else para(strip(s), 9.5);
  }
  newPage();
  return createPdf(pages, title);
}
