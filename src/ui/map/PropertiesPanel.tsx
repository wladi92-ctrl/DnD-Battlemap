import { useEffect, useId, useState } from 'react';
import { GRID_MAX, GRID_MIN } from '../../core/grid';
import { FEET_PER_CELL_MAX, FEET_PER_CELL_MIN, type GridSettings } from '../../storage/mapDocument';
import { setBackgroundImage, updateBackgroundImage } from '../../editor/wallOps';
import { useMapStore } from '../state/mapStore';
import { useT } from '../useT';
import { pickImageImport, recalibrateBackground } from '../import/useImageImport';

/** Hintergrundbild: wählen, neu kalibrieren, entfernen, Helligkeit/Kontrast. */
export function BackgroundImagePanel() {
  const t = useT();
  const id = useId();
  const doc = useMapStore((s) => s.doc);
  if (!doc) return null;
  const img = doc.background.image;
  const update = (changes: { brightness?: number; contrast?: number }, key: string) =>
    useMapStore.getState().run(updateBackgroundImage(doc, changes), 'action.backgroundImage', key);
  return (
    <details className="panel-section" open={Boolean(img)}>
      <summary>{t('props.bgHeading')}</summary>
      <p className="small muted">
        {img
          ? t('props.bgInfo', { w: img.width, h: img.height, cell: img.cellPx })
          : t('props.bgNone')}
      </p>
      <div className="button-grid">
        <button type="button" className="btn" onClick={() => void pickImageImport(t, 'background')}>
          {t('props.bgImport')}
        </button>
        {img && (
          <button type="button" className="btn" onClick={() => void recalibrateBackground(t)}>
            {t('props.bgRecalibrate')}
          </button>
        )}
        {img && (
          <button
            type="button"
            className="btn"
            onClick={() =>
              useMapStore
                .getState()
                .run(setBackgroundImage(doc, undefined, false), 'action.backgroundImage')
            }
          >
            {t('props.bgRemove')}
          </button>
        )}
      </div>
      {img && (
        <div className="bg-sliders">
          <div className="panel-field">
            <label htmlFor={`${id}-b`}>
              {t('calibrate.brightness', { percent: Math.round(img.brightness * 100) })}
            </label>
            <input
              id={`${id}-b`}
              type="range"
              min={0.2}
              max={2}
              step={0.05}
              value={img.brightness}
              onChange={(e) => update({ brightness: Number(e.target.value) }, 'bg:brightness')}
            />
          </div>
          <div className="panel-field">
            <label htmlFor={`${id}-c`}>
              {t('calibrate.contrast', { percent: Math.round(img.contrast * 100) })}
            </label>
            <input
              id={`${id}-c`}
              type="range"
              min={-0.8}
              max={0.8}
              step={0.05}
              value={img.contrast}
              onChange={(e) => update({ contrast: Number(e.target.value) }, 'bg:contrast')}
            />
          </div>
        </div>
      )}
    </details>
  );
}

/**
 * Zahlen-/Textfeld, das erst bei Enter oder Verlassen übernimmt
 * (verhindert Zwischenstände wie "1" beim Tippen von "120").
 */
function CommitInput({
  id,
  value,
  onCommit,
  type,
  ...rest
}: {
  id: string;
  value: string | number;
  onCommit: (v: string) => void;
  type: 'text' | 'number';
  min?: number;
  max?: number;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    if (draft !== String(value)) onCommit(draft);
    setDraft(String(value));
  };
  return (
    <input
      id={id}
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(String(value));
      }}
      {...rest}
    />
  );
}

export function PropertiesPanel() {
  const t = useT();
  const id = useId();
  const doc = useMapStore((s) => s.doc);
  if (!doc) return null;
  const { updateGrid, rename, setBackgroundColor } = useMapStore.getState();
  const grid = doc.grid;
  const num = (key: keyof Pick<GridSettings, 'cols' | 'rows' | 'feetPerCell'>) => (v: string) => {
    const n = Number(v);
    if (v.trim() !== '' && Number.isFinite(n)) updateGrid({ [key]: n });
  };
  const range = t('props.range', { min: GRID_MIN, max: GRID_MAX });

  return (
    <details className="panel-section">
      <summary>{t('props.heading')}</summary>

      <div className="panel-field">
        <label htmlFor={`${id}-name`}>{t('props.name')}</label>
        <CommitInput
          id={`${id}-name`}
          type="text"
          maxLength={120}
          value={doc.name}
          onCommit={rename}
        />
      </div>

      <h3>{t('props.size')}</h3>
      <div className="panel-row">
        <div className="panel-field">
          <label htmlFor={`${id}-cols`}>{t('props.cols')}</label>
          <CommitInput
            id={`${id}-cols`}
            type="number"
            min={GRID_MIN}
            max={GRID_MAX}
            value={grid.cols}
            onCommit={num('cols')}
          />
        </div>
        <div className="panel-field">
          <label htmlFor={`${id}-rows`}>{t('props.rows')}</label>
          <CommitInput
            id={`${id}-rows`}
            type="number"
            min={GRID_MIN}
            max={GRID_MAX}
            value={grid.rows}
            onCommit={num('rows')}
          />
        </div>
      </div>
      <p className="muted small">{range}</p>
      <div className="panel-field">
        <label htmlFor={`${id}-feet`}>{t('props.feetPerCell')}</label>
        <CommitInput
          id={`${id}-feet`}
          type="number"
          min={FEET_PER_CELL_MIN}
          max={FEET_PER_CELL_MAX}
          value={grid.feetPerCell}
          onCommit={num('feetPerCell')}
        />
      </div>

      <h3>{t('props.appearance')}</h3>
      <div className="panel-field">
        <label htmlFor={`${id}-bg`}>{t('props.background')}</label>
        <input
          id={`${id}-bg`}
          type="color"
          value={doc.background.color}
          onChange={(e) => setBackgroundColor(e.target.value)}
        />
      </div>
      <label className="panel-check">
        <input
          type="checkbox"
          checked={grid.visible}
          onChange={(e) => updateGrid({ visible: e.target.checked })}
        />
        {t('props.gridVisible')}
      </label>
      <div className="panel-field">
        <label htmlFor={`${id}-gc`}>{t('props.gridColor')}</label>
        <input
          id={`${id}-gc`}
          type="color"
          value={grid.color}
          onChange={(e) => updateGrid({ color: e.target.value })}
        />
      </div>
      <div className="panel-field">
        <label htmlFor={`${id}-go`}>{t('props.gridOpacity')}</label>
        <div className="field-inline">
          <input
            id={`${id}-go`}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={grid.opacity}
            onChange={(e) => updateGrid({ opacity: Number(e.target.value) })}
          />
          <output htmlFor={`${id}-go`}>
            {t('props.percent', { percent: Math.round(grid.opacity * 100) })}
          </output>
        </div>
      </div>
    </details>
  );
}
