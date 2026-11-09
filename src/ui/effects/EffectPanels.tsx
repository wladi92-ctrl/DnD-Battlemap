/**
 * Rechte Seitenleiste:
 *  - EffectToolPanel: Optionen des Effekt-Werkzeugs (Vorlage, Einrasten, Winkel, Dauer …).
 *  - EffectListPanel: dauerhafte Effekte der Karte mit Legende; Bearbeiten, Assistent, Löschen.
 */
import { useId } from 'react';
import { ORIGIN_SNAPS, type OriginSnap } from '../../core/aoe';
import { affectedTokens, effectCells, effectStyle, updateEffects } from '../../editor/effects';
import { deleteItems } from '../../editor/wallOps';
import type { MessageKey } from '../../i18n';
import type { MapEffect } from '../../storage/mapDocument';
import { confirmAoe, rotateAoe, updateAoeTemplate } from '../map/effectTools';
import { runOnTokens, type Say } from '../map/tokenTools';
import { useEditorStore } from '../state/editorStore';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useSettings } from '../state/settingsStore';
import { useViewStore } from '../state/viewStore';
import { useT } from '../useT';
import { effectLabel } from '../creatures/effectLabels';
import { applyEffectChanges, EffectFields, NumberField, type EffectChanges } from './EffectFields';

function useSay(): Say {
  const t = useT();
  return (key, params) => useNoticeStore.getState().push('info', t(key, params));
}

