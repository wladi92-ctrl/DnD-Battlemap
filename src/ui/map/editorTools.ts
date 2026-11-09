/**
 * Steuerung der Editor-Werkzeuge: übersetzt Zeiger- und Tastatureingaben in Operationen.
 * Unabhängig von Pixi/React, damit die Abläufe testbar sind.
 */
import { type Cell } from '../../core/grid';
import { lineCells, rectBetween, rectCells } from '../../core/shapes';
import { resolveElement } from '../../data/elements';
import { footprintSize } from '../../editor/footprint';
import {
  alignObjects,
  deleteObjects,
  eraseCells,
  fillArea,
  flipObjects,
  moveObjects,
  objectsAt,
  objectsInRect,
  paintCells,
  pasteObjects,
  rotateObjects,
  type AlignMode,
  type OpResult,
  type PaintSource,
} from '../../editor/ops';
import type { MessageKey } from '../../i18n';
import { OBJECT_LAYERS } from '../../storage/mapDocument';
import { useEditorStore } from '../state/editorStore';
import { useMapStore } from '../state/mapStore';
import { useViewStore, type Tool } from '../state/viewStore';

export type Notify = (key: MessageKey) => void;

export const EDIT_TOOLS: readonly Tool[] = [
  'select',
  'brush',
  'rect',
  'line',
  'fill',
  'erase',
  'note',
];

const REASON_KEYS: Record<string, MessageKey | null> = {
  locked: 'notice.layerLocked',
  fillObjects: 'notice.fillObjects',
  outside: 'notice.outside',
  nothing: null,
};

function report(reason: string | null, notify: Notify) {
  const key = reason ? REASON_KEYS[reason] : null;
  if (key) notify(key);
}

/** Aktuelle Malquelle (Element oder Gelände) oder null, wenn nichts gewählt ist. */
export function currentSource(): PaintSource | null {
  const ed = useEditorStore.getState();
  if (ed.paintMode === 'terrain') return { kind: 'terrain', props: ed.terrainBrush };
  const doc = useMapStore.getState().doc;
  if (!doc || !ed.elementId) return null;
  const element = resolveElement(ed.elementId, doc.customElements);
  return element ? { kind: 'element', element } : null;
}

function eraseTarget() {
  const ed = useEditorStore.getState();
  return ed.paintMode === 'terrain' ? 'terrain' : ed.activeLayer;
}

function shapeCells(tool: Tool, a: Cell, b: Cell): Cell[] {
  return tool === 'line'
    ? lineCells(a, b)
    : rectCells(rectBetween(a, b), useEditorStore.getState().rectFilled);
}

function snapValue(v: number): number {
  return useEditorStore.getState().snap ? Math.round(v) : Math.round(v * 16) / 16;
}

// ------------------------------------------------------------------ Zeiger

interface DragState {
  kind: 'paint' | 'erase' | 'shape' | 'move' | 'marquee';
  lastCell: Cell;
  start: { x: number; y: number };
  /** Bereits angewendete Verschiebung beim Bewegen. */
  applied: { x: number; y: number };
  additive: boolean;
}

let drag: DragState | null = null;

export function isDragging(): boolean {
  return drag !== null;
}

/**
 * @param cell Feld unter dem Zeiger (auf die Karte begrenzt)
 * @param point Position in Feldern (gebrochen), für Auswahl und Verschieben
 */
export function pointerDown(
  tool: Tool,
  cell: Cell,
  point: { x: number; y: number },
  shift: boolean,
  notify: Notify,
) {
  const map = useMapStore.getState();
  const ed = useEditorStore.getState();
  const doc = map.doc;
  if (!doc) return;
  const base = { lastCell: cell, start: point, applied: { x: 0, y: 0 }, additive: shift };

  switch (tool) {
    case 'brush':
    case 'erase': {
      const source = tool === 'brush' ? currentSource() : null;
      if (tool === 'brush' && !source) return notify('notice.chooseElement');
      map.beginStroke(tool === 'brush' ? 'action.paint' : 'action.erase');
      const r = source
        ? paintCells(doc, [cell], source, { rotation: ed.rotation })
        : eraseCells(doc, [cell], eraseTarget());
      report(map.strokeApply(r), notify);
      drag = { kind: tool === 'brush' ? 'paint' : 'erase', ...base };
      return;
    }
    case 'rect':
    case 'line':
      if (!currentSource()) return notify('notice.chooseElement');
      ed.setShapeAnchor(cell);
      ed.setPreview(shapeCells(tool, cell, cell));
      drag = { kind: 'shape', ...base };
      return;
    case 'fill': {
      const source = currentSource();
      if (!source) return notify('notice.chooseElement');
      report(map.run(fillArea(doc, cell, source), 'action.fill'), notify);
      return;
    }
    case 'note':
      ed.setNoteCell(cell);
      return;
    case 'select': {
      const hit = objectsAt(doc, point.x, point.y)[0];
      if (hit) {
        const sel = new Set(ed.selection);
        if (shift) {
          if (sel.has(hit.id)) sel.delete(hit.id);
          else sel.add(hit.id);
          ed.setSelection(sel);
          return;
        }
        if (!sel.has(hit.id)) ed.setSelection([hit.id]);
        map.beginStroke('action.move');
        drag = { kind: 'move', ...base };
      } else {
        if (!shift) ed.setSelection([]);
        ed.setMarquee({ x: point.x, y: point.y, w: 0, h: 0 });
        drag = { kind: 'marquee', ...base };
      }
      return;
    }
    default:
      return;
  }
}

