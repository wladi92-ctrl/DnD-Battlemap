/**
 * Effektbibliothek (linker Reiter „Effekte“): SRD-Zauber, Gegenstände, Odemwaffen, Merkmale,
 * Fallen und eigene Effekte; Schnellformen; Auswahl → Effekt-Werkzeug mit dieser Vorlage.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import type { AoeShape } from '../../core/aoe';
import {
  EFFECT_KINDS,
  loadEffectSources,
  slotLevels,
  type EffectKind,
  type EffectSource,
} from '../../data/srd/effects';
import { effectStyle, templateFromSource, type EffectTemplate } from '../../editor/effects';
import type { MessageKey } from '../../i18n';
import { getFileAccess } from '../../storage/fileAccess';
import { armEffect } from '../map/effectTools';
import { useLibraryStore } from '../state/libraryStore';
import { useNoticeStore } from '../state/noticeStore';
import { useT } from '../useT';
import { HomebrewEffectDialog } from './HomebrewEffectDialog';

const QUICK: { shape: AoeShape; size: number }[] = [
  { shape: 'sphere', size: 20 },
  { shape: 'cone', size: 15 },
  { shape: 'cube', size: 15 },
  { shape: 'line', size: 30 },
  { shape: 'emanation', size: 10 },
  { shape: 'square', size: 10 },
  { shape: 'free', size: 0 },
];

/** Ad-hoc-Vorlage einer Grundform. */
export function quickTemplate(shape: AoeShape, size: number, name: string): EffectTemplate {
  return {
    name,
    shape,
    size,
    ...(shape === 'line' ? { width: 5 } : {}),
    color: effectStyle(undefined).color,
    wallMode: shape === 'free' || shape === 'square' ? 'ignore' : 'line',
    rounds: shape === 'free' || shape === 'square' || shape === 'emanation' ? 10 : 0,
    concentration: false,
    trigger: 'none',
  };
}

