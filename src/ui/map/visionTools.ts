/**
 * Nebel- und Licht-Werkzeug: aufdecken/verdecken (Pinsel, Rechteck, Polygon), Lichtquellen
 * setzen oder an Tokens heften, Auswahl von Lichtmarken. Unabhängig von React/Pixi.
 */
import type { Cell, Point } from '../../core/grid';
import { lineCells, rectBetween, rectCells } from '../../core/shapes';
import { tokensAt } from '../../editor/tokens';
import {
  addLight,
  cellsInPolygon,
  LIGHT_PRESETS,
  lightFromPreset,
  lightPosition,
  revealCells,
} from '../../editor/vision';
import { translate, type MessageKey } from '../../i18n';
import type { MapDocument } from '../../storage/mapDocument';
import { useEditorStore } from '../state/editorStore';
import { useMapStore } from '../state/mapStore';
import { useSettings } from '../state/settingsStore';

/** Felder unter dem Pinsel (Größe 1, 3, 5 – zentriert). */
export function brushCells(c: Cell, size: number): Cell[] {
  const r = Math.floor(size / 2);
  const out: Cell[] = [];
  for (let y = c.y - r; y <= c.y + r; y++)
    for (let x = c.x - r; x <= c.x + r; x++) out.push({ x, y });
  return out;
}

const reveal = () => useEditorStore.getState().fogTool.mode === 'reveal';

let fogDrag: { last: Cell } | null = null;

export function fogPointerDown(cell: Cell, point: Point): void {
  const ed = useEditorStore.getState();
  const map = useMapStore.getState();
  const doc = map.doc;
  if (!doc) return;
  const tool = ed.fogTool;
  if (tool.shape === 'brush') {
    map.beginStroke('action.fog');
    map.strokeApply(revealCells(doc, brushCells(cell, tool.size), reveal()));
    fogDrag = { last: cell };
  } else if (tool.shape === 'rect') {
    ed.setShapeAnchor(cell);
    ed.setPreview(rectCells(rectBetween(cell, cell), true));
    fogDrag = { last: cell };
  } else {
    addPolygonPoint(point);
  }
}

export function fogPointerMove(cell: Cell): void {
  const ed = useEditorStore.getState();
  const map = useMapStore.getState();
  const doc = map.doc;
  if (!doc || !fogDrag) return;
  const tool = ed.fogTool;
  if (tool.shape === 'brush') {
    if (cell.x === fogDrag.last.x && cell.y === fogDrag.last.y) return;
    const cells = lineCells(fogDrag.last, cell).flatMap((c) => brushCells(c, tool.size));
    map.strokeApply(revealCells(doc, cells, reveal()));
    fogDrag.last = cell;
  } else if (tool.shape === 'rect' && ed.shapeAnchor) {
    ed.setPreview(rectCells(rectBetween(ed.shapeAnchor, cell), true));
  }
}

export function fogPointerUp(): void {
  const ed = useEditorStore.getState();
  const map = useMapStore.getState();
  const doc = map.doc;
  const tool = ed.fogTool;
  if (!fogDrag) return;
  fogDrag = null;
  if (tool.shape === 'brush') {
    map.endStroke();
  } else if (tool.shape === 'rect' && doc && ed.preview.length) {
    map.run(revealCells(doc, ed.preview, reveal()), 'action.fog');
    ed.setShapeAnchor(null);
    ed.setPreview([]);
  }
}

/** Tastatur (Eingabe am Fokusfeld): Pinsel sofort, Rechteck in zwei Schritten, Polygon-Ecke. */
export function fogActivate(cell: Cell): void {
  const ed = useEditorStore.getState();
  const map = useMapStore.getState();
  const doc = map.doc;
  if (!doc) return;
  const tool = ed.fogTool;
  if (tool.shape === 'brush') {
    map.run(revealCells(doc, brushCells(cell, tool.size), reveal()), 'action.fog');
  } else if (tool.shape === 'rect') {
    if (!ed.shapeAnchor) {
      ed.setShapeAnchor(cell);
      ed.setPreview(rectCells(rectBetween(cell, cell), true));
    } else {
      map.run(
        revealCells(doc, rectCells(rectBetween(ed.shapeAnchor, cell), true), reveal()),
        'action.fog',
      );
      ed.setShapeAnchor(null);
      ed.setPreview([]);
    }
  } else {
    addPolygonPoint({ x: cell.x, y: cell.y });
  }
}

export function fogCursorMoved(cell: Cell): void {
  const ed = useEditorStore.getState();
  if (ed.fogTool.shape === 'rect' && ed.shapeAnchor)
    ed.setPreview(rectCells(rectBetween(ed.shapeAnchor, cell), true));
}

/** Polygon-Ecke (auf Rasterkreuzungen); Klick auf die erste Ecke schließt das Polygon. */
export function addPolygonPoint(p: Point): void {
  const ed = useEditorStore.getState();
  const v = { x: Math.round(p.x), y: Math.round(p.y) };
  const pts = ed.fogPolygon;
  const first = pts[0];
  if (first && pts.length >= 3 && first.x === v.x && first.y === v.y) return closePolygon();
  const last = pts[pts.length - 1];
  if (last && last.x === v.x && last.y === v.y) return;
  ed.setFogPolygon([...pts, v]);
}

export function closePolygon(): void {
  const ed = useEditorStore.getState();
  const map = useMapStore.getState();
  const doc = map.doc;
  const pts = ed.fogPolygon;
  ed.setFogPolygon([]);
  if (!doc || pts.length < 3) return;
  map.run(
    revealCells(doc, cellsInPolygon(pts, doc.grid.cols, doc.grid.rows), reveal()),
    'action.fog',
  );
}

export function cancelFog(): boolean {
  const ed = useEditorStore.getState();
  const busy = ed.fogPolygon.length > 0 || fogDrag !== null;
  if (fogDrag && ed.fogTool.shape === 'brush') useMapStore.getState().endStroke();
  fogDrag = null;
  if (ed.fogPolygon.length) ed.setFogPolygon([]);
  return busy;
}

// ------------------------------------------------------------------ Licht

/** Lichtquelle setzen: auf einem Token wird sie angeheftet, sonst in der Feldmitte. */
export function placeLight(point: Point): void {
  const ed = useEditorStore.getState();
  const map = useMapStore.getState();
  const doc = map.doc;
  if (!doc) return;
  const preset = LIGHT_PRESETS.find((p) => p.id === ed.lightPreset) ?? LIGHT_PRESETS[1];
  if (!preset) return;
  const name = translate(useSettings.getState().locale, `light.preset.${preset.id}` as MessageKey);
  const token = tokensAt(doc, point)[0];
  const light = token
    ? lightFromPreset(preset, `${name} (${token.name})`, token.x, token.y, token.id)
    : lightFromPreset(preset, name, Math.floor(point.x) + 0.5, Math.floor(point.y) + 0.5);
  if (map.run(addLight(doc, light), 'action.light') === null) ed.setSelection([light.id]);
}

/** Lichtmarke unter dem Punkt (Auswahl-Werkzeug). */
export function lightAt(doc: MapDocument, p: Point): { id: string } | undefined {
  return [...doc.lights].reverse().find((l) => {
    const pos = lightPosition(doc, l);
    return Math.hypot(pos.x - p.x, pos.y - p.y) <= 0.3;
  });
}

export function lightsInRect(
  doc: MapDocument,
  r: { x: number; y: number; w: number; h: number },
): string[] {
  return doc.lights
    .filter((l) => {
      const p = lightPosition(doc, l);
      return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    })
    .map((l) => l.id);
}
