/** Eigene Kreatur (Homebrew) anlegen/bearbeiten – vereinfachter Statblock. */
import { useId, useState, type FormEvent } from 'react';
import {
  formatCr,
  SIZE_CATEGORIES,
  type CreatureAction,
  type SizeCategory,
} from '../../data/srd/creatures';
import { normalizeCreature, type HomebrewCreature } from '../../storage/library';
import type { MessageKey } from '../../i18n';
import { Modal } from '../Modal';
import { useLibraryStore } from '../state/libraryStore';
import { useNoticeStore } from '../state/noticeStore';
import { useT } from '../useT';
import { CREATURE_TYPES, sizeLabel, typeLabel } from './labels';
import { NumberRow } from './PcDialog';
import { ImageError, pickTokenImage } from './tokenImage';

const CR_VALUES = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];
/** Erfahrungspunkte und Übungsbonus nach Herausforderungsgrad (SRD 5.1). */
const XP: Record<number, number> = {
  0: 10,
  0.125: 25,
  0.25: 50,
  0.5: 100,
  1: 200,
  2: 450,
  3: 700,
  4: 1100,
  5: 1800,
  6: 2300,
  7: 2900,
  8: 3900,
  9: 5000,
  10: 5900,
  11: 7200,
  12: 8400,
  13: 10000,
  14: 11500,
  15: 13000,
  16: 15000,
  17: 18000,
  18: 20000,
  19: 22000,
  20: 25000,
  21: 33000,
  22: 41000,
  23: 50000,
  24: 62000,
  25: 75000,
  26: 90000,
  27: 105000,
  28: 120000,
  29: 135000,
  30: 155000,
};
export const profForCr = (cr: number) => (cr < 5 ? 2 : Math.min(9, 2 + Math.floor((cr - 1) / 4)));

/** "Name: Beschreibung" je Zeile ↔ Aktionsliste. */
export function parseActions(text: string): CreatureAction[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(':');
      return i > 0
        ? { name: l.slice(0, i).trim(), desc: l.slice(i + 1).trim() }
        : { name: l, desc: '' };
    });
}
const formatActions = (list: CreatureAction[]) =>
  list.map((a) => (a.desc ? `${a.name}: ${a.desc}` : a.name)).join('\n');

