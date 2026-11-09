/**
 * Steuerung der Editor-Werkzeuge: übersetzt Zeiger- und Tastatureingaben in Operationen.
 * Unabhängig von Pixi/React, damit die Abläufe testbar sind.
 */
import { type Cell, type Point } from '../../core/grid';
import { lineCells, rectBetween, rectCells } from '../../core/shapes';
import type { DoorState, WallKind } from '../../core/walls';
import { resolveElement } from '../../data/elements';
import { footprintSize } from '../../editor/footprint';
import {
  addWalls,
  deleteItems,
  moveItems,
  updateWalls,
  wallsInRect,
  wallsNear,
} from '../../editor/wallOps';
import {
  alignObjects,
  eraseCells,
  fillArea,
  flipObjects,
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
  'wall',
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
    case 'wall':
      addWallPoint(snapPoint(point), notify);
      return;
    case 'select': {
      const hit = itemAt(point);
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
      const r = moveItems(doc, ed.selection, dx, dy);
      // Am Kartenrand bleiben Objekte/Wände stehen (die Operationen begrenzen selbst).
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
      const found = [
        ...objectsInRect(doc, m).map((o) => o.id),
        ...wallsInRect(doc, m).map((w) => w.id),
      ];
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
  if (tool === 'wall') {
    // Tastatur: Eckpunkt = linke obere Ecke des Fokusfeldes.
    addWallPoint({ x: cell.x, y: cell.y }, notify);
    return;
  }
  if (tool === 'select') {
    const hit = itemAt({ x: cell.x + 0.5, y: cell.y + 0.5 });
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
  return withSelection((ids) => moveItems(doc, ids, dx, dy), 'action.move', notify);
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
  if (doc && withSelection((ids) => deleteItems(doc, ids), 'action.delete', notify)) {
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
  const all = { x: -100, y: -100, w: 10_000, h: 10_000 };
  const ids = objectsInRect(doc, all)
    .filter((o) => OBJECT_LAYERS.includes(o.layer))
    .map((o) => o.id);
  useEditorStore.getState().setSelection([...ids, ...wallsInRect(doc, all).map((w) => w.id)]);
}

// ------------------------------------------------------------------ Kantenwände

/** Trefferabstand für Wände in Feldern. */
const WALL_HIT = 0.2;

/** Objekt oder Kantenwand unter einem Punkt (Objekte haben Vorrang). */
function itemAt(p: Point): { id: string } | undefined {
  const doc = useMapStore.getState().doc;
  if (!doc) return undefined;
  return objectsAt(doc, p.x, p.y)[0] ?? wallsNear(doc, p, WALL_HIT)[0];
}

/** Rastet auf Rasterkreuzungen ein (oder, ohne Snap, auf 1/16 Feld). */
export function snapPoint(p: Point): Point {
  const doc = useMapStore.getState().doc;
  const snap = useEditorStore.getState().snap;
  const r = (v: number) => (snap ? Math.round(v) : Math.round(v * 16) / 16);
  const cols = doc?.grid.cols ?? Infinity;
  const rows = doc?.grid.rows ?? Infinity;
  return { x: Math.min(cols, Math.max(0, r(p.x))), y: Math.min(rows, Math.max(0, r(p.y))) };
}

/**
 * Wandkette: erster Klick setzt den Start, jeder weitere ein Segment (ein Undo-Schritt je
 * Segment). Ein Klick auf den letzten Punkt beendet die Kette.
 */
export function addWallPoint(p: Point, notify: Notify) {
  const ed = useEditorStore.getState();
  const map = useMapStore.getState();
  const doc = map.doc;
  if (!doc) return;
  const last = ed.wallChain[ed.wallChain.length - 1];
  if (!last) return ed.setWallChain([p]);
  if (last.x === p.x && last.y === p.y) return endWallChain();
  const reason = map.run(
    addWalls(doc, [{ x1: last.x, y1: last.y, x2: p.x, y2: p.y, kind: ed.wallKind }]),
    'action.wall',
  );
  report(reason, notify);
  if (reason !== 'locked') ed.setWallChain([...ed.wallChain, p]);
}

export function endWallChain() {
  useEditorStore.getState().setWallChain([]);
}

/** Ausgewählte Wände: Art bzw. Türzustand ändern. */
export function updateSelectedWalls(
  changes: { kind?: WallKind; state?: DoorState },
  notify: Notify,
) {
  const doc = useMapStore.getState().doc;
  if (doc) withSelection((ids) => updateWalls(doc, ids, changes), 'action.wallEdit', notify);
}

/** Taste D: ausgewählte Türen öffnen bzw. schließen (verschlossene werden geöffnet). */
export function toggleSelectedDoors(notify: Notify) {
  const doc = useMapStore.getState().doc;
  const sel = useEditorStore.getState().selection;
  if (!doc) return;
  const doors = doc.walls.filter(
    (w) => sel.has(w.id) && (w.kind === 'door' || w.kind === 'secret'),
  );
  if (!doors.length) return;
  const anyClosed = doors.some((w) => w.state !== 'open');
  const ids = new Set(doors.map((w) => w.id));
  report(
    useMapStore
      .getState()
      .run(updateWalls(doc, ids, { state: anyClosed ? 'open' : 'closed' }), 'action.wallEdit'),
    notify,
  );
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
  ed.setWallChain([]);
}

export function setTool(tool: Tool) {
  cancelEditing();
  useViewStore.getState().setTool(tool);
}
