/**
 * Eigenschaften ausgewählter Tokens: Bild, TP (Schaden/Heilung/temporär), Todesrettungswürfe,
 * Zustände, Marker, Aktionen der Runde, Bewegung, Sichtbarkeit, Blickrichtung, Gruppe.
 * Mehrfachauswahl: Schaden/Heilung, Zustände, Sichtbarkeit und Gruppe wirken auf alle.
 */
import { useEffect, useId, useState } from 'react';
import {
  CONDITIONS,
  loadCreatures,
  SIZE_CATEGORIES,
  type SizeCategory,
} from '../../data/srd/creatures';
import {
  damageToken,
  duplicateTokens,
  groupTokens,
  healToken,
  recordDeathSave,
  setTempHp,
  toggleCondition,
  tokenStatus,
  updateTokens,
} from '../../editor/tokens';
import { deleteItems } from '../../editor/wallOps';
import type { MessageKey } from '../../i18n';
import { HEX_COLOR, TEAMS, type Team, type Token } from '../../storage/mapDocument';
import { useEditorStore } from '../state/editorStore';
import { useLibraryStore } from '../state/libraryStore';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useT } from '../useT';
import { runOnTokens, type Say } from '../map/tokenTools';
import { startNewRound } from '../map/effectTools';
import { conditionLabel, sizeLabel, teamLabel } from './labels';
import { TokenPortraitField } from './PortraitField';

export function TokenPanel() {
  const t = useT();
  const doc = useMapStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  if (!doc) return null;
  const tokens = doc.tokens.filter((tk) => selection.has(tk.id));
  if (!tokens.length) return <RoundPanel />;
  return <TokenEditor key={tokens.map((x) => x.id).join(',')} tokens={tokens} t={t} />;
}

/** Ohne Auswahl: neue Runde für alle Tokens. */
function RoundPanel() {
  const t = useT();
  const doc = useMapStore((s) => s.doc);
  const say = useSay();
  if (!doc?.tokens.length) return null;
  return (
    <details className="panel-section" open>
      <summary>{t('token.heading')}</summary>
      <p className="small muted">{t('token.none', { count: doc.tokens.length })}</p>
      {doc.combat ? (
        <p className="small muted">{t('token.roundsViaCombat')}</p>
      ) : (
        <button type="button" className="btn" onClick={() => startNewRound(say)}>
          {t('token.newRound')}
        </button>
      )}
    </details>
  );
}

function useSay(): Say {
  const t = useT();
  return (key, params) => useNoticeStore.getState().push('info', t(key, params));
}

