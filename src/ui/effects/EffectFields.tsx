/**
 * Formularfelder für Effekteigenschaften (Vorlage, dauerhafter Effekt, eigener Effekt).
 * Zahlen werden erst beim Verlassen des Feldes übernommen (Entwurfszustand).
 */
import { useId, useState } from 'react';
import { AOE_SHAPES, WALL_MODES, type AoeShape, type WallMode } from '../../core/aoe';
import { parseDice } from '../../core/dice';
import { effectStyle } from '../../editor/effects';
import type { MessageKey } from '../../i18n';
import {
  DAMAGE_TYPES,
  EFFECT_TRIGGERS,
  HEX_COLOR,
  SAVE_ABILITIES,
  type DamageType,
  type EffectTrigger,
  type SaveAbility,
} from '../../storage/mapDocument';
import { useT } from '../useT';

export interface EffectFieldValues {
  name: string;
  shape: AoeShape;
  size: number;
  width?: number;
  color: string;
  damageType?: DamageType;
  damage?: string;
  save?: { ability: SaveAbility; dc: number; half: boolean };
  wallMode: WallMode;
  rounds: number | null;
  concentration: boolean;
  trigger: EffectTrigger;
}

/** Änderungen; undefined entfernt ein optionales Feld. */
export type EffectChanges = { [K in keyof EffectFieldValues]?: EffectFieldValues[K] | undefined };

/** Übernimmt Änderungen; Felder mit undefined werden entfernt. */
export function applyEffectChanges<T extends object>(base: T, changes: EffectChanges): T {
  const removed = new Set(
    Object.keys(changes).filter((k) => changes[k as keyof EffectChanges] === undefined),
  );
  const merged = { ...base, ...changes } as Record<string, unknown>;
  return Object.fromEntries(Object.entries(merged).filter(([k]) => !removed.has(k))) as T;
}

export function NumberField({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.replace(',', '.'));
    if (draft.trim() !== '' && Number.isFinite(n))
      onChange(Math.min(max, Math.max(min, Math.round(n))));
    setDraft(null);
  };
  return (
    <div className="panel-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft !== null) {
            e.preventDefault();
            commit();
          }
        }}
      />
    </div>
  );
}

/** Würfelausdruck mit Prüfung (leer = kein Schaden). */
function DiceField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? value ?? '';
  const valid = !text.trim() || parseDice(text) !== null;
  const commit = () => {
    if (draft === null) return;
    if (!draft.trim()) onChange(undefined);
    else if (parseDice(draft)) onChange(parseDice(draft)?.text);
    setDraft(null);
  };
  return (
    <div className="panel-field">
      <label htmlFor={id}>{t('effect.damageDice')}</label>
      <input
        id={id}
        value={text}
        placeholder="8d6"
        maxLength={60}
        aria-invalid={!valid}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      {!valid && <span className="small error-text">{t('effect.diceInvalid')}</span>}
    </div>
  );
}

