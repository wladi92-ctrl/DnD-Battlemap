/** Spielercharakter anlegen/bearbeiten (wird in der lokalen Bibliothek gespeichert). */
import { useId, useState, type FormEvent } from 'react';
import { SIZE_CATEGORIES, type SizeCategory } from '../../data/srd/creatures';
import type { PlayerCharacter } from '../../storage/library';
import type { MessageKey } from '../../i18n';
import { Modal } from '../Modal';
import { useLibraryStore } from '../state/libraryStore';
import { useNoticeStore } from '../state/noticeStore';
import { useT } from '../useT';
import { sizeLabel } from './labels';
import { ImageError, pickTokenImage } from './tokenImage';

const blank = (): PlayerCharacter => ({
  id: crypto.randomUUID(),
  name: '',
  className: '',
  level: 1,
  size: 'medium',
  ac: 10,
  hpMax: 10,
  initiativeBonus: 0,
  passivePerception: 10,
  speed: 30,
  darkvision: 0,
});

type NumField =
  'level' | 'ac' | 'hpMax' | 'initiativeBonus' | 'passivePerception' | 'speed' | 'darkvision';
const NUMBERS: [NumField, MessageKey, number, number][] = [
  ['level', 'pc.level', 1, 30],
  ['ac', 'pc.ac', 0, 99],
  ['hpMax', 'pc.hp', 1, 100000],
  ['initiativeBonus', 'pc.init', -99, 99],
  ['passivePerception', 'pc.passive', 0, 99],
  ['speed', 'pc.speed', 0, 1000],
  ['darkvision', 'pc.darkvision', 0, 1000],
];

export function PcDialog({
  initial,
  onClose,
}: {
  initial: PlayerCharacter | null;
  onClose: () => void;
}) {
  const t = useT();
  const id = useId();
  const [pc, setPc] = useState<PlayerCharacter>(initial ?? blank());
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof PlayerCharacter>(k: K, v: PlayerCharacter[K]) =>
    setPc((p) => ({ ...p, [k]: v }));

  const chooseImage = async () => {
    try {
      const url = await pickTokenImage(t('pc.image'), t('pc.imageFilter'));
      if (url) set('image', url);
    } catch (e) {
      useNoticeStore.getState().push('error', t(e instanceof ImageError ? e.key : 'error.unknown'));
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pc.name.trim()) return;
    setSaving(true);
    try {
      await useLibraryStore.getState().putPc(pc);
      onClose();
    } catch (err) {
      useNoticeStore.getState().push('error', t('creatures.saveError', { error: String(err) }));
      setSaving(false);
    }
  };

  return (
    <Modal title={initial ? t('pc.heading') : t('pc.headingNew')} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="form-grid">
        <label htmlFor={`${id}-name`}>{t('pc.name')}</label>
        <input
          id={`${id}-name`}
          required
          maxLength={120}
          value={pc.name}
          onChange={(e) => set('name', e.target.value)}
        />
        <label htmlFor={`${id}-class`}>{t('pc.class')}</label>
        <input
          id={`${id}-class`}
          maxLength={60}
          value={pc.className}
          onChange={(e) => set('className', e.target.value)}
        />
        <label htmlFor={`${id}-size`}>{t('pc.size')}</label>
        <select
          id={`${id}-size`}
          value={pc.size}
          onChange={(e) => set('size', e.target.value as SizeCategory)}
        >
          {SIZE_CATEGORIES.map((s) => (
            <option key={s} value={s}>
              {sizeLabel(t, s)}
            </option>
          ))}
        </select>
        {NUMBERS.map(([k, label, min, max]) => (
          <NumberRow
            key={k}
            id={`${id}-${k}`}
            label={t(label)}
            min={min}
            max={max}
            value={pc[k]}
            onChange={(v) => set(k, v)}
          />
        ))}
        <span>{t('pc.image')}</span>
        <div className="field-inline">
          {pc.image && <img className="token-thumb" src={pc.image} alt="" />}
          <button type="button" className="btn" onClick={() => void chooseImage()}>
            {t('pc.chooseImage')}
          </button>
          {pc.image && (
            <button
              type="button"
              className="btn"
              onClick={() => setPc(({ image: _i, ...rest }) => rest)}
            >
              {t('pc.removeImage')}
            </button>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || !pc.name.trim()}>
            {t('pc.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Zahlenfeld mit Entwurfszustand: Begrenzen erst beim Verlassen, nicht bei jedem Tastendruck. */
export function NumberRow({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.replace(',', '.'));
    if (Number.isFinite(n) && draft.trim() !== '')
      onChange(Math.min(max, Math.max(min, step === 1 ? Math.round(n) : n)));
    setDraft(null);
  };
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          // Erst übernehmen; Absenden mit veraltetem Wert vermeiden.
          if (e.key === 'Enter' && draft !== null) {
            e.preventDefault();
            commit();
          }
        }}
      />
    </>
  );
}