export function EffectToolPanel() {
  const t = useT();
  const id = useId();
  const say = useSay();
  const tool = useViewStore((s) => s.tool);
  const aoe = useEditorStore((s) => s.aoe);
  const phase = useEditorStore((s) => s.aoePhase);
  if (tool !== 'effect') return null;
  if (!aoe) {
    return (
      <details className="panel-section" open>
        <summary>{t('tool.effect')}</summary>
        <p className="small muted">{t('notice.chooseEffect')}</p>
      </details>
    );
  }
  const tpl = aoe.template;
  const setTool = (c: Partial<typeof aoe>) => useEditorStore.getState().setAoe({ ...aoe, ...c });
  return (
    <details className="panel-section" open>
      <summary>{t('effect.toolHeading')}</summary>
      <EffectFields
        value={tpl}
        onChange={(c: EffectChanges) => updateAoeTemplate(applyEffectChanges(tpl, c))}
      />
      <div className="panel-row">
        <div className="panel-field">
          <label htmlFor={`${id}-snap`}>{t('effect.originSnap')}</label>
          <select
            id={`${id}-snap`}
            value={aoe.originSnap}
            onChange={(e) => setTool({ originSnap: e.target.value as OriginSnap })}
          >
            {ORIGIN_SNAPS.map((o) => (
              <option key={o} value={o}>
                {t(`originSnap.${o}` as MessageKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="panel-field">
          <label htmlFor={`${id}-step`}>{t('effect.angleStep')}</label>
          <select
            id={`${id}-step`}
            value={aoe.angleStep}
            onChange={(e) => setTool({ angleStep: Number(e.target.value) })}
          >
            <option value={15}>15°</option>
            <option value={45}>45°</option>
            <option value={0}>{t('effect.angleFree')}</option>
          </select>
        </div>
      </div>
      {['cone', 'cube', 'line'].includes(tpl.shape) && (
        <div className="field-inline small">
          <span>{t('effect.angle', { deg: Math.round(phase.angle) })}</span>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => rotateAoe(-1)}
            aria-label={t('selection.rotateLeft')}
          >
            ⟲
          </button>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => rotateAoe(1)}
            aria-label={t('selection.rotateRight')}
          >
            ⟳
          </button>
        </div>
      )}
      <p className="small muted">
        {t(phase.origin ? 'effect.hintDirection' : (`effect.hint.${tpl.shape}` as MessageKey))}
      </p>
      {tpl.shape === 'free' && (
        <button
          type="button"
          className="btn btn-primary"
          disabled={!phase.cells.length}
          onClick={() => confirmAoe(say)}
        >
          {t('effect.confirmFree', { count: phase.cells.length })}
        </button>
      )}
      <button type="button" className="btn" onClick={() => useEditorStore.getState().setAoe(null)}>
        {t('effect.disarm')}
      </button>
    </details>
  );
}

export function EffectListPanel() {
  const t = useT();
  const say = useSay();
  const doc = useMapStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const rule = useSettings((s) => s.coverageRule);
  if (!doc || !doc.effects.length) return null;
  const selected = doc.effects.filter((e) => selection.has(e.id));
  const single = selected.length === 1 ? selected[0] : undefined;
  const ids = new Set(selected.map((e) => e.id));
  const update = (fn: (e: MapEffect) => MapEffect, mergeKey?: string) =>
    runOnTokens(updateEffects(doc, ids, fn), 'action.effectEdit', say, mergeKey);

  const openAssistant = (e: MapEffect) => {
    const cells = effectCells(doc, e, rule);
    const tokens = affectedTokens(doc, cells, e.attachedTo);
    if (!tokens.length) return say('notice.noTargets');
    useEditorStore.getState().openAssistant({
      name: e.name,
      template: {
        name: e.name,
        shape: e.shape,
        size: e.size,
        color: e.color,
        wallMode: e.wallMode,
        rounds: e.rounds,
        concentration: e.concentration,
        trigger: e.trigger,
        ...(e.damageType ? { damageType: e.damageType } : {}),
        ...(e.damage ? { damage: e.damage } : {}),
        ...(e.save ? { save: e.save } : {}),
        ...(e.source ? { source: e.source } : {}),
      },
      cells: cells.size,
      tokenIds: tokens.map((x) => x.id),
      effectId: e.id,
    });
  };

  const types = [...new Set(doc.effects.map((e) => e.damageType ?? 'none'))];

  return (
    <details className="panel-section" open>
      <summary>{t('effect.listHeading', { count: doc.effects.length })}</summary>
      <ul className="effect-list">
        {doc.effects.map((e) => {
          const n = affectedTokens(doc, effectCells(doc, e, rule), e.attachedTo).length;
          return (
            <li key={e.id}>
              <button
                type="button"
                className={selection.has(e.id) ? 'effect-row selected' : 'effect-row'}
                aria-pressed={selection.has(e.id)}
                onClick={() => useEditorStore.getState().setSelection([e.id])}
              >
                <span className="aoe-swatch" style={{ background: e.color }} aria-hidden="true" />
                <span>{effectLabel(t, e)}</span>
                <span className="muted small">{t('effect.targetsShort', { n })}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="effect-legend" aria-label={t('effect.legend')}>
        <span className="small muted">{t('effect.legend')}:</span>
        {types.map((ty) => (
          <span key={ty} className="legend-item small">
            <span
              className={`aoe-swatch pattern-${effectStyle(ty === 'none' ? undefined : ty).pattern}`}
              style={{ background: effectStyle(ty === 'none' ? undefined : ty).color }}
              aria-hidden="true"
            />
            {ty === 'none' ? t('effect.noDamageType') : t(`damage.${ty}` as MessageKey)}
          </span>
        ))}
      </div>
      {single && (
        <div className="effect-edit">
          <EffectFields
            value={single}
            showShape={false}
            onChange={(c: EffectChanges) => {
              if (c.name !== undefined && !c.name.trim()) return;
              update(
                (e) => applyEffectChanges(e, c),
                `effect:${single.id}:${Object.keys(c).join(',')}`,
              );
            }}
          />
          {['cone', 'cube', 'line'].includes(single.shape) && (
            <NumberField
              id={`${single.id}-angle`}
              label={t('effect.angleDeg')}
              value={Math.round(single.angle)}
              min={0}
              max={359}
              onChange={(angle) => update((e) => ({ ...e, angle }))}
            />
          )}
          <label className="panel-check">
            <input
              type="checkbox"
              checked={single.hidden}
              onChange={(ev) => update((e) => ({ ...e, hidden: ev.target.checked }))}
            />
            {t('token.hidden')}
          </label>
          {single.attachedTo && (
            <p className="small muted">
              {t('effect.attached', {
                name: doc.tokens.find((x) => x.id === single.attachedTo)?.name ?? '?',
              })}
            </p>
          )}
        </div>
      )}
      {selected.length > 0 && (
        <div className="button-grid">
          {single && (single.save || single.damage) && (
            <button type="button" className="btn" onClick={() => openAssistant(single)}>
              {t('assist.open')}
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => {
              runOnTokens(deleteItems(doc, ids), 'action.delete', say);
              useEditorStore.getState().setSelection([]);
            }}
          >
            {t('token.delete')}
          </button>
        </div>
      )}
    </details>
  );
}
