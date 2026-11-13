/** Eigenes Element aus PNG/SVG/WebP/JPG importieren und einer Kategorie zuordnen. */
import { useId, useState, type FormEvent } from 'react';
import { customInfo, type ElementInfo } from '../../data/elements';
import { CATEGORY_IDS } from '../../data/elements/categories';
import { addCustomElement } from '../../editor/ops';
import type { MessageKey } from '../../i18n';
import { extensionOf, looksLikeImage } from '../../storage/assets';
import { getFileAccess, IMAGE_EXTENSIONS, IMAGE_MAX_BYTES } from '../../storage/fileAccess';
import {
  ELEMENT_SIZE_MAX,
  type CustomElement,
  type ElementLayerId,
} from '../../storage/mapDocument';
import { Modal } from '../Modal';
import { useMapStore } from '../state/mapStore';
import { useT } from '../useT';
import { reportError } from './useFileActions';

interface Props {
  onClose: () => void;
  onCreated: (el: ElementInfo) => void;
}

interface Picked {
  name: string;
  ext: string;
  bytes: Uint8Array;
}

const LAYERS: ElementLayerId[] = ['floor', 'walls', 'decor'];

export function ImportElementDialog({ onClose, onCreated }: Props) {
  const t = useT();
  const id = useId();
  const [file, setFile] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('custom');
  const [layer, setLayer] = useState<ElementLayerId>('decor');
  const [w, setW] = useState('1');
  const [h, setH] = useState('1');

  const pick = async () => {
    setError(null);
    try {
      const picked = await getFileAccess().openFile(t('import.pickTitle'), t('import.filterName'));
      if (!picked) return;
      const ext = extensionOf(picked.name);
      if (!(IMAGE_EXTENSIONS as readonly string[]).includes(ext))
        return setError(t('import.badType'));
      if (picked.bytes.length > IMAGE_MAX_BYTES)
        return setError(t('import.tooLarge', { mb: IMAGE_MAX_BYTES / 1024 / 1024 }));
      if (!looksLikeImage(picked.bytes, ext)) return setError(t('import.badContent'));
      setFile({ name: picked.name, ext, bytes: picked.bytes });
      if (!name) setName(picked.name.replace(/\.[^.]+$/, '').slice(0, 120));
    } catch (e) {
      reportError(t, e);
    }
  };

  const clamp = (v: string) => Math.min(ELEMENT_SIZE_MAX, Math.max(1, Math.round(Number(v) || 1)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const doc = useMapStore.getState().doc;
    if (!file || !doc) return;
    const uid = crypto.randomUUID().replace(/-/g, '');
    const asset = `custom/${uid}.${file.ext === 'jpeg' ? 'jpg' : file.ext}`;
    const el: CustomElement = {
      id: `custom.${uid}`,
      name: name.trim().slice(0, 120) || file.name,
      category,
      layer,
      w: clamp(w),
      h: clamp(h),
      asset,
    };
    const store = useMapStore.getState();
    store.addAsset(asset, file.bytes);
    store.run(addCustomElement(doc, el), 'action.import');
    onCreated(customInfo(el));
    onClose();
  };

  return (
    <Modal title={t('import.heading')} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <span>{t('import.file')}</span>
          <div className="field-inline">
            <button type="button" className="btn" onClick={() => void pick()}>
              {t('import.choose')}
            </button>
            <span className="muted small">{file ? file.name : t('import.none')}</span>
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
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
          <label htmlFor={`${id}-cat`}>{t('library.category')}</label>
          <select id={`${id}-cat`} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORY_IDS.map((c) => (
              <option key={c} value={c}>
                {t(`category.${c}` as MessageKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-layer`}>{t('import.layer')}</label>
          <select
            id={`${id}-layer`}
            value={layer}
            onChange={(e) => setLayer(e.target.value as ElementLayerId)}
          >
            {LAYERS.map((l) => (
              <option key={l} value={l}>
                {t(`layer.${l}` as MessageKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-w`}>{t('import.size')}</label>
          <div className="field-inline">
            <input
              id={`${id}-w`}
              type="number"
              min={1}
              max={ELEMENT_SIZE_MAX}
              value={w}
              aria-label={t('import.width')}
              onChange={(e) => setW(e.target.value)}
            />
            ×
            <input
              type="number"
              min={1}
              max={ELEMENT_SIZE_MAX}
              value={h}
              aria-label={t('import.height')}
              onChange={(e) => setH(e.target.value)}
            />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!file}>
            {t('import.create')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
