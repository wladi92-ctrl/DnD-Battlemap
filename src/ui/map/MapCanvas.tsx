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
  endWallChain,
  snapPoint,
  EDIT_TOOLS,
  isDragging,
  moveSelection,
  placementSize,
  pointerDown,
  pointerMove,
  pointerUp,
  type Notify,
} from './editorTools';
import { SIZE_CELLS } from '../../data/srd/creatures';
import { tokenCells } from '../../editor/tokens';
import { moveRangeFor, selectedTokens, stepSelectedTokens } from './tokenTools';
import { aoePointerMove, cancelAoe, effectVisuals, previewResult } from './effectTools';
import { brushCells, cancelFog, closePolygon } from './visionTools';
import {
  computeVision,
  lightPosition,
  playerDocument,
  restrictsPlayers,
} from '../../editor/vision';
import { effectLabel } from '../creatures/effectLabels';

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
  const tokens = selectedTokens(doc);
  for (const tk of tokens) {
    const s = SIZE_CELLS[tk.size];
    const off = s < 1 ? (1 - s) / 2 : 0;
    selection.push({ x: tk.x + off, y: tk.y + off, w: s, h: s });
  }
  let placement: OverlayState['placement'] = null;
  const at = view.hoverCell ?? view.cursorCell;
  if (ed.spawn && at && doc) {
    const n = tokenCells(ed.spawn.template);
    placement = {
      x: Math.min(at.x, doc.grid.cols - n),
      y: Math.min(at.y, doc.grid.rows - n),
      w: n,
      h: n,
    };
  } else if (
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
    selectedWalls: doc ? doc.walls.filter((w) => ed.selection.has(w.id)) : [],
    ...wallOverlay(tool),
    ...fogOverlay(tool, ed.preview),
    ...tokenOverlay(tool),
    targets: aoeTargets(tool),
    current: currentTurnRect(),
  };
}

/** Nebel-Werkzeug: Pinselvorschau unter dem Zeiger bzw. Polygon-Kanten. */
function fogOverlay(
  tool: string,
  preview: readonly Cell[],
): Pick<OverlayState, 'preview' | 'wallPreview' | 'wallVertex'> {
  if (tool !== 'fog') return {};
  const ed = useEditorStore.getState();
  const view = useViewStore.getState();
  const at = view.hoverCell ?? view.cursorCell;
  if (ed.fogTool.shape === 'brush') return { preview: at ? brushCells(at, ed.fogTool.size) : [] };
  if (ed.fogTool.shape === 'rect') return { preview };
  const pts = ed.fogPolygon;
  const raw = view.hoverPoint;
  const vertex = raw ? { x: Math.round(raw.x), y: Math.round(raw.y) } : null;
  const segs: { x1: number; y1: number; x2: number; y2: number }[] = [];
  pts.forEach((p, i) => {
    const prev = pts[i - 1];
    if (prev) segs.push({ x1: prev.x, y1: prev.y, x2: p.x, y2: p.y });
  });
  const last = pts[pts.length - 1];
  if (last && vertex) segs.push({ x1: last.x, y1: last.y, x2: vertex.x, y2: vertex.y });
  return { wallPreview: segs, wallVertex: vertex };
}

/** Rahmen um das Token, das im Kampf am Zug ist. */
function currentTurnRect(): NonNullable<OverlayState['current']> | null {
  const doc = useMapStore.getState().doc;
  const c = doc?.combat;
  if (!doc || !c?.started) return null;
  const e = c.entries[c.turn];
  const tk = e?.tokenId ? doc.tokens.find((x) => x.id === e.tokenId) : undefined;
  if (!tk) return null;
  const s = Math.max(1, SIZE_CELLS[tk.size]);
  return { x: tk.x, y: tk.y, w: s, h: s };
}

/** Tokens im Vorschaubereich des Effekt-Werkzeugs (zum Hervorheben). */
function aoeTargets(tool: string): NonNullable<OverlayState['targets']> {
  const doc = useMapStore.getState().doc;
  if (!doc || tool !== 'effect') return [];
  const prev = previewResult(doc);
  if (!prev) return [];
  return prev.tokens.map((tk) => {
    const s = Math.max(1, SIZE_CELLS[tk.size]);
    return { x: tk.x, y: tk.y, w: s, h: s };
  });
}

/** Bewegungsreichweite, gezogener Weg und Nahkampfreichweite der ausgewählten Tokens. */
function tokenOverlay(
  tool: string,
): Pick<OverlayState, 'moveRange' | 'moveSize' | 'movePath' | 'moveOver' | 'reach'> {
  const doc = useMapStore.getState().doc;
  const ed = useEditorStore.getState();
  if (!doc || tool !== 'select') return {};
  const tokens = selectedTokens(doc);
  const fpc = doc.grid.feetPerCell;
  const reach = tokens.map((tk) => {
    const n = tokenCells(tk);
    const k = Math.max(1, Math.round(tk.reach / fpc));
    return { x: tk.x - k, y: tk.y - k, w: n + 2 * k, h: n + 2 * k };
  });
  const [single] = tokens;
  const mp = ed.movePreview;
  return {
    reach,
    moveRange: single && tokens.length === 1 && !mp ? moveRangeFor(doc, single) : [],
    moveSize: single ? tokenCells(single) : 1,
    movePath: mp?.path ?? [],
    moveOver: mp?.over ?? false,
  };
}

