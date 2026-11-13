/**
 * Karte als PNG oder PDF exportieren.
 * - GM-Version: alles außer Bedien-Overlays (Notizen, verborgene Tokens/Effekte sichtbar).
 * - Spieler-Version: wie die Spieleransicht (verborgenes entfernt, Nebel/Sicht angewendet).
 * - PDF: ganze Karte auf einer Seite oder maßstabsgetreu 1 Feld = 1 Zoll, mehrseitig mit
 *   Kachelbezeichnung (A1, B1 …) und Schnittmarken zum Zusammenkleben.
 */
import { createPdf, MM, PAPER, type Paper, type PdfPage } from '../../core/pdf';
import { fitLayout, tiledLayout, tileName } from '../../core/printLayout';
import { computeVision, playerDocument, restrictsPlayers } from '../../editor/vision';
import type { MessageKey } from '../../i18n';
import { getFileAccess } from '../../storage/fileAccess';
import { MASK_VISIBLE } from '../../core/vision';
import type { MapDocument } from '../../storage/mapDocument';
import { effectLabel } from '../creatures/effectLabels';
import { effectVisuals } from '../map/effectTools';
import { getActiveRenderer, refreshRenderer } from '../map/rendererRegistry';
import { useMapStore } from '../state/mapStore';

export type ExportFormat = 'png' | 'pdf';
export type PdfMode = 'fit' | 'scale';

export interface ExportOptions {
  format: ExportFormat;
  /** Raster mitzeichnen. */
  grid: boolean;
  audience: 'gm' | 'player';
  /** PNG: Pixel pro Feld. */
  pxPerCell: number;
  pdfMode: PdfMode;
  paper: Paper;
}

export const DEFAULT_EXPORT: ExportOptions = {
  format: 'png',
  grid: true,
  audience: 'gm',
  pxPerCell: 100,
  pdfMode: 'scale',
  paper: 'a4',
};

/** Auflösung beim Druck (Pixel pro Zoll). */
export const PRINT_DPI = 150;
/** Größte Kantenlänge eines PNG-Exports (Browser-Grenze für Canvas). */
export const PNG_MAX_SIDE = 16000;
const MARGIN = 10 * MM;

type T = (key: MessageKey, params?: Record<string, string | number>) => string;

/** Größte zulässige Auflösung für die Karte (PNG). */
export function maxPxPerCell(cols: number, rows: number): number {
  return Math.max(8, Math.floor(PNG_MAX_SIDE / Math.max(cols, rows)));
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'karte';
}

/** Setzt den Renderer auf die gewünschte Fassung; liefert das exportierte Dokument. */
function prepare(doc: MapDocument, audience: ExportOptions['audience'], t: T): MapDocument {
  const r = getActiveRenderer();
  if (!r) throw new Error('Keine Kartenansicht');
  const { assets } = useMapStore.getState();
  let shown = doc;
  let mask: Uint8Array | null = null;
  if (audience === 'player') {
    if (restrictsPlayers(doc)) {
      mask = computeVision(doc).mask;
      shown = playerDocument(doc, mask);
    } else {
      shown = playerDocument(doc, new Uint8Array(doc.grid.cols * doc.grid.rows).fill(MASK_VISIBLE));
    }
  }
  r.setDocument(shown, assets);
  r.setFog(mask, 'player');
  r.setLights([], doc.grid.feetPerCell);
  r.setEffects(effectVisuals(shown, new Set(), (e) => effectLabel(t, e), false));
  return shown;
}

/**
 * Führt den Export aus und speichert die Datei. Liefert den Dateinamen/Pfad oder null bei
 * Abbruch im Speichern-Dialog.
 */
export async function exportMap(opts: ExportOptions, t: T): Promise<string | null> {
  const doc = useMapStore.getState().doc;
  const r = getActiveRenderer();
  if (!doc || !r) return null;
  const { cols, rows } = doc.grid;
  const base = safeName(doc.name);
  try {
    prepare(doc, opts.audience, t);
    await r.tokensReady();
    if (opts.format === 'png') {
      const px = Math.min(Math.max(8, Math.round(opts.pxPerCell)), maxPxPerCell(cols, rows));
      const img = await r.exportImage(
        { x: 0, y: 0, w: cols, h: rows },
        px,
        { grid: opts.grid },
        'image/png',
      );
      refreshRenderer();
      return getFileAccess().exportBytes(
        img.bytes,
        `${base}.png`,
        t('export.filterPng'),
        'png',
        'image/png',
      );
    }

    const paper = PAPER[opts.paper];
    const layout =
      opts.pdfMode === 'scale'
        ? tiledLayout(cols, rows, paper, MARGIN)
        : fitLayout(cols, rows, paper, MARGIN);
    // Pixel pro Feld so, dass der Druck PRINT_DPI erreicht.
    const px = Math.max(16, Math.round((layout.cellPt / 72) * PRINT_DPI));
    const pages: PdfPage[] = [];
    const total = layout.pages.length;
    for (const [i, p] of layout.pages.entries()) {
      const img = await r.exportImage(p.cells, px, { grid: opts.grid }, 'image/jpeg', 0.9);
      const { x, y, width, height } = p.placement;
      const label =
        opts.pdfMode === 'scale'
          ? t('export.pageLabelScale', {
              name: doc.name,
              tile: tileName(p.col, p.row),
              page: i + 1,
              total,
            })
          : t('export.pageLabelFit', { name: doc.name, cols, rows });
      const marks =
        opts.pdfMode === 'scale'
          ? [
              // Schnittmarken an den Ecken des Bildes
              ...[
                [x, y],
                [x + width, y],
                [x, y + height],
                [x + width, y + height],
              ].flatMap(([cx = 0, cy = 0]) => [
                { x1: cx - 12, y1: cy, x2: cx + 12, y2: cy, width: 0.4, gray: 0.4 },
                { x1: cx, y1: cy - 12, x2: cx, y2: cy + 12, width: 0.4, gray: 0.4 },
              ]),
            ]
          : [];
      pages.push({
        width: layout.pageWidth,
        height: layout.pageHeight,
        images: [
          {
            jpeg: img.bytes,
            pxWidth: img.width,
            pxHeight: img.height,
            x,
            y,
            width,
            height,
          },
        ],
        texts: [{ x: MARGIN, y: MARGIN / 2, size: 8, text: label, gray: 0.35 }],
        lines: marks,
      });
    }
    refreshRenderer();
    const pdf = createPdf(pages, doc.name);
    return getFileAccess().exportBytes(
      pdf,
      `${base}.pdf`,
      t('export.filterPdf'),
      'pdf',
      'application/pdf',
    );
  } finally {
    refreshRenderer();
  }
}
