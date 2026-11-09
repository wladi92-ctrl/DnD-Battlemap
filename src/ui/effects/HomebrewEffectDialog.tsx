/** Eigenen Effekt (Homebrew-Zauber, Falle, Gegenstand …) anlegen oder bearbeiten. */
import { useId, useState, type FormEvent } from 'react';
import type { EffectSource } from '../../data/srd/effects';
import { effectStyle } from '../../editor/effects';
import { normalizeEffect } from '../../storage/library';
import { Modal } from '../Modal';
import { useLibraryStore } from '../state/libraryStore';
import { useNoticeStore } from '../state/noticeStore';
import { useT } from '../useT';
import {
  applyEffectChanges,
  EffectFields,
  type EffectChanges,
  type EffectFieldValues,
} from './EffectFields';

/** Bibliothekseintrag ↔ Formularwerte. */
function toValues(e: EffectSource): EffectFieldValues {
  return {
    name: e.name,
    shape: e.shape,
    size: e.size,
    ...(e.width ? { width: e.width } : {}),
    color: effectStyle(e.damage?.type).color,
    ...(e.damage
      ? { damageType: e.damage.type, damage: e.damage.dice.base ?? Object.values(e.damage.dice)[0] }
      : {}),
    ...(e.save
      ? { save: { ability: e.save.ability, dc: e.save.dc ?? 13, half: e.save.success === 'half' } }
      : {}),
    wallMode: e.spreads ? 'spread' : 'line',
    rounds: e.rounds,
    concentration: e.concentration,
    trigger: 'none',
  };
}

export function HomebrewEffectDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: EffectSource | null;
  onClose: () => void;
  onSaved: (e: EffectSource) => void;
}) {
  const t = useT();
  const id = useId();
  const [values, setValues] = useState<EffectFieldValues>(
    initial
      ? toValues(initial)
      : {
          ...toValues(normalizeEffect('x', '', { shape: 'sphere', size: 20, rounds: 0 })),
          name: '',
        },
  );
  const [desc, setDesc] = useState(initial?.desc ?? '');
  const [saving, setSaving] = useState(false);
  const change = (c: EffectChanges) => setValues((v) => applyEffectChanges(v, c));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!values.name.trim() || values.shape === 'free') return;
    setSaving(true);
    const source = normalizeEffect(initial?.id ?? `hb-effect-${crypto.randomUUID()}`, values.name, {
      shape: values.shape,
      size: values.size,
      width: values.width,
      ...(values.damageType && values.damage
        ? { damage: { type: values.damageType, dice: values.damage } }
        : {}),
      ...(values.save
        ? {
            save: {
              ability: values.save.ability,
              dc: values.save.dc,
              success: values.save.half ? 'half' : 'none',
            },
          }
        : {}),
      rounds: values.rounds,
      concentration: values.concentration,
      spreads: values.wallMode === 'spread',
      desc,
    });
    try {
      onSaved(await useLibraryStore.getState().putEffect(source));
    } catch (err) {
      useNoticeStore.getState().push('error', t('creatures.saveError', { error: String(err) }));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={initial ? t('effect.editCustom') : t('effect.newCustomHeading')}
      onClose={onClose}
      wide
    >
      <form onSubmit={(e) => void submit(e)} className="effect-form">
        <EffectFields value={values} onChange={change} />
        {values.shape === 'free' && (
          <p className="small error-text">{t('effect.freeNotInLibrary')}</p>
        )}
        <label htmlFor={`${id}-desc`}>{t('effect.description')}</label>
        <textarea
          id={`${id}-desc`}
          rows={4}
          maxLength={5000}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving || !values.name.trim() || values.shape === 'free'}
          >
            {t('pc.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
