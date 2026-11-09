/**
 * Kartenansicht: verbindet den Pixi-Renderer mit Maus/Tastatur und den Stores.
 * Kamera-/Overlay-/Dokument-Updates laufen über Store-Abos direkt in den Renderer
 * (ohne React-Render), damit Malen und Verschieben flüssig bleiben.
 */
import { useEffect, useRef, useState } from 'react';
import { ensureVisible, screenToWorld, worldToScreen } from '../../core/camera';
import { measurePath } from '../../core/distance';
import {
  CELL_PX,
  cellCenter,
  clampCell,
  inBounds,
  worldSize,
  worldToCell,
  type Cell,
  type Point,
} from '../../core/grid';
import { formatDistance } from '../../core/units';
import { footprintRect } from '../../editor/footprint';
import type { MessageKey } from '../../i18n';
import { MapRenderer, type OverlayState } from '../../render/MapRenderer';
import { useEditorStore } from '../state/editorStore';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useSettings } from '../state/settingsStore';
import { rulerPath, useViewStore } from '../state/viewStore';
import { useT } from '../useT';
import {
  activateAt,
  cancelEditing,
  cursorMoved,
  EDIT_TOOLS,
  isDragging,
  moveSelection,
  placementSize,
  pointerDown,
  pointerMove,
  pointerUp,
  type Notify,
} from './editorTools';

const KEY_PAN_PX = 64;
const WHEEL_ZOOM_SPEED = 0.0015;

type Drag = { kind: 'pan'; last: Point } | { kind: 'ruler' } | { kind: 'edit' };

/** Overlay aus Ansicht, Editor und Dokument zusammensetzen. */
function buildOverlay(): OverlayState {
  const view = useViewStore.getState();
  const ed = useEditorStore.getState();
  const doc = useMapStore.getState().doc;
  const tool = view.tool;
  const selection = doc ? doc.objects.filter((o) => ed.selection.has(o.id)).map(footprintRect) : [];
  let placement: OverlayState['placement'] = null;
  const at = view.hoverCell ?? view.cursorCell;
  if (
    at &&
    (tool === 'brush' || tool === 'rect' || tool === 'line') &&
    ed.paintMode === 'element'
  ) {
    const size = placementSize();
    if (size) placement = { x: at.x, y: at.y, ...size };
  }
  return {
    hover: tool === 'pan' ? null : view.hoverCell,
    cursor: view.cursorCell,
    ruler: rulerPath(view.ruler),
    preview: ed.preview,
    placement,
    selection,
    marquee: ed.marquee,
  };
}

const HINTS: Partial<Record<string, MessageKey[]>> = {
  ruler: ['ruler.hintMouse', 'ruler.hintKeyboard'],
  select: ['hint.select'],
  brush: ['hint.brush'],
  rect: ['hint.shape'],
  line: ['hint.shape'],
  fill: ['hint.fill'],
  erase: ['hint.erase'],
  note: ['hint.note'],
};

