/**
 * Spieleransicht (zweites Fenster/Beamer): zeigt nur, was die Spieler sehen dürfen – das
 * GM-Fenster schickt bereits gefilterte Daten. Eigener Zoom/Pan, Vollbild und „reale Größe“
 * (1 Feld = 1 Zoll auf dem Bildschirm, kalibriert über die Bildschirmdiagonale).
 */
import { isTauri } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import { clampCamera, fitToView, panBy, zoomAt, type Camera, type Size } from '../../core/camera';
import { CELL_PX, worldSize } from '../../core/grid';
import type { MessageKey } from '../../i18n';
import { MapRenderer } from '../../render/MapRenderer';
import type { MapDocument } from '../../storage/mapDocument';
import { Modal } from '../Modal';
import { useApplySettings } from '../useApplySettings';
import { useT } from '../useT';
import { PLAYER_CHANNEL, type PlayerHandout, type PlayerMessage } from '../vision/playerChannel';
import { HandoutCard } from './HandoutCard';
import { effectVisuals } from '../map/effectTools';
import { effectLabel } from '../creatures/effectLabels';
import { overlayVisuals, useOverlayStore } from '../state/overlayStore';

const STORAGE_KEY = 'dnd-battlemap.player.v1';

export interface RealSizeSettings {
  enabled: boolean;
  /** Bildschirmdiagonale in Zoll. */
  diagonal: number;
  /** Feinkorrektur in Prozent (100 = unverändert). */
  correction: number;
}

const defaults: RealSizeSettings = { enabled: false, diagonal: 55, correction: 100 };

function loadRealSize(): RealSizeSettings {
  try {
    const v = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<RealSizeSettings> | null;
    if (!v) return defaults;
    return {
      enabled: v.enabled === true,
      diagonal:
        typeof v.diagonal === 'number' && v.diagonal >= 5 && v.diagonal <= 300
          ? v.diagonal
          : defaults.diagonal,
      correction:
        typeof v.correction === 'number' && v.correction >= 50 && v.correction <= 150
          ? v.correction
          : defaults.correction,
    };
  } catch {
    return defaults;
  }
}

/**
 * Zoom für „1 Feld = 1 Zoll“: physische Pixel pro Zoll aus Auflösung und Diagonale,
 * umgerechnet in CSS-Pixel (devicePixelRatio) und durch die Feldgröße der Szene geteilt.
 */
export function realSizeZoom(
  s: Pick<RealSizeSettings, 'diagonal' | 'correction'>,
  screen: { width: number; height: number },
  dpr: number,
): number {
  const physW = screen.width * dpr;
  const physH = screen.height * dpr;
  const ppi = Math.hypot(physW, physH) / s.diagonal;
  return ((ppi / dpr) * (s.correction / 100)) / CELL_PX;
}

