import { useId, useState, type FormEvent } from 'react';
import { GRID_MAX, GRID_MIN } from '../../core/grid';
import {
  DEFAULT_BACKGROUND,
  FEET_PER_CELL_MAX,
  FEET_PER_CELL_MIN,
  type NewMapOptions,
} from '../../storage/mapDocument';
import { Modal } from '../Modal';
import { useT } from '../useT';

interface Props {
  onCreate: (opts: NewMapOptions) => void;
  onClose: () => void;
}

export function NewMapDialog({ onCreate, onClose }: Props) {
  const t = useT();
  const id = useId();
  const [name, setName] = useState(t('newMap.defaultName'));
  // Als Text halten, damit leere Zwischenstände beim Tippen möglich sind.
  const [cols, setCols] = useState('30');
  const [rows, setRows] = useState('20');
  const [feetPerCell, setFeetPerCell] = useState('5');
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BACKGROUND);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onCreate({
      name,
      cols: Number(cols),
      rows: Number(rows),
      feetPerCell: Number(feetPerCell),
      backgroundColor,
    });
  };

  const range = t('props.range', { min: GRID_MIN, max: GRID_MAX });

  return (
    <Modal title={t('newMap.heading')} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor={`${id}-name`}>{t('props.name')}</label>
          <input
            id={`${id}-name`}
            type="text"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-cols`}>{t('props.cols')}</label>
          <div className="field-inline">
            <input
              id={`${id}-cols`}
              type="number"
              min={GRID_MIN}
              max={GRID_MAX}
              required
              value={cols}
              onChange={(e) => setCols(e.target.value)}
            />
            <span className="muted">{range}</span>
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${id}-rows`}>{t('props.rows')}</label>
          <div className="field-inline">
            <input
              id={`${id}-rows`}
              type="number"
              min={GRID_MIN}
              max={GRID_MAX}
              required
              value={rows}
              onChange={(e) => setRows(e.target.value)}
            />
            <span className="muted">{range}</span>
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${id}-feet`}>{t('props.feetPerCell')}</label>
          <input
            id={`${id}-feet`}
            type="number"
            min={FEET_PER_CELL_MIN}
            max={FEET_PER_CELL_MAX}
            required
            value={feetPerCell}
            onChange={(e) => setFeetPerCell(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-bg`}>{t('props.background')}</label>
          <input
            id={`${id}-bg`}
            type="color"
            value={backgroundColor}
            onChange={(e) => setBackgroundColor(e.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary">
            {t('newMap.create')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