export function MapCanvas() {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const spaceRef = useRef(false);
  const [ready, setReady] = useState(false);

  const doc = useMapStore((s) => s.doc);
  const tool = useViewStore((s) => s.tool);
  const docId = doc?.id;
  const cols = doc?.grid.cols ?? 0;
  const rows = doc?.grid.rows ?? 0;

  const notify: Notify = (key) => useNoticeStore.getState().push('info', t(key));

  // Renderer anlegen/abbauen (StrictMode-sicher).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    void MapRenderer.create(host).then((r) => {
      if (cancelled) return r.destroy();
      rendererRef.current = r;
      setReady(true);
    });
    return () => {
      cancelled = true;
      rendererRef.current?.destroy();
      rendererRef.current = null;
      setReady(false);
    };
  }, []);

  // Größe beobachten.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const apply = () => {
      const size = { width: host.clientWidth, height: host.clientHeight };
      useViewStore.getState().setViewport(size);
      rendererRef.current?.resize(size.width, size.height);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(host);
    return () => ro.disconnect();
  }, [ready]);

  // Neue Karte geöffnet → Ansicht und Editorzustand zurücksetzen, einpassen.
  useEffect(() => {
    if (!ready || !docId) return;
    const view = useViewStore.getState();
    view.rulerClear();
    view.setCursorCell(null);
    view.setHoverCell(null);
    useEditorStore.getState().setSelection([]);
    cancelEditing();
    view.fit(worldSize({ cols, rows }));
    // Nur beim Wechsel des Dokuments, nicht bei Größenänderung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, docId]);

  // Stores → Renderer (direkte Abos, kein React-Render).
  useEffect(() => {
    if (!ready) return;
    const r = rendererRef.current;
    if (!r) return;
    const pushDoc = () => {
      const { doc: d, assets } = useMapStore.getState();
      if (d) r.setDocument(d, assets);
    };
    const pushOverlay = () => r.setOverlay(buildOverlay());
    pushDoc();
    r.setShowTerrain(useEditorStore.getState().showTerrain);
    r.setCamera(useViewStore.getState().camera);
    pushOverlay();
    const offMap = useMapStore.subscribe((s, prev) => {
      if (s.doc !== prev.doc || s.assets !== prev.assets) {
        pushDoc();
        pushOverlay();
      }
    });
    const offView = useViewStore.subscribe((s, prev) => {
      if (s.camera !== prev.camera) r.setCamera(s.camera);
      if (
        s.hoverCell !== prev.hoverCell ||
        s.cursorCell !== prev.cursorCell ||
        s.ruler !== prev.ruler ||
        s.tool !== prev.tool
      ) {
        pushOverlay();
      }
    });
    const offEditor = useEditorStore.subscribe((s, prev) => {
      if (s.showTerrain !== prev.showTerrain) r.setShowTerrain(s.showTerrain);
      if (
        s.preview !== prev.preview ||
        s.selection !== prev.selection ||
        s.marquee !== prev.marquee ||
        s.elementId !== prev.elementId ||
        s.rotation !== prev.rotation ||
        s.paintMode !== prev.paintMode
      ) {
        pushOverlay();
      }
    });
    return () => {
      offMap();
      offView();
      offEditor();
    };
  }, [ready]);

  // Mausrad-Zoom (nicht-passiver Listener, damit die Seite nicht scrollt).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (e: WheelEvent) => {
      const d = useMapStore.getState().doc;
      if (!d) return;
      e.preventDefault();
      const rect = host.getBoundingClientRect();
      useViewStore
        .getState()
        .zoomAt(
          { x: e.clientX - rect.left, y: e.clientY - rect.top },
          Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED),
          worldSize(d.grid),
        );
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, []);

  if (!doc) return null;
  const world = worldSize(doc.grid);

  const localPoint = (e: React.PointerEvent): Point => {
    // Der Handler hängt am Host selbst; currentTarget ist also immer gesetzt.
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  /** Position in Feldern (gebrochen). */
  const cellPoint = (p: Point) => {
    const w = screenToWorld(useViewStore.getState().camera, p);
    return { x: w.x / CELL_PX, y: w.y / CELL_PX };
  };
  const cellAt = (p: Point): Cell => worldToCell(screenToWorld(useViewStore.getState().camera, p));

  const onPointerDown = (e: React.PointerEvent) => {
    hostRef.current?.focus();
    const p = localPoint(e);
    const view = useViewStore.getState();
    const panGesture =
      e.button === 1 || e.button === 2 || (e.button === 0 && (tool === 'pan' || spaceRef.current));
    if (panGesture) {
      dragRef.current = { kind: 'pan', last: p };
    } else if (e.button === 0 && tool === 'ruler') {
      view.rulerBegin(clampCell(cellAt(p), doc.grid));
      dragRef.current = { kind: 'ruler' };
    } else if (e.button === 0 && EDIT_TOOLS.includes(tool)) {
      pointerDown(tool, clampCell(cellAt(p), doc.grid), cellPoint(p), e.shiftKey, notify);
      dragRef.current = { kind: 'edit' };
    } else {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = localPoint(e);
    const view = useViewStore.getState();
    const cell = cellAt(p);
    view.setHoverCell(inBounds(cell, doc.grid) ? cell : null);
    const drag = dragRef.current;
    if (drag?.kind === 'pan') {
      view.panBy(p.x - drag.last.x, p.y - drag.last.y, world);
      dragRef.current = { kind: 'pan', last: p };
    } else if (drag?.kind === 'ruler') {
      view.rulerMove(clampCell(cell, doc.grid));
    } else if (drag?.kind === 'edit') {
      pointerMove(tool, clampCell(cell, doc.grid), cellPoint(p), notify);
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag?.kind === 'ruler') useViewStore.getState().rulerEnd();
    if (drag?.kind === 'edit') pointerUp(tool, notify);
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const view = useViewStore.getState();
    const ed = useEditorStore.getState();
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const dir = arrows[e.key];
    if (dir) {
      e.preventDefault();
      if (e.shiftKey) {
        view.panBy(-dir[0] * KEY_PAN_PX, -dir[1] * KEY_PAN_PX, world);
        return;
      }
      // Mit Auswahl verschieben die Pfeiltasten die Objekte (wie Schachfiguren).
      if (tool === 'select' && ed.selection.size && moveSelection(dir[0], dir[1], notify)) return;
      const start =
        view.cursorCell ??
        view.hoverCell ??
        clampCell(
          worldToCell(
            screenToWorld(view.camera, { x: view.viewport.width / 2, y: view.viewport.height / 2 }),
          ),
          doc.grid,
        );
      const next = view.cursorCell
        ? clampCell({ x: start.x + dir[0], y: start.y + dir[1] }, doc.grid)
        : start;
      view.setCursorCell(next);
      view.setCamera(
        ensureVisible(view.camera, view.viewport, {
          x: next.x * CELL_PX,
          y: next.y * CELL_PX,
          width: CELL_PX,
          height: CELL_PX,
        }),
      );
      if (view.ruler.active) view.rulerMove(next);
      cursorMoved(tool, next);
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      if (dragRef.current?.kind === 'ruler') view.rulerAddWaypoint();
      else spaceRef.current = true;
      return;
    }
    if (e.key === 'Enter' && view.cursorCell) {
      e.preventDefault();
      if (tool === 'ruler') {
        if (view.ruler.active) view.rulerAddWaypoint();
        else view.rulerBegin(view.cursorCell);
      } else if (EDIT_TOOLS.includes(tool)) {
        activateAt(tool, view.cursorCell, e.shiftKey, notify);
      }
      return;
    }
    if (e.key === 'Escape') {
      if (view.ruler.active) view.rulerEnd();
      else if (view.ruler.points.length) view.rulerClear();
      else if (ed.shapeAnchor || isDragging()) cancelEditing();
      else if (ed.selection.size) ed.setSelection([]);
      else view.setCursorCell(null);
    }
  };

  const onKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === ' ') spaceRef.current = false;
  };

  const hints = HINTS[tool] ?? [];

  return (
    <div className="map-canvas-wrap">
      <div
        ref={hostRef}
        className={`map-canvas tool-${tool}`}
        tabIndex={0}
        role="application"
        aria-label={t('canvas.label')}
        aria-roledescription={t('nav.map')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => useViewStore.getState().setHoverCell(null)}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => (spaceRef.current = false)}
      />
      <RulerLabel feetPerCell={doc.grid.feetPerCell} />
      {!ready && (
        <div className="map-hint" role="status">
          {t('canvas.loading')}
        </div>
      )}
      {ready && hints.length > 0 && (
        <div className="map-hint" aria-hidden="true">
          {hints.map((h, i) => (
            <div key={i}>{t(h)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Distanzanzeige am Ende des Lineals (HTML über dem Canvas, scharf bei jedem Zoom). */
function RulerLabel({ feetPerCell }: { feetPerCell: number }) {
  const ruler = useViewStore((s) => s.ruler);
  const camera = useViewStore((s) => s.camera);
  const { diagonalRule, showMeters, locale } = useSettings();
  const path = rulerPath(ruler);
  const last = path[path.length - 1];
  if (path.length < 2 || !last) return null;
  const { feet } = measurePath(path, diagonalRule, feetPerCell);
  const end = worldToScreen(camera, cellCenter(last));
  return (
    <div
      className="ruler-label"
      role="status"
      style={{ transform: `translate(${end.x + 14}px, ${end.y - 34}px)` }}
    >
      {formatDistance(feet, { locale, showMeters })}
    </div>
  );
}