/** Einrastpunkt und Vorschau der Wandkette (letzter Punkt → Zeiger). */
function wallOverlay(tool: string): Pick<OverlayState, 'wallPreview' | 'wallVertex'> {
  if (tool !== 'wall') return { wallPreview: [], wallVertex: null };
  const view = useViewStore.getState();
  const chain = useEditorStore.getState().wallChain;
  const cursor = view.cursorCell;
  const raw = view.hoverPoint ?? (cursor ? { x: cursor.x, y: cursor.y } : null);
  const vertex = raw ? snapPoint(raw) : null;
  const last = chain[chain.length - 1];
  return {
    wallVertex: vertex,
    wallPreview: last && vertex ? [{ x1: last.x, y1: last.y, x2: vertex.x, y2: vertex.y }] : [],
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
  wall: ['hint.wall'],
  effect: ['hint.effect'],
  fog: ['hint.fog'],
  light: ['hint.light'],
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

  const notify: Notify = (key, params) => useNoticeStore.getState().push('info', t(key, params));
  const spawn = useEditorStore((s) => s.spawn);

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
      if (!d) return;
      const preview = useEditorStore.getState().playerPreview;
      const restricted = restrictsPlayers(d);
      const v = restricted || preview ? computeVision(d) : null;
      // Neu Erkundetes still übernehmen (kein Undo-Schritt).
      const explored = v?.explored;
      if (explored) queueMicrotask(() => useMapStore.getState().setExplored(explored));
      r.setDocument(preview && v ? playerDocument(d, v.mask) : d, assets);
      r.setFog(restricted && v ? v.mask : null, preview ? 'player' : 'gm');
      const sel = useEditorStore.getState().selection;
      r.setLights(
        preview
          ? []
          : d.lights.map((l) => ({ ...l, ...lightPosition(d, l), selected: sel.has(l.id) })),
        d.grid.feetPerCell,
      );
    };
    const pushOverlay = () => r.setOverlay(buildOverlay());
    const pushEffects = () => {
      const d = useMapStore.getState().doc;
      if (!d) return;
      const ed = useEditorStore.getState();
      r.setEffects(
        effectVisuals(
          d,
          ed.selection,
          (e) => effectLabel(t, e),
          useViewStore.getState().tool === 'effect',
        ),
      );
    };
    pushDoc();
    pushEffects();
    r.setConditionLabel((id) => t(`condShort.${id}` as MessageKey));
    r.setShowTerrain(useEditorStore.getState().showTerrain);
    r.setCamera(useViewStore.getState().camera);
    pushOverlay();
    const offMap = useMapStore.subscribe((s, prev) => {
      if (s.doc !== prev.doc || s.assets !== prev.assets) {
        pushDoc();
        pushOverlay();
        pushEffects();
      }
    });
    const offView = useViewStore.subscribe((s, prev) => {
      if (s.camera !== prev.camera) r.setCamera(s.camera);
      if (s.tool !== prev.tool) pushEffects();
      if (
        s.hoverCell !== prev.hoverCell ||
        s.cursorCell !== prev.cursorCell ||
        s.ruler !== prev.ruler ||
        s.tool !== prev.tool ||
        // Gebrochene Zeigerposition nur fürs Wandwerkzeug (Einrastpunkt/Vorschau).
        ((s.tool === 'wall' || s.tool === 'fog') && s.hoverPoint !== prev.hoverPoint)
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
        s.paintMode !== prev.paintMode ||
        s.wallChain !== prev.wallChain ||
        s.spawn !== prev.spawn ||
        s.movePreview !== prev.movePreview ||
        s.aoe !== prev.aoe ||
        s.aoePhase !== prev.aoePhase
      ) {
        pushOverlay();
      }
      if (s.playerPreview !== prev.playerPreview || s.selection !== prev.selection) pushDoc();
      if (s.fogPolygon !== prev.fogPolygon || s.fogTool !== prev.fogTool) pushOverlay();
      if (s.selection !== prev.selection || s.aoe !== prev.aoe || s.aoePhase !== prev.aoePhase) {
        pushEffects();
      }
    });
    const offSettings = useSettings.subscribe((s, prev) => {
      if (s.coverageRule !== prev.coverageRule) pushEffects();
    });
    return () => {
      offMap();
      offView();
      offEditor();
      offSettings();
    };
    // t wechselt mit der Sprache; Abzeichen werden dann neu beschriftet.
  }, [ready, t]);

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
    // Rechte Maustaste beendet beim Wandzeichnen die Kette statt zu verschieben.
    if (e.button === 2 && tool === 'wall' && useEditorStore.getState().wallChain.length) {
      endWallChain();
      return;
    }
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
    if (tool === 'wall' || tool === 'fog') view.setHoverPoint(cellPoint(p));
    if (tool === 'effect' && dragRef.current?.kind !== 'edit') aoePointerMove(cellPoint(p));
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
      // Mit Auswahl verschieben die Pfeiltasten Tokens (mit Bewegungskosten) bzw. Objekte.
      if (tool === 'select' && ed.selection.size) {
        if (stepSelectedTokens(dir[0], dir[1], notify)) return;
        if (moveSelection(dir[0], dir[1], notify)) return;
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
      if (ed.spawn) ed.setSpawn(null);
      else if (tool === 'effect' && cancelAoe()) return;
      else if (tool === 'fog' && cancelFog()) return;
      else if (ed.wallChain.length) endWallChain();
      else if (view.ruler.active) view.rulerEnd();
      else if (view.ruler.points.length) view.rulerClear();
      else if (ed.shapeAnchor || isDragging()) cancelEditing();
      else if (ed.selection.size) ed.setSelection([]);
      else view.setCursorCell(null);
    }
  };

  const onKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === ' ') spaceRef.current = false;
  };

  const hints = spawn ? [] : (HINTS[tool] ?? []);

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
        onPointerLeave={() => {
          useViewStore.getState().setHoverCell(null);
          useViewStore.getState().setHoverPoint(null);
        }}
        onDoubleClick={() => {
          if (tool === 'fog' && useEditorStore.getState().fogTool.shape === 'polygon')
            closePolygon();
          if (tool === 'wall') endWallChain();
        }}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => (spaceRef.current = false)}
      />
      <RulerLabel feetPerCell={doc.grid.feetPerCell} />
      <MoveCostLabel />
      {tool === 'effect' && <AoeInfo />}
      {ready && spawn && (
        <div className="map-hint map-hint-strong" role="status">
          {t('token.placeHint', { name: spawn.template.name, count: spawn.count })}
        </div>
      )}
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