export function EffectLibraryPanel() {
  const t = useT();
  const id = useId();
  const [srd, setSrd] = useState<EffectSource[] | null>(null);
  const custom = useLibraryStore((s) => s.effects);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'' | EffectKind>('');
  const [shape, setShape] = useState('');
  const [level, setLevel] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [dc, setDc] = useState('13');
  const [editing, setEditing] = useState<EffectSource | 'new' | null>(null);

  useEffect(() => {
    let alive = true;
    void loadEffectSources().then((l) => alive && setSrd(l));
    void useLibraryStore.getState().load();
    return () => {
      alive = false;
    };
  }, []);

  const all = useMemo(() => [...custom, ...(srd ?? [])], [custom, srd]);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('de');
    return all.filter(
      (e) =>
        (!kind || e.kind === kind) &&
        (!shape || e.shape === shape) &&
        (!level || e.level === Number(level)) &&
        (!q || e.name.toLocaleLowerCase('de').includes(q)),
    );
  }, [all, query, kind, shape, level]);
  const current = all.find((e) => e.id === selected) ?? null;
  const slots = current ? slotLevels(current) : [];

  const choose = (e: EffectSource) => {
    setSelected(e.id);
    setSlot(slotLevels(e)[0] ?? null);
  };

  const place = (e: EffectSource) => {
    const n = Math.round(Number(dc));
    armEffect(
      templateFromSource(e, slot ?? undefined, Number.isFinite(n) && n >= 1 && n <= 40 ? n : 13),
    );
  };

  const remove = async (e: EffectSource) => {
    const ok = await getFileAccess().confirm(
      t('creatures.deleteConfirm', { name: e.name }),
      t('confirm.title'),
      t('creatures.delete'),
      t('common.cancel'),
    );
    if (!ok) return;
    try {
      await useLibraryStore.getState().removeEffect(e.id);
      setSelected(null);
    } catch (err) {
      useNoticeStore.getState().push('error', t('creatures.saveError', { error: String(err) }));
    }
  };

  const meta = (e: EffectSource) =>
    [
      t(`effectKind.${e.kind}` as MessageKey),
      e.level !== undefined
        ? e.level
          ? t('effect.level', { level: e.level })
          : t('effect.cantrip')
        : null,
      `${t(`shape.${e.shape}` as MessageKey)} ${e.size} ft`,
      e.damage ? t(`damage.${e.damage.type}` as MessageKey) : null,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <div className="creature-panel">
      <div className="quick-shapes" role="group" aria-label={t('effect.quick')}>
        {QUICK.map((q) => (
          <button
            key={q.shape}
            type="button"
            className="btn btn-small"
            onClick={() =>
              armEffect(quickTemplate(q.shape, q.size, t(`shape.${q.shape}` as MessageKey)))
            }
          >
            {t(`shape.${q.shape}` as MessageKey)}
          </button>
        ))}
      </div>
      <input
        type="search"
        aria-label={t('effect.search')}
        placeholder={t('effect.search')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="filter-grid">
        <select
          aria-label={t('effect.kind')}
          value={kind}
          onChange={(e) => setKind(e.target.value as EffectKind | '')}
        >
          <option value="">{t('effect.allKinds')}</option>
          {EFFECT_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`effectKind.${k}` as MessageKey)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('effect.shape')}
          value={shape}
          onChange={(e) => setShape(e.target.value)}
        >
          <option value="">{t('effect.allShapes')}</option>
          {['sphere', 'cylinder', 'cone', 'cube', 'line', 'emanation', 'square'].map((s) => (
            <option key={s} value={s}>
              {t(`shape.${s}` as MessageKey)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('effect.spellLevel')}
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          <option value="">{t('effect.allLevels')}</option>
          {Array.from({ length: 10 }, (_, i) => (
            <option key={i} value={i}>
              {i ? t('effect.level', { level: i }) : t('effect.cantrip')}
            </option>
          ))}
        </select>
      </div>
      <p className="muted small" aria-live="polite">
        {srd ? t('effect.count', { count: filtered.length }) : t('creatures.loading')}
      </p>
      <ul className="creature-list" role="listbox" id={`${id}-list`} aria-label={t('side.effects')}>
        {filtered.map((e) => (
          <li
            key={e.id}
            role="option"
            aria-selected={e.id === selected}
            tabIndex={e.id === (selected ?? filtered[0]?.id) ? 0 : -1}
            className={e.id === selected ? 'creature-item selected' : 'creature-item'}
            onClick={() => choose(e)}
            onDoubleClick={() => place(e)}
            onKeyDown={(ev) => {
              const items = [
                ...(ev.currentTarget.parentElement?.querySelectorAll<HTMLElement>('li') ?? []),
              ];
              const i = items.indexOf(ev.currentTarget);
              if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
                ev.preventDefault();
                const next = items[i + (ev.key === 'ArrowDown' ? 1 : -1)];
                next?.focus();
                next?.click();
              } else if (ev.key === 'Enter') {
                ev.preventDefault();
                place(e);
              }
            }}
          >
            <span className="creature-name">
              <span
                className="aoe-swatch"
                style={{ background: effectStyle(e.damage?.type).color }}
                aria-hidden="true"
              />
              {e.name}
            </span>
            <span className="muted small">{meta(e)}</span>
          </li>
        ))}
      </ul>
      {current && (
        <div className="creature-actions" role="group" aria-label={current.name}>
          <strong>{current.name}</strong>
          <span className="small">
            {meta(current)}
            {current.save
              ? ` · ${t('effect.saveShort', {
                  ability: t(`ability.${current.save.ability}` as MessageKey),
                })}${current.save.dc ? ` ${t('effect.dc')} ${current.save.dc}` : ''}`
              : ''}
            {current.concentration ? ` · ${t('effect.concentration')}` : ''}
            {current.spreads ? ` · ${t('effect.spreads')}` : ''}
          </span>
          <span className="small muted" lang="en">
            {current.duration}
            {current.range ? ` · ${current.range}` : ''}
          </span>
          {slots.length > 1 && (
            <label className="small">
              {t('effect.slot')}{' '}
              <select value={slot ?? ''} onChange={(e) => setSlot(Number(e.target.value))}>
                {slots.map((s) => (
                  <option key={s} value={s}>
                    {t('effect.level', { level: s })} ({current.damage?.dice[String(s)]})
                  </option>
                ))}
              </select>
            </label>
          )}
          {current.save && current.save.dc === undefined && (
            <label className="small">
              {t('effect.dcForCaster')}{' '}
              <input
                type="number"
                min={1}
                max={40}
                value={dc}
                className="input-narrow"
                onChange={(e) => setDc(e.target.value)}
              />
            </label>
          )}
          <details className="small">
            <summary>{t('effect.description')}</summary>
            <p lang="en" className="effect-desc">
              {current.desc}
            </p>
            {current.higherLevel && (
              <p lang="en" className="effect-desc">
                {current.higherLevel}
              </p>
            )}
          </details>
          <div className="field-inline">
            <button type="button" className="btn btn-primary" onClick={() => place(current)}>
              {t('effect.place')}
            </button>
            {current.kind === 'custom' && (
              <>
                <button type="button" className="btn" onClick={() => setEditing(current)}>
                  {t('creatures.edit')}
                </button>
                <button type="button" className="btn" onClick={() => void remove(current)}>
                  {t('creatures.delete')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <button type="button" className="btn library-import" onClick={() => setEditing('new')}>
        {t('effect.newCustom')}
      </button>
      <p className="muted small">{t('effect.sourceNote')}</p>
      {editing && (
        <HomebrewEffectDialog
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(e) => {
            setEditing(null);
            choose(e);
          }}
        />
      )}
    </div>
  );
}