export function pointerMove(
  tool: Tool,
  cell: Cell,
  point: { x: number; y: number },
  notify: Notify,
) {
  const d = drag;
  const map = useMapStore.getState();
  const ed = useEditorStore.getState();
  const doc = map.doc;
  if (!d || !doc) return;
  switch (d.kind) {
    case 'paint':
    case 'erase': {
      if (cell.x === d.lastCell.x && cell.y === d.lastCell.y) return;
      // Linie vom letzten Feld schließt Lücken bei schnellen Bewegungen.
      const cells = lineCells(d.lastCell, cell).slice(1);
      const source = d.kind === 'paint' ? currentSource() : null;
      const r = source
        ? paintCells(doc, cells, source, { rotation: ed.rotation })
        : eraseCells(doc, cells, eraseTarget());
      report(map.strokeApply(r), notify);
      d.lastCell = cell;
      return;
    }
    case 'shape':
      if (ed.shapeAnchor) ed.setPreview(shapeCells(tool, ed.shapeAnchor, cell));
      d.lastCell = cell;
      return;
    case 'move': {
      const dx = snapValue(point.x - d.start.x) - d.applied.x;
      const dy = snapValue(point.y - d.start.y) - d.applied.y;
      if (dx === 0 && dy === 0) return;
      const r = moveObjects(doc, ed.selection, dx, dy);
      // Am Kartenrand bleiben Objekte stehen (moveObjects begrenzt je Objekt).
      if (map.strokeApply(r) === null) d.applied = { x: d.applied.x + dx, y: d.applied.y + dy };
      return;
    }
    case 'marquee':
      ed.setMarquee({
        x: Math.min(d.start.x, point.x),
        y: Math.min(d.start.y, point.y),
        w: Math.abs(point.x - d.start.x),
        h: Math.abs(point.y - d.start.y),
      });
      return;
  }
}

export function pointerUp(tool: Tool, notify: Notify) {
  const d = drag;
  drag = null;
  const map = useMapStore.getState();
  const ed = useEditorStore.getState();
  const doc = map.doc;
  if (!d || !doc) return;
  switch (d.kind) {
    case 'paint':
    case 'erase':
    case 'move':
      map.endStroke();
      return;
    case 'shape': {
      const source = currentSource();
      if (source && ed.preview.length) {
        report(
          map.run(
            paintCells(doc, ed.preview, source, { rotation: ed.rotation }),
            tool === 'line' ? 'action.line' : 'action.rect',
          ),
          notify,
        );
      }
      ed.setShapeAnchor(null);
      ed.setPreview([]);
      return;
    }
    case 'marquee': {
      const m = ed.marquee;
      ed.setMarquee(null);
      if (!m) return;
      const found = objectsInRect(doc, m).map((o) => o.id);
      ed.setSelection(d.additive ? [...ed.selection, ...found] : found);
      return;
    }
  }
}

// ------------------------------------------------------------------ Tastatur (Fokusfeld)

/** Eingabetaste im Kartenfeld: Werkzeug am Fokusfeld anwenden (Tastaturbedienung). */
export function activateAt(tool: Tool, cell: Cell, shift: boolean, notify: Notify) {
  const ed = useEditorStore.getState();
  const map = useMapStore.getState();
  const doc = map.doc;
  if (!doc) return;
  if (tool === 'rect' || tool === 'line') {
    const source = currentSource();
    if (!source) return notify('notice.chooseElement');
    if (!ed.shapeAnchor) {
      ed.setShapeAnchor(cell);
      ed.setPreview(shapeCells(tool, cell, cell));
      return;
    }
    const cells = shapeCells(tool, ed.shapeAnchor, cell);
    ed.setShapeAnchor(null);
    ed.setPreview([]);
    report(
      map.run(
        paintCells(doc, cells, source, { rotation: ed.rotation }),
        tool === 'line' ? 'action.line' : 'action.rect',
      ),
      notify,
    );
    return;
  }
  if (tool === 'brush' || tool === 'erase') {
    const source = tool === 'brush' ? currentSource() : null;
    if (tool === 'brush' && !source) return notify('notice.chooseElement');
    const r = source
      ? paintCells(doc, [cell], source, { rotation: ed.rotation })
      : eraseCells(doc, [cell], eraseTarget());
    report(map.run(r, tool === 'brush' ? 'action.paint' : 'action.erase'), notify);
    return;
  }
  if (tool === 'fill' || tool === 'note') {
    pointerDown(tool, cell, { x: cell.x + 0.5, y: cell.y + 0.5 }, false, notify);
    return;
  }
  if (tool === 'select') {
    const hit = objectsAt(doc, cell.x + 0.5, cell.y + 0.5)[0];
    if (!hit) return ed.setSelection(shift ? ed.selection : []);
    const sel = new Set(shift ? ed.selection : []);
    if (ed.selection.has(hit.id) && shift) sel.delete(hit.id);
    else sel.add(hit.id);
    ed.setSelection(sel);
  }
}