const blank = (): HomebrewCreature => ({
  ...normalizeCreature(`hb-${crypto.randomUUID()}`, '', {}),
  name: '',
});

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export function HomebrewDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: HomebrewCreature | null;
  onClose: () => void;
  onSaved: (c: HomebrewCreature) => void;
}) {
  const t = useT();
  const id = useId();
  const [c, setC] = useState<HomebrewCreature>(initial ?? blank());
  const [traits, setTraits] = useState(formatActions(c.traits));
  const [actions, setActions] = useState(formatActions(c.actions));
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof HomebrewCreature>(k: K, v: HomebrewCreature[K]) =>
    setC((p) => ({ ...p, [k]: v }));

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
    if (!c.name.trim()) return;
    setSaving(true);
    const full: HomebrewCreature = {
      ...c,
      xp: XP[c.cr] ?? 0,
      prof: profForCr(c.cr),
      traits: parseActions(traits),
      actions: parseActions(actions),
    };
    try {
      await useLibraryStore.getState().putHomebrew(full);
      onSaved(full);
    } catch (err) {
      useNoticeStore.getState().push('error', t('creatures.saveError', { error: String(err) }));
      setSaving(false);
    }
  };

  const num = (
    key: string,
    label: MessageKey,
    value: number,
    min: number,
    max: number,
    on: (v: number) => void,
  ) => (
    <NumberRow
      key={key}
      id={`${id}-${key}`}
      label={t(label)}
      value={value}
      min={min}
      max={max}
      onChange={on}
    />
  );

  return (
    <Modal title={initial ? t('hb.heading') : t('hb.headingNew')} onClose={onClose} wide>
      <form onSubmit={(e) => void submit(e)} className="form-grid form-grid-wide">
        <label htmlFor={`${id}-name`}>{t('pc.name')}</label>
        <input
          id={`${id}-name`}
          required
          maxLength={120}
          value={c.name}
          onChange={(e) => set('name', e.target.value)}
        />
        <label htmlFor={`${id}-size`}>{t('pc.size')}</label>
        <select
          id={`${id}-size`}
          value={c.size}
          onChange={(e) => set('size', e.target.value as SizeCategory)}
        >
          {SIZE_CATEGORIES.map((s) => (
            <option key={s} value={s}>
              {sizeLabel(t, s)}
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-type`}>{t('hb.type')}</label>
        <select id={`${id}-type`} value={c.type} onChange={(e) => set('type', e.target.value)}>
          {CREATURE_TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {typeLabel(t, ty)}
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-al`}>{t('hb.alignment')}</label>
        <input
          id={`${id}-al`}
          maxLength={60}
          value={c.alignment}
          onChange={(e) => set('alignment', e.target.value)}
        />
        <label htmlFor={`${id}-cr`}>{t('hb.cr')}</label>
        <select id={`${id}-cr`} value={c.cr} onChange={(e) => set('cr', Number(e.target.value))}>
          {CR_VALUES.map((v) => (
            <option key={v} value={v}>
              {formatCr(v)}
            </option>
          ))}
        </select>
        {num('ac', 'pc.ac', c.ac, 0, 99, (v) => set('ac', v))}
        {num('hp', 'hb.hp', c.hp, 1, 100000, (v) => set('hp', v))}
        <label htmlFor={`${id}-hd`}>{t('hb.hitDice')}</label>
        <input
          id={`${id}-hd`}
          maxLength={30}
          value={c.hitDice}
          placeholder="4d8+4"
          onChange={(e) => set('hitDice', e.target.value)}
        />
        {num('walk', 'pc.speed', c.speed.walk ?? 0, 0, 1000, (v) =>
          set('speed', { ...c.speed, walk: v }),
        )}
        {(['fly', 'swim', 'climb'] as const).map((k) =>
          num(k, `hb.${k}` as MessageKey, c.speed[k] ?? 0, 0, 1000, (v) => {
            const { [k]: _old, ...rest } = c.speed;
            set('speed', v ? { ...rest, [k]: v } : rest);
          }),
        )}
        {num('reach', 'hb.reach', c.reach, 0, 1000, (v) => set('reach', v))}
        {num('pp', 'pc.passive', c.senses.passive ?? 10, 0, 99, (v) =>
          set('senses', { ...c.senses, passive: v }),
        )}
        {num('dv', 'pc.darkvision', c.senses.darkvision ?? 0, 0, 1000, (v) => {
          const { darkvision: _d, ...rest } = c.senses;
          set('senses', v ? { ...rest, darkvision: v } : rest);
        })}
        <fieldset className="span-all ability-row">
          <legend>{t('hb.abilities')}</legend>
          {ABILITIES.map((a, i) => (
            <span key={a}>
              <NumberRow
                id={`${id}-ab-${a}`}
                label={t(`ability.${a}` as MessageKey)}
                value={c.abilities[i] ?? 10}
                min={1}
                max={30}
                onChange={(v) =>
                  set(
                    'abilities',
                    c.abilities.map((x, j) => (j === i ? v : x)),
                  )
                }
              />
            </span>
          ))}
        </fieldset>
        <label htmlFor={`${id}-lang`}>{t('hb.languages')}</label>
        <input
          id={`${id}-lang`}
          maxLength={200}
          value={c.languages}
          onChange={(e) => set('languages', e.target.value)}
        />
        <label htmlFor={`${id}-traits`} className="span-all">
          {t('hb.traits')}
        </label>
        <textarea
          id={`${id}-traits`}
          className="span-all"
          rows={3}
          value={traits}
          onChange={(e) => setTraits(e.target.value)}
        />
        <label htmlFor={`${id}-actions`} className="span-all">
          {t('hb.actions')}
        </label>
        <textarea
          id={`${id}-actions`}
          className="span-all"
          rows={4}
          value={actions}
          onChange={(e) => setActions(e.target.value)}
        />
        <span>{t('pc.image')}</span>
        <div className="field-inline">
          {c.image && <img className="token-thumb" src={c.image} alt="" />}
          <button type="button" className="btn" onClick={() => void chooseImage()}>
            {t('pc.chooseImage')}
          </button>
          {c.image && (
            <button
              type="button"
              className="btn"
              onClick={() => setC(({ image: _i, ...rest }) => rest)}
            >
              {t('pc.removeImage')}
            </button>
          )}
        </div>
        <div className="modal-actions span-all">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || !c.name.trim()}>
            {t('pc.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
