/**
 * Raster-Kalibrierung für importierte Kartenbilder:
 * Feldgröße + Ursprung (per Ziehen, Pfeiltasten, Zahlen, zwei Punkten oder automatisch),
 * Drehung, Zuschnitt, Helligkeit/Kontrast – mit Live-Vorschau des Rasters.
 */
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  calibratedMapSize,
  clampCellPx,
  clampCrop,
  CELL_PX_MAX,
  CELL_PX_MIN,
  defaultCalibration,
  normalizeOrigin,
  twoPointCalibration,
  withRotation,
} from '../../editor/calibration';
import {
  FEET_PER_CELL_MAX,
  FEET_PER_CELL_MIN,
  rotatedSize,
  type BackgroundImage,
  type ImageRotation,
} from '../../storage/mapDocument';
import { formatDistance } from '../../core/units';
import { Modal } from '../Modal';
import { useNoticeStore } from '../state/noticeStore';
import { useSettings } from '../state/settingsStore';
import { useT } from '../useT';
import { autoDetectGrid, drawRotated } from './imageTools';
import { applyCalibration, useImportStore } from './useImageImport';

type Mode = 'move' | 'points';
interface View {
  zoom: number;
  x: number;
  y: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function CalibrationDialog() {
  const session = useImportStore((s) => s.session);
  if (!session) return null;
  return <CalibrationForm key={session.source.name + session.mode} session={session} />;
}

type Session = NonNullable<ReturnType<typeof useImportStore.getState>['session']>;

function CalibrationForm({ session }: { session: Session }) {
  const t = useT();
  const id = useId();
  const locale = useSettings((s) => s.locale);
  const showMeters = useSettings((s) => s.showMeters);
  const { source, mode, initial } = session;
  const bitmap = source.bitmap;

  const [img, setImg] = useState<BackgroundImage>(() => {
    if (initial) return initial;
    const asset = `background/${crypto.randomUUID().replace(/-/g, '')}.${source.ext}`;
    return defaultCalibration(bitmap.width, bitmap.height, asset);
  });
  const [name, setName] = useState(
    () => source.name.replace(/\.[^.]+$/, '').slice(0, 120) || 'Karte',
  );
  const [feet, setFeet] = useState('5');
  const [fitGrid, setFitGrid] = useState(true);
  const [interaction, setInteraction] = useState<Mode>('move');
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const [pointCells, setPointCells] = useState('1');
  const [gridAlpha, setGridAlpha] = useState(0.8);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [detectInfo, setDetectInfo] = useState<string | null>(null);
  const [cellDraft, setCellDraft] = useState(() => String(img.cellPx));
  // Von außen geänderte Feldgröße (Erkennung, zwei Punkte) ins Eingabefeld übernehmen.
  useEffect(() => {
    setCellDraft((d) => (Number(d) === img.cellPx ? d : String(img.cellPx)));
  }, [img.cellPx]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: 'pan' | 'move'; x: number; y: number } | null>(null);
  const size = rotatedSize(img);

  // Ansicht einpassen.
  const fit = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const zoom = Math.min(wrap.clientWidth / size.w, wrap.clientHeight / size.h) * 0.95;
    setView({
      zoom,
      x: (wrap.clientWidth - size.w * zoom) / 2,
      y: (wrap.clientHeight - size.h * zoom) / 2,
    });
  }, [size.w, size.h]);
  useEffect(fit, [fit]);

  // Vorschau zeichnen.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !wrap || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(wrap.clientWidth * dpr);
    canvas.height = Math.round(wrap.clientHeight * dpr);
    canvas.style.width = `${wrap.clientWidth}px`;
    canvas.style.height = `${wrap.clientHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1d1b19';
    ctx.fillRect(0, 0, wrap.clientWidth, wrap.clientHeight);
    ctx.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, dpr * view.x, dpr * view.y);
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = `brightness(${img.brightness}) contrast(${1 + img.contrast})`;
    drawRotated(ctx, bitmap, img.rotation);
    ctx.filter = 'none';
    // Außerhalb des Zuschnitts abdunkeln
    const { crop } = img;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, size.w, crop.y);
    ctx.fillRect(0, crop.y + crop.h, size.w, size.h - crop.y - crop.h);
    ctx.fillRect(0, crop.y, crop.x, crop.h);
    ctx.fillRect(crop.x + crop.w, crop.y, size.w - crop.x - crop.w, crop.h);
    // Raster im Zuschnitt
    const px = 1 / view.zoom;
    ctx.lineWidth = px;
    ctx.strokeStyle = `rgba(255, 60, 40, ${gridAlpha})`;
    ctx.beginPath();
    const ox = normalizeOrigin(img.originX, crop.x, img.cellPx);
    const oy = normalizeOrigin(img.originY, crop.y, img.cellPx);
    for (let x = ox; x <= crop.x + crop.w + 0.01; x += img.cellPx) {
      ctx.moveTo(x, crop.y);
      ctx.lineTo(x, crop.y + crop.h);
    }
    for (let y = oy; y <= crop.y + crop.h + 0.01; y += img.cellPx) {
      ctx.moveTo(crop.x, y);
      ctx.lineTo(crop.x + crop.w, y);
    }
    ctx.stroke();
    // Feld (1,1) hervorheben
    ctx.lineWidth = 3 * px;
    ctx.strokeStyle = `rgba(255, 210, 60, ${Math.max(0.6, gridAlpha)})`;
    ctx.strokeRect(img.originX, img.originY, img.cellPx, img.cellPx);
    // Messpunkte
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 * px, 0, Math.PI * 2);
      ctx.fillStyle = '#2f7de1';
      ctx.fill();
      ctx.lineWidth = 2 * px;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
  }, [img, view, points, gridAlpha, bitmap, size.w, size.h]);

  const toImage = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left - view.x) / view.zoom,
      y: (e.clientY - rect.top - view.y) / view.zoom,
    };
  };

  const zoomAt = (sx: number, sy: number, factor: number) =>
    setView((v) => {
      const zoom = Math.min(32, Math.max(0.02, v.zoom * factor));
      return { zoom, x: sx - ((sx - v.x) / v.zoom) * zoom, y: sy - ((sy - v.y) / v.zoom) * zoom };
    });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const setOrigin = (x: number, y: number) =>
    setImg((i) => ({
      ...i,
      originX: round2(normalizeOrigin(x, i.crop.x, i.cellPx)),
      originY: round2(normalizeOrigin(y, i.crop.y, i.cellPx)),
    }));

  const onPointerDown = (e: React.PointerEvent) => {
    canvasRef.current?.focus();
    if (e.button === 1 || e.button === 2) {
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY };
    } else if (interaction === 'points') {
      const p = toImage(e);
      setPoints((pts) => (pts.length >= 2 ? [p] : [...pts, p]));
      return;
    } else {
      drag.current = { kind: 'move', x: e.clientX, y: e.clientY };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    drag.current = { ...d, x: e.clientX, y: e.clientY };
    if (d.kind === 'pan') setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    else setOrigin(img.originX + dx / view.zoom, img.originY + dy / view.zoom);
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      setOrigin(img.originX + m[0], img.originY + m[1]);
    } else if (e.key === '+' || e.key === '=') {
      zoomAt(
        (wrapRef.current?.clientWidth ?? 0) / 2,
        (wrapRef.current?.clientHeight ?? 0) / 2,
        1.25,
      );
    } else if (e.key === '-') {
      zoomAt(
        (wrapRef.current?.clientWidth ?? 0) / 2,
        (wrapRef.current?.clientHeight ?? 0) / 2,
        0.8,
      );
    } else if (e.key === '0') {
      fit();
    }
  };

  const detect = () => {
    const r = autoDetectGrid(bitmap, img.rotation, img.crop);
    if (!r) {
      setDetectInfo(t('calibrate.detectNone'));
      return;
    }
    setImg((i) => ({
      ...i,
      cellPx: r.cellPx,
      originX: round2(r.originX),
      originY: round2(r.originY),
    }));
    setDetectInfo(
      t('calibrate.detected', { px: round2(r.cellPx), percent: Math.round(r.confidence * 100) }),
    );
  };

  const applyPoints = () => {
    const [a, b] = points;
    if (!a || !b) return;
    const r = twoPointCalibration(a, b, Number(pointCells), img.crop);
    if (!r) return useNoticeStore.getState().push('info', t('calibrate.pointsInvalid'));
    setImg((i) => ({ ...i, ...r, originX: round2(r.originX), originY: round2(r.originY) }));
    setPoints([]);
    setInteraction('move');
  };

  const rotate = (steps: number) => {
    setImg((i) =>
      withRotation(i, ((((i.rotation + steps * 90) % 360) + 360) % 360) as ImageRotation),
    );
    setPoints([]);
  };

  const setCrop = (key: 'x' | 'y' | 'w' | 'h', value: string) =>
    setImg((i) => {
      const crop = clampCrop(i, { ...i.crop, [key]: Number(value) || 0 });
      return {
        ...i,
        crop,
        originX: normalizeOrigin(i.originX, crop.x, i.cellPx),
        originY: normalizeOrigin(i.originY, crop.y, i.cellPx),
      };
    });

  const result = calibratedMapSize(img);
  const feetNum = Math.min(
    FEET_PER_CELL_MAX,
    Math.max(FEET_PER_CELL_MIN, Math.round(Number(feet) || 5)),
  );
  const fmt = (ft: number) => formatDistance(ft, { locale, showMeters });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    applyCalibration(
      { ...img, originX: round2(img.originX), originY: round2(img.originY) },
      { name, feetPerCell: feetNum, fitGrid: mode === 'newMap' || fitGrid },
    );
  };

  const title = mode === 'newMap' ? t('calibrate.headingNew') : t('calibrate.heading');

  return (
    <Modal title={title} onClose={() => useImportStore.getState().close()} wide>
      <form className="calibrate" onSubmit={submit}>
        <div className="calibrate-preview" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            tabIndex={0}
            aria-label={t('calibrate.canvasLabel')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={onKeyDown}
            className={interaction === 'points' ? 'crosshair' : 'grab'}
          />
          <p className="calibrate-hint">
            {interaction === 'points' ? t('calibrate.hintPoints') : t('calibrate.hintMove')}
          </p>
        </div>
        <div className="calibrate-side">
          <p className="small muted">
            {source.name} · {bitmap.width} × {bitmap.height} px
          </p>
          {mode === 'newMap' && (
            <>
              <div className="panel-field">
                <label htmlFor={`${id}-name`}>{t('props.name')}</label>
                <input
                  id={`${id}-name`}
                  type="text"
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="panel-field">
                <label htmlFor={`${id}-feet`}>{t('props.feetPerCell')}</label>
                <input
                  id={`${id}-feet`}
                  type="number"
                  min={FEET_PER_CELL_MIN}
                  max={FEET_PER_CELL_MAX}
                  value={feet}
                  onChange={(e) => setFeet(e.target.value)}
                />
              </div>
            </>
          )}
          <h3>{t('calibrate.grid')}</h3>
          <div className="panel-field">
            <label htmlFor={`${id}-cell`}>{t('calibrate.cellPx')}</label>
            <input
              id={`${id}-cell`}
              type="number"
              step={0.1}
              min={CELL_PX_MIN}
              max={CELL_PX_MAX}
              value={cellDraft}
              onChange={(e) => {
                // Zwischenstände beim Tippen erlauben; nur gültige Werte übernehmen.
                setCellDraft(e.target.value);
                const n = Number(e.target.value);
                if (e.target.value.trim() === '' || n < CELL_PX_MIN || n > CELL_PX_MAX) return;
                const cellPx = clampCellPx(n);
                setImg((i) => ({
                  ...i,
                  cellPx,
                  originX: normalizeOrigin(i.originX, i.crop.x, cellPx),
                  originY: normalizeOrigin(i.originY, i.crop.y, cellPx),
                }));
              }}
              onBlur={() => setCellDraft(String(img.cellPx))}
            />
          </div>
          <div className="panel-row">
            <div className="panel-field">
              <label htmlFor={`${id}-ox`}>{t('calibrate.originX')}</label>
              <input
                id={`${id}-ox`}
                type="number"
                step={0.5}
                value={img.originX}
                onChange={(e) => setOrigin(Number(e.target.value), img.originY)}
              />
            </div>
            <div className="panel-field">
              <label htmlFor={`${id}-oy`}>{t('calibrate.originY')}</label>
              <input
                id={`${id}-oy`}
                type="number"
                step={0.5}
                value={img.originY}
                onChange={(e) => setOrigin(img.originX, Number(e.target.value))}
              />
            </div>
          </div>
          <div className="button-grid">
            <button type="button" className="btn" onClick={detect}>
              {t('calibrate.detect')}
            </button>
            <button
              type="button"
              className="btn"
              aria-pressed={interaction === 'points'}
              onClick={() => {
                setInteraction(interaction === 'points' ? 'move' : 'points');
                setPoints([]);
              }}
            >
              {t('calibrate.twoPoints')}
            </button>
          </div>
          {detectInfo && (
            <p className="small" role="status">
              {detectInfo}
            </p>
          )}
          {interaction === 'points' && (
            <div className="calibrate-points">
              <p className="small">{t('calibrate.pointsStatus', { count: points.length })}</p>
              <div className="field-inline">
                <label htmlFor={`${id}-pc`}>{t('calibrate.pointCells')}</label>
                <input
                  id={`${id}-pc`}
                  type="number"
                  min={1}
                  max={400}
                  value={pointCells}
                  onChange={(e) => setPointCells(e.target.value)}
                />
                <button
                  type="button"
                  className="btn"
                  disabled={points.length < 2}
                  onClick={applyPoints}
                >
                  {t('calibrate.applyPoints')}
                </button>
              </div>
            </div>
          )}
          <div className="panel-field">
            <label htmlFor={`${id}-ga`}>{t('calibrate.gridAlpha')}</label>
            <input
              id={`${id}-ga`}
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={gridAlpha}
              onChange={(e) => setGridAlpha(Number(e.target.value))}
            />
          </div>

          <h3>{t('calibrate.image')}</h3>
          <div className="field-inline">
            <span>{t('options.rotation', { deg: img.rotation })}</span>
            <button
              type="button"
              className="btn"
              aria-label={t('selection.rotateLeft')}
              onClick={() => rotate(-1)}
            >
              ⟲
            </button>
            <button
              type="button"
              className="btn"
              aria-label={t('selection.rotateRight')}
              onClick={() => rotate(1)}
            >
              ⟳
            </button>
          </div>
          <fieldset className="panel-radios">
            <legend>{t('calibrate.crop')}</legend>
            <div className="panel-row">
              {(['x', 'y', 'w', 'h'] as const).map((k) => (
                <label key={k} className="crop-field">
                  {t(`calibrate.crop.${k}`)}
                  <input
                    type="number"
                    value={img.crop[k]}
                    onChange={(e) => setCrop(k, e.target.value)}
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => setImg((i) => withRotation(i, i.rotation))}
            >
              {t('calibrate.cropReset')}
            </button>
          </fieldset>
          <div className="panel-field">
            <label htmlFor={`${id}-br`}>
              {t('calibrate.brightness', { percent: Math.round(img.brightness * 100) })}
            </label>
            <input
              id={`${id}-br`}
              type="range"
              min={0.2}
              max={2}
              step={0.05}
              value={img.brightness}
              onChange={(e) => setImg((i) => ({ ...i, brightness: Number(e.target.value) }))}
            />
          </div>
          <div className="panel-field">
            <label htmlFor={`${id}-ct`}>
              {t('calibrate.contrast', { percent: Math.round(img.contrast * 100) })}
            </label>
            <input
              id={`${id}-ct`}
              type="range"
              min={-0.8}
              max={0.8}
              step={0.05}
              value={img.contrast}
              onChange={(e) => setImg((i) => ({ ...i, contrast: Number(e.target.value) }))}
            />
          </div>

          <h3>{t('calibrate.result')}</h3>
          <p role="status">
            {t('calibrate.resultSize', {
              cols: result.cols,
              rows: result.rows,
              width: fmt(result.cols * feetNum),
              height: fmt(result.rows * feetNum),
            })}
          </p>
          {(result.raw.cols > 200 || result.raw.rows > 200) && (
            <p className="form-error small">{t('calibrate.tooManyCells')}</p>
          )}
          {(result.raw.cols < 10 || result.raw.rows < 10) && (
            <p className="muted small">{t('calibrate.fewCells')}</p>
          )}
          {mode !== 'newMap' && (
            <label className="panel-check">
              <input
                type="checkbox"
                checked={fitGrid}
                onChange={(e) => setFitGrid(e.target.checked)}
              />
              {t('calibrate.fitGrid')}
            </label>
          )}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => useImportStore.getState().close()}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
              {mode === 'newMap' ? t('calibrate.createMap') : t('calibrate.apply')}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