/** Nimmt die Formvorschau bei bewegtem Fokusfeld mit. */
export function cursorMoved(tool: Tool, cell: Cell) {
  const ed = useEditorStore.getState();
  if ((tool === 'rect' || tool === 'line') && ed.shapeAnchor)
    ed.setPreview(shapeCells(tool, ed.shapeAnchor, cell));
}

// ------------------------------------------------------------------ Auswahlbefehle

function withSelection(fn: (ids: ReadonlySet<string>) => OpResult, label: string, notify: Notify) {
  const ids = useEditorStore.getState().selection;
  if (!ids.size) return false;
  report(useMapStore.getState().run(fn(ids), label), notify);
  return true;
}

export function moveSelection(dx: number, dy: number, notify: Notify): boolean {
  const doc = useMapStore.getState().doc;
  if (!doc) return false;
  return withSelection((ids) => moveObjects(doc, ids, dx, dy), 'action.move', notify);
}

/** Dreht die Auswahl – oder, ohne Auswahl, die Ausrichtung neu platzierter Objekte. */
export function rotateSelectionOrPlacement(steps: number, notify: Notify) {
  const doc = useMapStore.getState().doc;
  const snap = useEditorStore.getState().snap;
  if (doc && withSelection((ids) => rotateObjects(doc, ids, steps, snap), 'action.rotate', notify))
    return;
  useEditorStore.getState().rotatePlacement(steps);
}

export function flipSelection(axis: 'x' | 'y', notify: Notify) {
  const doc = useMapStore.getState().doc;
  if (doc) withSelection((ids) => flipObjects(doc, ids, axis), 'action.flip', notify);
}

export function deleteSelection(notify: Notify) {
  const doc = useMapStore.getState().doc;
  if (doc && withSelection((ids) => deleteObjects(doc, ids), 'action.delete', notify)) {
    useEditorStore.getState().setSelection([]);
  }
}

export function alignSelection(mode: AlignMode, notify: Notify) {
  const doc = useMapStore.getState().doc;
  if (doc) withSelection((ids) => alignObjects(doc, ids, mode), 'action.align', notify);
}

export function copySelection(): number {
  const { doc } = useMapStore.getState();
  const ed = useEditorStore.getState();
  if (!doc) return 0;
  const objs = doc.objects.filter((o) => ed.selection.has(o.id));
  if (objs.length) ed.setClipboard(objs);
  return objs.length;
}

/** Fügt die Zwischenablage am Zielfeld ein (linke obere Ecke der Gruppe). */
export function paste(target: Cell | null, notify: Notify) {
  const map = useMapStore.getState();
  const ed = useEditorStore.getState();
  const doc = map.doc;
  if (!doc || !ed.clipboard.length) return;
  const minX = Math.min(...ed.clipboard.map((o) => o.x));
  const minY = Math.min(...ed.clipboard.map((o) => o.y));
  const dest = target ?? { x: minX + 1, y: minY + 1 };
  const { result, ids } = pasteObjects(doc, ed.clipboard, dest.x - minX, dest.y - minY);
  const reason = map.run(result, 'action.paste');
  report(reason, notify);
  if (!reason) ed.setSelection(ids);
}

export function duplicateSelection(notify: Notify) {
  if (!copySelection()) return;
  const clip = useEditorStore.getState().clipboard;
  const minX = Math.min(...clip.map((o) => o.x));
  const minY = Math.min(...clip.map((o) => o.y));
  paste({ x: minX + 1, y: minY + 1 }, notify);
}

export function selectAll() {
  const doc = useMapStore.getState().doc;
  if (!doc) return;
  const ids = objectsInRect(doc, { x: -100, y: -100, w: 10_000, h: 10_000 })
    .filter((o) => OBJECT_LAYERS.includes(o.layer))
    .map((o) => o.id);
  useEditorStore.getState().setSelection(ids);
}

/** Platzbedarf des gewählten Elements (für die Pinselvorschau), gedreht. */
export function placementSize(): { w: number; h: number } | null {
  const source = currentSource();
  if (!source || source.kind !== 'element' || source.element.layer === 'floor') return null;
  return footprintSize({ ...source.element, rotation: useEditorStore.getState().rotation });
}

export function cancelEditing() {
  const ed = useEditorStore.getState();
  if (drag?.kind === 'paint' || drag?.kind === 'erase' || drag?.kind === 'move')
    useMapStore.getState().endStroke();
  drag = null;
  ed.setShapeAnchor(null);
  ed.setPreview([]);
  ed.setMarquee(null);
}

export function setTool(tool: Tool) {
  cancelEditing();
  useViewStore.getState().setTool(tool);
}