export function PlayerApp() {
  useApplySettings();
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const [doc, setDoc] = useState<MapDocument | null>(null);
  const [mask, setMask] = useState<Uint8Array | null>(null);
  const [assets, setAssets] = useState<ReadonlyMap<string, Uint8Array>>(new Map());
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [viewport, setViewport] = useState<Size>({ width: 1, height: 1 });
  const [realSize, setRealSize] = useState<RealSizeSettings>(loadRealSize);
  const [calibrating, setCalibrating] = useState(false);
  const [handout, setHandout] = useState<PlayerHandout | null>(null);
  const [controls, setControls] = useState(true);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const fittedFor = useRef<string | null>(null);

  // Daten vom GM-Fenster empfangen.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(PLAYER_CHANNEL);
    ch.onmessage = (e: MessageEvent<PlayerMessage>) => {
      const m = e.data;
      if (m?.type === 'state') {
        setDoc(m.doc);
        setMask(m.mask);
        useOverlayStore.getState().replace(m.overlay.drawings, m.overlay.pings);
        setHandout(m.handout);
      } else if (m?.type === 'assets') {
        setAssets(m.assets);
      }
    };
    ch.postMessage({ type: 'hello' } satisfies PlayerMessage);
    const bye = () => ch.postMessage({ type: 'bye' } satisfies PlayerMessage);
    window.addEventListener('beforeunload', bye);
    return () => {
      bye();
      window.removeEventListener('beforeunload', bye);
      ch.close();
    };
  }, []);

  // Renderer anlegen.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    void MapRenderer.create(host).then((r) => {
      if (cancelled) return r.destroy();
      r.setOverlay({ hover: null, cursor: null, ruler: [] });
      rendererRef.current = r;
      setReady(true);
    });
    return () => {
      cancelled = true;
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, []);

  // Größe beobachten.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const apply = () => {
      const size = { width: host.clientWidth, height: host.clientHeight };
      setViewport(size);
      rendererRef.current?.resize(size.width, size.height);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(host);
    return () => ro.disconnect();
  }, [ready]);

  // Neue Karte → einpassen bzw. reale Größe.
  useEffect(() => {
    if (!doc || fittedFor.current === doc.id || viewport.width < 2) return;
    fittedFor.current = doc.id;
    setCamera(fitCamera(doc, viewport, realSize));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, viewport.width > 1]);

  // Zustände an den Renderer.
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !doc) return;
    r.setDocument(doc, assets);
    r.setFog(mask, 'player');
    r.setLights([], doc.grid.feetPerCell);
    // Dauerhafte Effekte (das Dokument enthält nur für Spieler sichtbare).
    r.setEffects(effectVisuals(doc, new Set(), (e) => effectLabel(t, e), false));
    r.setConditionLabel((id) => t(`condShort.${id}` as MessageKey));
  }, [ready, doc, mask, assets, t]);
  useEffect(() => rendererRef.current?.setCamera(camera), [ready, camera]);

  // Zeichnungen und Pings der Spielleitung.
  useEffect(() => {
    if (!ready) return;
    const push = () => {
      const v = overlayVisuals(useOverlayStore.getState());
      rendererRef.current?.setDrawings(v.items, v.pings);
    };
    push();
    return useOverlayStore.subscribe(push);
  }, [ready]);

  // Steuerleiste nach 3 s ohne Bewegung ausblenden (Beamer).
  useEffect(() => {
    if (!controls) return;
    const id = setTimeout(() => setControls(false), 3000);
    return () => clearTimeout(id);
  }, [controls]);

  const saveRealSize = (s: RealSizeSettings) => {
    setRealSize(s);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // nur für diese Sitzung
    }
    if (doc) setCamera(fitCamera(doc, viewport, s));
  };

  const world = doc ? worldSize(doc.grid) : { width: 1, height: 1 };
  const fit = () => doc && setCamera(fitCamera(doc, viewport, realSize));

  const toggleFullscreen = async () => {
    if (isTauri()) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const w = getCurrentWindow();
      await w.setFullscreen(!(await w.isFullscreen()));
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  };

  return (
    <div
      className="player-app"
      onPointerMove={() => !controls && setControls(true)}
      onKeyDown={(e) => {
        if (e.key === 'f' || e.key === 'F11') {
          e.preventDefault();
          void toggleFullscreen();
        } else if (e.key === '0') fit();
        else if (e.key === '+' || e.key === '=')
          setCamera((c) =>
            clampCamera(
              zoomAt(c, { x: viewport.width / 2, y: viewport.height / 2 }, 1.25),
              viewport,
              world,
            ),
          );
        else if (e.key === '-')
          setCamera((c) =>
            clampCamera(
              zoomAt(c, { x: viewport.width / 2, y: viewport.height / 2 }, 0.8),
              viewport,
              world,
            ),
          );
      }}
      tabIndex={-1}
    >
      {handout && <HandoutCard handout={handout} />}
      <div
        ref={hostRef}
        className="player-canvas"
        role="img"
        aria-label={t('player.canvas')}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          drag.current = { x: e.clientX, y: e.clientY };
          setCamera((c) => clampCamera(panBy(c, dx, dy), viewport, world));
        }}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) => {
          if (realSize.enabled) return; // reale Größe: Maßstab fest
          const rect = e.currentTarget.getBoundingClientRect();
          const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          setCamera((c) =>
            clampCamera(zoomAt(c, p, Math.exp(-e.deltaY * 0.0015)), viewport, world),
          );
        }}
      />
      {!doc && (
        <div className="player-waiting" role="status">
          <h1>{t('player.title')}</h1>
          <p>{t('player.waiting')}</p>
        </div>
      )}
      <div
        className={controls ? 'player-controls' : 'player-controls hidden'}
        role="toolbar"
        aria-label={t('player.controls')}
      >
        <button type="button" className="btn" onClick={fit}>
          {t('view.fit')}
        </button>
        <button type="button" className="btn" onClick={() => void toggleFullscreen()}>
          {t('player.fullscreen')}
        </button>
        <button
          type="button"
          className="btn"
          aria-pressed={realSize.enabled}
          onClick={() => setCalibrating(true)}
        >
          {realSize.enabled ? t('player.realSizeOn') : t('player.realSize')}
        </button>
      </div>
      {calibrating && (
        <Calibration
          value={realSize}
          onClose={() => setCalibrating(false)}
          onSave={(s) => {
            saveRealSize(s);
            setCalibrating(false);
          }}
        />
      )}
    </div>
  );
}

