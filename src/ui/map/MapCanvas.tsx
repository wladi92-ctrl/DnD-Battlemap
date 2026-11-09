/**
 * Kartenansicht: verbindet den Pixi-Renderer mit Maus/Tastatur und den Stores.
 * Kamera-/Overlay-Updates laufen über Store-Abos direkt in den Renderer (ohne React-Render).
 */
import { useEffect, useRef, useState } from 'react';
import { screenToWorld, worldToScreen, ensureVisible } from '../../core/camera';
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
import { MapRenderer } from '../../render/MapRenderer';
import { useMapStore } from '../state/mapStore';
import { useSettings } from '../state/settingsStore';
import { rulerPath, useViewStore } from '../state/viewStore';
import { useT } from '../useT';

const KEY_PAN_PX = 64;
const WHEEL_ZOOM_SPEED = 0.0015;

type Drag = { kind: 'pan'; last: Point } | { kind: 'ruler' };

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

  // Kartendaten → Renderer.
  useEffect(() => {
    if (!ready || !doc) return;
    rendererRef.current?.setMap({
      cols: doc.grid.cols,
      rows: doc.grid.rows,
      backgroundColor: doc.background.color,
      grid: { visible: doc.grid.visible, color: doc.grid.color, opacity: doc.grid.opacity },
    });
  }, [ready, doc]);

  // Neue Karte geöffnet → Ansicht zurücksetzen und einpassen.
  useEffect(() => {
    if (!ready || !docId) return;
    const view = useViewStore.getState();
    view.rulerClear();
    view.setCursorCell(null);
    view.setHoverCell(null);
    view.fit(worldSize({ cols, rows }));
    // Nur beim Wechsel des Dokuments, nicht bei Größenänderung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, docId]);

  // Kamera und Overlay → Renderer (direktes Store-Abo, kein React-Render).
  useEffect(() => {
    if (!ready) return;
    const push = (s = useViewStore.getState()) => {
      const r = rendererRef.current;
      if (!r) return;
      r.setCamera(s.camera);
      r.setOverlay({ hover: s.hoverCell, cursor: s.cursorCell, ruler: rulerPath(s.ruler) });
    };
    push();
    return useViewStore.subscribe((s, prev) => {
      if (
        s.camera !== prev.camera ||
        s.hoverCell !== prev.hoverCell ||
        s.cursorCell !== prev.cursorCell ||
        s.ruler !== prev.ruler
      ) {
        push(s);
      }
    });
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
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    if (dragRef.current?.kind === 'ruler') useViewStore.getState().rulerEnd();
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const view = useViewStore.getState();
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
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      if (dragRef.current?.kind === 'ruler') view.rulerAddWaypoint();
      else spaceRef.current = true;
      return;
    }
    if (e.key === 'Enter' && tool === 'ruler' && view.cursorCell) {
      e.preventDefault();
      if (view.ruler.active) view.rulerAddWaypoint();
      else view.rulerBegin(view.cursorCell);
      return;
    }
    if (e.key === 'Escape') {
      if (view.ruler.active) view.rulerEnd();
      else if (view.ruler.points.length) view.rulerClear();
      else view.setCursorCell(null);
    }
  };

  const onKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === ' ') spaceRef.current = false;
  };

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
      {ready && tool === 'ruler' && (
        <div className="map-hint" aria-hidden="true">
          {t('ruler.hintMouse')}
          <br />
          {t('ruler.hintKeyboard')}
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
