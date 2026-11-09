import { useEffect, useId, useState } from 'react';
import { GRID_MAX, GRID_MIN } from '../../core/grid';
import { FEET_PER_CELL_MAX, FEET_PER_CELL_MIN, type GridSettings } from '../../storage/mapDocument';
import { useMapStore } from '../state/mapStore';
import { useT } from '../useT';

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
    <aside className="side-panel" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{t('props.heading')}</h2>

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
    </aside>
  );
}