function fitCamera(doc: MapDocument, viewport: Size, rs: RealSizeSettings): Camera {
  const world = worldSize(doc.grid);
  if (!rs.enabled) return fitToView(viewport, world);
  const zoom = realSizeZoom(rs, window.screen, window.devicePixelRatio || 1);
  // Kartenmitte in die Bildschirmmitte.
  return clampCamera(
    {
      zoom,
      x: viewport.width / 2 - (world.width * zoom) / 2,
      y: viewport.height / 2 - (world.height * zoom) / 2,
    },
    viewport,
    world,
  );
}

function Calibration({
  value,
  onClose,
  onSave,
}: {
  value: RealSizeSettings;
  onClose: () => void;
  onSave: (s: RealSizeSettings) => void;
}) {
  const t = useT();
  const [diagonal, setDiagonal] = useState(String(value.diagonal));
  const [correction, setCorrection] = useState(value.correction);
  const d = Number(diagonal.replace(',', '.'));
  const valid = Number.isFinite(d) && d >= 5 && d <= 300;
  const dpr = window.devicePixelRatio || 1;
  const inchCss = valid
    ? realSizeZoom({ diagonal: d, correction }, window.screen, dpr) * CELL_PX
    : 0;
  return (
    <Modal title={t('player.calibrateHeading')} onClose={onClose}>
      <p className="small muted">{t('player.calibrateHint')}</p>
      <div className="form-grid">
        <label htmlFor="rs-diag">{t('player.diagonal')}</label>
        <input
          id="rs-diag"
          type="number"
          min={5}
          max={300}
          step={0.1}
          value={diagonal}
          onChange={(e) => setDiagonal(e.target.value)}
        />
        <label htmlFor="rs-corr">{t('player.correction', { percent: correction })}</label>
        <input
          id="rs-corr"
          type="range"
          min={80}
          max={120}
          step={0.5}
          value={correction}
          onChange={(e) => setCorrection(Number(e.target.value))}
        />
      </div>
      <p className="small">
        {t('player.screenInfo', {
          w: Math.round(window.screen.width * dpr),
          h: Math.round(window.screen.height * dpr),
        })}
      </p>
      {valid && (
        <div
          className="inch-sample"
          style={{ width: `${inchCss}px`, height: `${inchCss}px` }}
          aria-label={t('player.inchSample')}
        >
          1″
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={() => onSave({ ...value, enabled: false })}>
          {t('player.realSizeOff')}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!valid}
          onClick={() => onSave({ enabled: true, diagonal: d, correction })}
        >
          {t('player.realSizeApply')}
        </button>
      </div>
    </Modal>
  );
}