export function EffectFields<V extends EffectFieldValues>({
  value,
  onChange,
  showShape = true,
  showDuration = true,
}: {
  value: V;
  onChange: (changes: EffectChanges) => void;
  showShape?: boolean;
  showDuration?: boolean;
}) {
  const t = useT();
  const id = useId();
  const persistent = value.rounds !== 0;
  return (
    <div className="effect-fields">
      <div className="panel-field">
        <label htmlFor={`${id}-name`}>{t('effect.name')}</label>
        <input
          id={`${id}-name`}
          value={value.name}
          maxLength={120}
          onChange={(e) => onChange({ name: e.target.value.slice(0, 120) })}
        />
      </div>
      {showShape && (
        <div className="panel-field">
          <label htmlFor={`${id}-shape`}>{t('effect.shape')}</label>
          <select
            id={`${id}-shape`}
            value={value.shape}
            onChange={(e) => onChange({ shape: e.target.value as AoeShape })}
          >
            {AOE_SHAPES.map((s) => (
              <option key={s} value={s}>
                {t(`shape.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </div>
      )}
      {value.shape !== 'free' && (
        <div className="panel-row">
          <NumberField
            id={`${id}-size`}
            label={t(`effect.size.${value.shape}` as MessageKey)}
            value={value.size}
            min={5}
            max={5000}
            onChange={(size) => onChange({ size })}
          />
          {value.shape === 'line' && (
            <NumberField
              id={`${id}-width`}
              label={t('effect.width')}
              value={value.width ?? 5}
              min={5}
              max={5000}
              onChange={(width) => onChange({ width })}
            />
          )}
        </div>
      )}
      <div className="panel-row">
        <div className="panel-field">
          <label htmlFor={`${id}-dt`}>{t('effect.damageType')}</label>
          <select
            id={`${id}-dt`}
            value={value.damageType ?? ''}
            onChange={(e) => {
              const dt = (e.target.value || undefined) as DamageType | undefined;
              onChange({ damageType: dt, color: effectStyle(dt).color });
            }}
          >
            <option value="">{t('effect.noDamageType')}</option>
            {DAMAGE_TYPES.map((d) => (
              <option key={d} value={d}>
                {t(`damage.${d}` as MessageKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="panel-field">
          <label htmlFor={`${id}-color`}>{t('token.color')}</label>
          <input
            id={`${id}-color`}
            type="color"
            value={value.color}
            onChange={(e) =>
              HEX_COLOR.test(e.target.value) && onChange({ color: e.target.value.toLowerCase() })
            }
          />
        </div>
      </div>
      <DiceField
        id={`${id}-dice`}
        value={value.damage}
        onChange={(damage) => onChange({ damage })}
      />
      <fieldset className="panel-fieldset">
        <legend>{t('effect.save')}</legend>
        <label className="panel-check">
          <input
            type="checkbox"
            checked={Boolean(value.save)}
            onChange={(e) =>
              onChange({
                save: e.target.checked ? { ability: 'dex', dc: 13, half: true } : undefined,
              })
            }
          />
          {t('effect.hasSave')}
        </label>
        {value.save && (
          <>
            <div className="panel-row">
              <div className="panel-field">
                <label htmlFor={`${id}-ab`}>{t('effect.saveAbility')}</label>
                <select
                  id={`${id}-ab`}
                  value={value.save.ability}
                  onChange={(e) =>
                    value.save &&
                    onChange({ save: { ...value.save, ability: e.target.value as SaveAbility } })
                  }
                >
                  {SAVE_ABILITIES.map((a) => (
                    <option key={a} value={a}>
                      {t(`ability.${a}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </div>
              <NumberField
                id={`${id}-dc`}
                label={t('effect.dc')}
                value={value.save.dc}
                min={1}
                max={40}
                onChange={(dc) => value.save && onChange({ save: { ...value.save, dc } })}
              />
            </div>
            <label className="panel-check">
              <input
                type="checkbox"
                checked={value.save.half}
                onChange={(e) =>
                  value.save && onChange({ save: { ...value.save, half: e.target.checked } })
                }
              />
              {t('effect.halfOnSave')}
            </label>
          </>
        )}
      </fieldset>
      <div className="panel-field">
        <label htmlFor={`${id}-walls`}>{t('effect.walls')}</label>
        <select
          id={`${id}-walls`}
          value={value.wallMode}
          onChange={(e) => onChange({ wallMode: e.target.value as WallMode })}
        >
          {WALL_MODES.map((w) => (
            <option key={w} value={w}>
              {t(`wallMode.${w}` as MessageKey)}
            </option>
          ))}
        </select>
      </div>
      {showDuration && (
        <fieldset className="panel-fieldset">
          <legend>{t('effect.duration')}</legend>
          <label className="panel-check">
            <input
              type="checkbox"
              checked={persistent}
              onChange={(e) => onChange({ rounds: e.target.checked ? 10 : 0 })}
            />
            {t('effect.persistent')}
          </label>
          {persistent && (
            <>
              <label className="panel-check">
                <input
                  type="checkbox"
                  checked={value.rounds === null}
                  onChange={(e) => onChange({ rounds: e.target.checked ? null : 10 })}
                />
                {t('effect.unlimited')}
              </label>
              {value.rounds !== null && (
                <NumberField
                  id={`${id}-rounds`}
                  label={t('effect.rounds')}
                  value={value.rounds}
                  min={1}
                  max={1_000_000}
                  onChange={(rounds) => onChange({ rounds })}
                />
              )}
              <label className="panel-check">
                <input
                  type="checkbox"
                  checked={value.concentration}
                  onChange={(e) => onChange({ concentration: e.target.checked })}
                />
                {t('effect.concentration')}
              </label>
              <div className="panel-field">
                <label htmlFor={`${id}-trig`}>{t('effect.trigger')}</label>
                <select
                  id={`${id}-trig`}
                  value={value.trigger}
                  onChange={(e) => onChange({ trigger: e.target.value as EffectTrigger })}
                >
                  {EFFECT_TRIGGERS.map((tr) => (
                    <option key={tr} value={tr}>
                      {t(`trigger.${tr}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </fieldset>
      )}
    </div>
  );
}