function TokenEditor({ tokens, t }: { tokens: Token[]; t: ReturnType<typeof useT> }) {
  const id = useId();
  const say = useSay();
  const doc = useMapStore((s) => s.doc);
  const [amount, setAmount] = useState('');
  const [critical, setCritical] = useState(false);
  const [markerLabel, setMarkerLabel] = useState('');
  const [markerColor, setMarkerColor] = useState('#e3b832');
  if (!doc) return null;
  const ids = new Set(tokens.map((x) => x.id));
  const single = tokens.length === 1 ? tokens[0] : undefined;
  const update = (fn: (tk: Token) => Token, label: MessageKey, mergeKey?: string) =>
    runOnTokens(updateTokens(doc, ids, fn), label, say, mergeKey);
  const value = Math.max(0, Math.round(Number(amount.replace(',', '.')) || 0));

  const hp = (kind: 'damage' | 'heal' | 'temp') => {
    if (!value) return;
    update(
      (tk) =>
        kind === 'damage'
          ? damageToken(tk, value, critical)
          : kind === 'heal'
            ? healToken(tk, value)
            : setTempHp(tk, value),
      'action.tokenHp',
    );
    setAmount('');
    setCritical(false);
  };

  const grouped = tokens.every((x) => x.groupId && x.groupId === tokens[0]?.groupId);

  return (
    <details className="panel-section token-panel" open>
      <summary>{single ? single.name : t('token.count', { count: tokens.length })}</summary>

      {single && <SingleFields token={single} update={update} />}
      <TokenPortraitField tokens={tokens} update={update} />

      <fieldset className="panel-fieldset">
        <legend>{t('token.hp')}</legend>
        {single && (
          <p className="token-hp">
            <strong>{t('token.hpOf', { current: single.hp.current, max: single.hp.max })}</strong>
            {single.hp.temp > 0 && (
              <span className="muted"> {t('token.tempValue', { temp: single.hp.temp })}</span>
            )}
            {tokenStatus(single) !== 'ok' && (
              <span className={`status-chip status-${tokenStatus(single)}`}>
                {t(`token.status.${tokenStatus(single)}` as MessageKey)}
              </span>
            )}
          </p>
        )}
        <div className="panel-field">
          <label htmlFor={`${id}-amt`}>{t('token.amount')}</label>
          <input
            id={`${id}-amt`}
            type="number"
            min={0}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                hp(e.shiftKey ? 'heal' : 'damage');
              }
            }}
          />
        </div>
        <label className="panel-check">
          <input
            type="checkbox"
            checked={critical}
            onChange={(e) => setCritical(e.target.checked)}
          />
          {t('token.critical')}
        </label>
        <div className="button-grid">
          <button type="button" className="btn" disabled={!value} onClick={() => hp('damage')}>
            {t('token.damage')}
          </button>
          <button type="button" className="btn" disabled={!value} onClick={() => hp('heal')}>
            {t('token.heal')}
          </button>
          <button type="button" className="btn" disabled={!value} onClick={() => hp('temp')}>
            {t('token.setTemp')}
          </button>
        </div>
        {single?.kind === 'pc' && single.hp.current <= 0 && tokenStatus(single) !== 'dead' && (
          <div className="death-saves" role="group" aria-label={t('token.deathSaves')}>
            <span>{t('token.deathSaves')}</span>
            <span>
              {t('token.ds.successes')}: {'●'.repeat(single.deathSaves.success)}
              {'○'.repeat(3 - single.deathSaves.success)}
            </span>
            <span>
              {t('token.ds.failures')}: {'●'.repeat(single.deathSaves.failure)}
              {'○'.repeat(3 - single.deathSaves.failure)}
            </span>
            <div className="button-grid">
              <button
                type="button"
                className="btn"
                onClick={() => update((tk) => recordDeathSave(tk, true), 'action.tokenHp')}
              >
                {t('token.dsSuccess')}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => update((tk) => recordDeathSave(tk, false), 'action.tokenHp')}
              >
                {t('token.dsFailure')}
              </button>
            </div>
          </div>
        )}
      </fieldset>

      <fieldset className="panel-fieldset">
        <legend>{t('token.conditions')}</legend>
        <div className="condition-grid">
          {CONDITIONS.map((c) => {
            const on = tokens.every((x) => x.conditions.includes(c.id));
            const some = !on && tokens.some((x) => x.conditions.includes(c.id));
            return (
              <label key={c.id} className="panel-check" title={`${c.name}: ${c.desc.join(' ')}`}>
                <input
                  type="checkbox"
                  checked={on}
                  ref={(el) => {
                    if (el) el.indeterminate = some;
                  }}
                  onChange={() =>
                    runOnTokens(toggleCondition(doc, ids, c.id), 'action.condition', say)
                  }
                />
                {conditionLabel(t, c.id)}
              </label>
            );
          })}
        </div>
      </fieldset>

      {single && (
        <fieldset className="panel-fieldset">
          <legend>{t('token.markers')}</legend>
          <ul className="marker-list">
            {single.markers.map((m, i) => (
              <li key={i}>
                <span className="marker-dot" style={{ background: m.color }} aria-hidden="true" />
                {m.label}
                <button
                  type="button"
                  className="btn btn-small"
                  aria-label={t('token.markerRemove', { label: m.label })}
                  onClick={() =>
                    update(
                      (tk) => ({ ...tk, markers: tk.markers.filter((_, j) => j !== i) }),
                      'action.tokenEdit',
                    )
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="field-inline">
            <input
              aria-label={t('token.markerLabel')}
              placeholder={t('token.markerLabel')}
              maxLength={40}
              value={markerLabel}
              onChange={(e) => setMarkerLabel(e.target.value)}
            />
            <input
              type="color"
              aria-label={t('token.color')}
              value={markerColor}
              onChange={(e) => HEX_COLOR.test(e.target.value) && setMarkerColor(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              disabled={!markerLabel.trim() || single.markers.length >= 20}
              onClick={() => {
                const label = markerLabel.trim();
                update(
                  (tk) => ({ ...tk, markers: [...tk.markers, { label, color: markerColor }] }),
                  'action.tokenEdit',
                );
                setMarkerLabel('');
              }}
            >
              {t('token.markerAdd')}
            </button>
          </div>
        </fieldset>
      )}

      {single && (
        <fieldset className="panel-fieldset">
          <legend>{t('token.actions')}</legend>
          {(['action', 'bonus', 'reaction'] as const).map((k) => (
            <label key={k} className="panel-check">
              <input
                type="checkbox"
                checked={single.actionsUsed[k]}
                onChange={(e) =>
                  update(
                    (tk) => ({ ...tk, actionsUsed: { ...tk.actionsUsed, [k]: e.target.checked } }),
                    'action.tokenEdit',
                  )
                }
              />
              {t(`token.${k}` as MessageKey)}
            </label>
          ))}
          <p className="small">
            {t('token.movementLeft', { used: single.movementUsed, speed: single.speed })}
          </p>
          <button
            type="button"
            className="btn"
            disabled={!single.movementUsed}
            onClick={() => update((tk) => ({ ...tk, movementUsed: 0 }), 'action.tokenEdit')}
          >
            {t('token.resetMovement')}
          </button>
        </fieldset>
      )}

      <label className="panel-check">
        <input
          type="checkbox"
          checked={tokens.every((x) => x.hidden)}
          onChange={(e) =>
            update((tk) => ({ ...tk, hidden: e.target.checked }), 'action.tokenEdit')
          }
        />
        {t('token.hidden')}
      </label>

      <div className="button-grid">
        {single?.source && <StatblockButton token={single} />}
        <button
          type="button"
          className="btn"
          onClick={() => {
            const { result, ids: copies } = duplicateTokens(doc, ids);
            runOnTokens(result, 'action.tokenAdd', say);
            if (copies.length) useEditorStore.getState().setSelection(copies);
          }}
        >
          {t('token.duplicate')}
        </button>
        {tokens.length > 1 && !grouped && (
          <button
            type="button"
            className="btn"
            onClick={() => runOnTokens(groupTokens(doc, ids, true), 'action.group', say)}
          >
            {t('token.group')}
          </button>
        )}
        {tokens.some((x) => x.groupId) && (
          <button
            type="button"
            className="btn"
            onClick={() => runOnTokens(groupTokens(doc, ids, false), 'action.group', say)}
          >
            {t('token.ungroup')}
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
        {single && (
          <button
            type="button"
            className="btn"
            onClick={() => useEditorStore.getState().openAttack(single.id)}
          >
            {t('attack.open')}
          </button>
        )}
        {!doc.combat && (
          <button type="button" className="btn" onClick={() => startNewRound(say)}>
            {t('token.newRound')}
          </button>
        )}
      </div>
    </details>
  );
}

/** Name, Seite, Farbe, Größe, Werte, Blickrichtung eines einzelnen Tokens. */
function SingleFields({
  token,
  update,
}: {
  token: Token;
  update: (fn: (tk: Token) => Token, label: MessageKey, mergeKey?: string) => void;
}) {
  const t = useT();
  const id = useId();
  const [name, setName] = useState(token.name);
  const [maxDraft, setMaxDraft] = useState<string | null>(null);
  // Rückgängig/Wiederholen ändert den Namen von außen.
  useEffect(() => setName(token.name), [token.name]);
  const commitName = () => {
    const n = name.trim().slice(0, 120);
    if (n && n !== token.name) update((tk) => ({ ...tk, name: n }), 'action.tokenEdit');
    else setName(token.name);
  };
  const commitMax = () => {
    if (maxDraft === null) return;
    const v = Math.round(Number(maxDraft));
    if (Number.isFinite(v) && v >= 1 && v <= 100_000)
      update(
        (tk) => ({ ...tk, hp: { ...tk.hp, max: v, current: Math.min(tk.hp.current, v) } }),
        'action.tokenEdit',
      );
    setMaxDraft(null);
  };
  return (
    <div className="token-fields">
      <div className="panel-field">
        <label htmlFor={`${id}-name`}>{t('token.name')}</label>
        <input
          id={`${id}-name`}
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && commitName()}
        />
      </div>
      <div className="panel-field">
        <label htmlFor={`${id}-team`}>{t('creatures.team')}</label>
        <select
          id={`${id}-team`}
          value={token.team}
          onChange={(e) =>
            update((tk) => ({ ...tk, team: e.target.value as Team }), 'action.tokenEdit')
          }
        >
          {TEAMS.map((tm) => (
            <option key={tm} value={tm}>
              {teamLabel(t, tm)}
            </option>
          ))}
        </select>
      </div>
      <div className="panel-field">
        <label htmlFor={`${id}-color`}>{t('token.color')}</label>
        <input
          id={`${id}-color`}
          type="color"
          value={token.color}
          onChange={(e) =>
            HEX_COLOR.test(e.target.value) &&
            update(
              (tk) => ({ ...tk, color: e.target.value.toLowerCase() }),
              'action.tokenEdit',
              `color:${token.id}`,
            )
          }
        />
      </div>
      <div className="panel-field">
        <label htmlFor={`${id}-size`}>{t('pc.size')}</label>
        <select
          id={`${id}-size`}
          value={token.size}
          onChange={(e) =>
            update((tk) => ({ ...tk, size: e.target.value as SizeCategory }), 'action.tokenEdit')
          }
        >
          {SIZE_CATEGORIES.map((s) => (
            <option key={s} value={s}>
              {sizeLabel(t, s)}
            </option>
          ))}
        </select>
      </div>
      <div className="panel-field">
        <label htmlFor={`${id}-max`}>{t('token.max')}</label>
        <input
          id={`${id}-max`}
          type="number"
          min={1}
          value={maxDraft ?? String(token.hp.max)}
          onChange={(e) => setMaxDraft(e.target.value)}
          onBlur={commitMax}
          onKeyDown={(e) => e.key === 'Enter' && commitMax()}
        />
      </div>
      <div className="panel-field">
        <label htmlFor={`${id}-facing`}>
          {t('token.facing', { deg: Math.round(token.facing) })}
        </label>
        <input
          id={`${id}-facing`}
          type="range"
          min={0}
          max={315}
          step={45}
          value={token.facing}
          onChange={(e) =>
            update(
              (tk) => ({ ...tk, facing: Number(e.target.value) }),
              'action.tokenEdit',
              `facing:${token.id}`,
            )
          }
        />
      </div>
      <p className="small muted">
        {t('token.stats', {
          ac: token.ac,
          speed: token.speed,
          init: token.initiativeBonus,
          pp: token.passivePerception,
        })}
        {token.pc
          ? ` · ${[token.pc.className, t('pcs.level', { level: token.pc.level })].filter(Boolean).join(' ')}`
          : ''}
      </p>
    </div>
  );
}

/** Statblock der Herkunftskreatur (SRD oder eigene). */
function StatblockButton({ token }: { token: Token }) {
  const t = useT();
  const homebrew = useLibraryStore((s) => s.homebrew);
  const [srdIds, setSrdIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    let alive = true;
    void loadCreatures().then((l) => alive && setSrdIds(new Set(l.map((c) => c.id))));
    return () => {
      alive = false;
    };
  }, []);
  if (token.kind !== 'creature') return null;
  const known = homebrew.some((h) => h.id === token.source) || srdIds?.has(token.source ?? '');
  if (!known) return null;
  return (
    <button
      type="button"
      className="btn"
      onClick={async () => {
        const c =
          homebrew.find((h) => h.id === token.source) ??
          (await loadCreatures()).find((x) => x.id === token.source);
        if (c) useEditorStore.getState().showStatblock(c);
      }}
    >
      {t('token.statblock')}
    </button>
  );
}
