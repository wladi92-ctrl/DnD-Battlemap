/**
 * Zeichenwerkzeug und Ping (temporäres Overlay). Maus: ziehen; Tastatur: Eingabe am Fokusfeld
 * beginnt, Pfeiltasten führen (Freihand folgt dem Fokusfeld), Eingabe beendet, Esc bricht ab.
 */
import { CELL_PX, type Cell, type Point } from '../../core/grid';
import { useOverlayStore } from '../state/overlayStore';
import { useViewStore } from '../state/viewStore';

const center = (c: Cell): Point => ({ x: c.x + 0.5, y: c.y + 0.5 });

export function drawPointerDown(p: Point): void {
  useOverlayStore.getState().begin(p);
}

export function drawPointerMove(p: Point): void {
  useOverlayStore.getState().extend(p);
}

export function drawPointerUp(): void {
  useOverlayStore.getState().commit();
}

/** Eingabetaste: erster Druck beginnt, zweiter beendet. */
export function drawActivate(cell: Cell): void {
  const o = useOverlayStore.getState();
  if (!o.draft) o.begin(center(cell));
  else {
    o.extend(center(cell));
    o.commit();
  }
}

export function drawCursorMoved(cell: Cell): void {
  useOverlayStore.getState().extend(center(cell));
}

export function cancelDraw(): boolean {
  const o = useOverlayStore.getState();
  if (!o.draft) return false;
  o.cancelDraft();
  return true;
}

/** Ping am Mauszeiger (Feld unter der Maus), sonst am Fokusfeld, sonst in der Bildmitte. */
export function pingAtPointer(): void {
  const view = useViewStore.getState();
  const cell = view.hoverCell ?? view.cursorCell;
  if (cell) return useOverlayStore.getState().ping(center(cell));
  const { camera, viewport } = view;
  const size = CELL_PX * camera.zoom;
  useOverlayStore.getState().ping({
    x: (viewport.width / 2 - camera.x) / size,
    y: (viewport.height / 2 - camera.y) / size,
  });
}

export function clearDrawings(): void {
  useOverlayStore.getState().clear();
}