/** Kosten des gezogenen Token-Wegs (ft) am Ziel; rot, wenn die Restbewegung nicht reicht. */
function MoveCostLabel() {
  const t = useT();
  const preview = useEditorStore((s) => s.movePreview);
  const camera = useViewStore((s) => s.camera);
  const doc = useMapStore((s) => s.doc);
  const locale = useSettings((s) => s.locale);
  if (!preview || !doc) return null;
  const token = doc.tokens.find((x) => x.id === preview.tokenId);
  if (!token) return null;
  const n = tokenCells(token);
  const end = worldToScreen(camera, {
    x: (preview.target.x + n) * CELL_PX,
    y: preview.target.y * CELL_PX,
  });
  const text =
    preview.cost === null
      ? t('token.moveFree')
      : t('token.moveCost', {
          cost: formatDistance(preview.cost, { locale, showMeters: false }),
          left: formatDistance(Math.max(0, token.speed - token.movementUsed), {
            locale,
            showMeters: false,
          }),
        });
  return (
    <div
      className={preview.over ? 'ruler-label ruler-label-over' : 'ruler-label'}
      role="status"
      style={{ transform: `translate(${end.x + 6}px, ${end.y - 30}px)` }}
    >
      {text}
    </div>
  );
}

/** Name, Form, Schadensart und Zähler „N Felder / M Ziele“ der Effekt-Vorschau. */
function AoeInfo() {
  const t = useT();
  const aoe = useEditorStore((s) => s.aoe);
  useEditorStore((s) => s.aoePhase);
  useMapStore((s) => s.doc);
  useSettings((s) => s.coverageRule);
  const doc = useMapStore.getState().doc;
  if (!doc) return null;
  if (!aoe) {
    return (
      <div className="aoe-info" role="status">
        {t('notice.chooseEffect')}
      </div>
    );
  }
  const prev = previewResult(doc);
  const tpl = aoe.template;
  return (
    <div className="aoe-info" role="status" aria-live="polite">
      <span className="aoe-swatch" style={{ background: tpl.color }} aria-hidden="true" />
      <strong>{tpl.name}</strong>{' '}
      <span>
        {t(`shape.${tpl.shape}` as MessageKey)}
        {tpl.shape !== 'free' ? ` ${tpl.size} ft` : ''}
        {tpl.damageType ? ` · ${t(`damage.${tpl.damageType}` as MessageKey)}` : ''}
      </span>
      {prev && (
        <span className="aoe-count">
          {t('aoe.count', { cells: prev.cells.size, targets: prev.tokens.length })}
        </span>
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
