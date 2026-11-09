/**
 * Initiative-Tracker (rechte Seitenleiste oben): Kampf beginnen, Initiative würfeln/eintragen,
 * Reihenfolge, Runde/Zug, weiter/zurück, verzögern, „jetzt handeln“, Teilnehmer verwalten,
 * Optionen (Gleichstand, Tote überspringen, Kamera folgt) und das Kampflog.
 */
import { useId, useState } from 'react';
import {
  addCombatants,
  addCustomEntry,
  moveEntry,
  removeEntry,
  setInitiative,
  sortCombat,
  TIE_RULES,
  type TieRule,
} from '../../editor/combat';
import { tokenStatus } from '../../editor/tokens';
import type { MessageKey } from '../../i18n';
import { getFileAccess } from '../../storage/fileAccess';
import type { CombatEntry, MapDocument } from '../../storage/mapDocument';
import { useEditorStore } from '../state/editorStore';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useSettings } from '../state/settingsStore';
import { useT } from '../useT';
import {
  actNowEntry,
  advanceTurn,
  beginCombat,
  delayCurrent,
  finishCombat,
  focusToken,
  previousTurn,
  rollAllInitiative,
} from './combatTools';
import { CombatLog } from './CombatLog';

export function InitiativePanel() {
  const t = useT();
  const doc = useMapStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  if (!doc) return null;
  const combat = doc.combat;
  const selectedTokens = doc.tokens.filter((x) => selection.has(x.id)).length;

  return (
    <details className="panel-section combat-panel" open>
      <summary>
        {combat ? t('combat.headingRound', { round: combat.round }) : t('combat.heading')}
        {combat && !combat.started && <span className="badge">{t('combat.preparing')}</span>}
      </summary>
      {!combat ? (
        <>
          <p className="small muted">{t('combat.intro')}</p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!doc.tokens.length}
            onClick={beginCombat}
          >
            {selectedTokens
              ? t('combat.startSelected', { count: selectedTokens })
              : t('combat.startAll')}
          </button>
          <CombatLog />
        </>
      ) : (
        <Tracker doc={doc} />
      )}
    </details>
  );
}

function Tracker({ doc }: { doc: MapDocument }) {
  const t = useT();
  const id = useId();
  const combat = doc.combat;
  const settings = useSettings();
  const selection = useEditorStore((s) => s.selection);
  const [custom, setCustom] = useState('');
  if (!combat) return null;
  const rule = settings.tieRule;
  const run = (r: Parameters<ReturnType<typeof useMapStore.getState>['run']>[0]) =>
    useMapStore.getState().run(r, 'action.initiative');
  const selectedOutside = doc.tokens.filter(
    (x) => selection.has(x.id) && !combat.entries.some((e) => e.tokenId === x.id),
  );
  const missing = combat.entries.filter((e) => e.initiative === null).length;

  const end = async () => {
    const ok = await getFileAccess().confirm(
      t('combat.endConfirm'),
      t('confirm.title'),
      t('combat.end'),
      t('common.cancel'),
    );
    if (ok) finishCombat();
  };

  return (
    <div className="tracker">
      <div className="tracker-turn">
        <button
          type="button"
          className="btn"
          disabled={!combat.started}
          onClick={previousTurn}
          aria-label={t('combat.prev')}
          title={`${t('combat.prev')} (${t('key.pageUp')})`}
        >
          ◀
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={advanceTurn}
          title={t('key.pageDown')}
        >
          {combat.started ? t('combat.next') : t('combat.begin')}
        </button>
        <button type="button" className="btn" disabled={!combat.started} onClick={delayCurrent}>
          {t('combat.delay')}
        </button>
      </div>
      <div className="button-grid three">
        <button type="button" className="btn" onClick={() => rollAllInitiative('all')}>
          {t('combat.rollAll')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!missing}
          onClick={() => rollAllInitiative('missing')}
        >
          {t('combat.rollMissing', { count: missing })}
        </button>
        <button type="button" className="btn" onClick={() => rollAllInitiative('npcs')}>
          {t('combat.rollNpcs')}
        </button>
      </div>
      <ol className="initiative-list" aria-label={t('combat.order')}>
        {combat.entries.map((e, i) => (
          <EntryRow
            key={e.id}
            doc={doc}
            entry={e}
            index={i}
            current={combat.started && i === combat.turn}
            rule={rule}
            last={i === combat.entries.length - 1}
          />
        ))}
      </ol>
      <div className="field-inline">
        <button type="button" className="btn btn-small" onClick={() => run(sortCombat(doc, rule))}>
          {t('combat.sort')}
        </button>
        {selectedOutside.length > 0 && (
          <button
            type="button"
            className="btn btn-small"
            onClick={() =>
              run(
                addCombatants(
                  doc,
                  selectedOutside.map((x) => x.id),
                ),
              )
            }
          >
            {t('combat.addSelected', { count: selectedOutside.length })}
          </button>
        )}
      </div>
      <div className="field-inline">
        <input
          aria-label={t('combat.customName')}
          placeholder={t('combat.customName')}
          value={custom}
          maxLength={120}
          onChange={(e) => setCustom(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-small"
          disabled={!custom.trim()}
          onClick={() => {
            run(addCustomEntry(doc, custom, 20, rule));
            setCustom('');
          }}
        >
          {t('combat.addCustom')}
        </button>
      </div>
      <details className="small">
        <summary>{t('combat.options')}</summary>
        <div className="panel-field">
          <label htmlFor={`${id}-tie`}>{t('combat.tieRule')}</label>
          <select
            id={`${id}-tie`}
            value={settings.tieRule}
            onChange={(e) => settings.setCombatOptions({ tieRule: e.target.value as TieRule })}
          >
            {TIE_RULES.map((r) => (
              <option key={r} value={r}>
                {t(`tie.${r}` as MessageKey)}
              </option>
            ))}
          </select>
        </div>
        <label className="panel-check">
          <input
            type="checkbox"
            checked={settings.skipDead}
            onChange={(e) => settings.setCombatOptions({ skipDead: e.target.checked })}
          />
          {t('combat.skipDead')}
        </label>
        <label className="panel-check">
          <input
            type="checkbox"
            checked={settings.cameraFollow}
            onChange={(e) => settings.setCombatOptions({ cameraFollow: e.target.checked })}
          />
          {t('combat.cameraFollow')}
        </label>
      </details>
      <CombatLog />
      <button type="button" className="btn" onClick={() => void end()}>
        {t('combat.end')}
      </button>
    </div>
  );
}

function EntryRow({
  doc,
  entry,
  index,
  current,
  rule,
  last,
}: {
  doc: MapDocument;
  entry: CombatEntry;
  index: number;
  current: boolean;
  rule: TieRule;
  last: boolean;
}) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const token = entry.tokenId ? doc.tokens.find((x) => x.id === entry.tokenId) : undefined;
  const status = token ? tokenStatus(token) : 'ok';
  const commit = () => {
    if (draft === null) return;
    const v = draft.trim() === '' ? null : Number(draft);
    if (v === null || Number.isFinite(v)) {
      useMapStore.getState().run(setInitiative(doc, entry.id, v, rule), 'action.initiative');
    }
    setDraft(null);
  };
  const cls = [
    'initiative-row',
    current ? 'current' : '',
    entry.delayed ? 'delayed' : '',
    status === 'dead' ? 'dead' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <li className={cls} aria-current={current ? 'step' : undefined}>
      <input
        className="init-value"
        type="number"
        aria-label={t('combat.initiativeOf', { name: entry.name })}
        value={draft ?? (entry.initiative === null ? '' : String(entry.initiative))}
        placeholder="–"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
      <button
        type="button"
        className="init-name"
        title={token ? t('combat.focus') : undefined}
        onClick={() => token && focusToken(doc, token.id)}
      >
        <span
          className="token-dot"
          style={{ background: token?.color ?? '#888' }}
          aria-hidden="true"
        />
        <span className="init-label">
          {entry.name}
          {current && <span className="sr-only"> – {t('combat.current')}</span>}
        </span>
        {token && (
          <span className="small muted">
            {t('combat.stats', { hp: token.hp.current, max: token.hp.max, ac: token.ac })}
            {token.conditions.length ? ` · ${token.conditions.length}⚑` : ''}
          </span>
        )}
        {status !== 'ok' && (
          <span className={`status-chip status-${status}`}>
            {t(`token.status.${status}` as MessageKey)}
          </span>
        )}
        {entry.delayed && <span className="badge">{t('combat.delayed')}</span>}
      </button>
      <span className="init-actions">
        {entry.delayed && (
          <button type="button" className="btn btn-small" onClick={() => actNowEntry(entry.id)}>
            {t('combat.actNow')}
          </button>
        )}
        {token && (
          <button
            type="button"
            className="btn btn-small"
            aria-label={t('combat.attackOf', { name: entry.name })}
            title={t('attack.open')}
            onClick={() => useEditorStore.getState().openAttack(token.id)}
          >
            ⚔
          </button>
        )}
        <button
          type="button"
          className="btn btn-small"
          disabled={index === 0}
          aria-label={t('combat.moveUp', { name: entry.name })}
          onClick={() =>
            useMapStore.getState().run(moveEntry(doc, entry.id, -1), 'action.initiative')
          }
        >
          ↑
        </button>
        <button
          type="button"
          className="btn btn-small"
          disabled={last}
          aria-label={t('combat.moveDown', { name: entry.name })}
          onClick={() =>
            useMapStore.getState().run(moveEntry(doc, entry.id, 1), 'action.initiative')
          }
        >
          ↓
        </button>
        <button
          type="button"
          className="btn btn-small"
          aria-label={t('combat.remove', { name: entry.name })}
          onClick={() => {
            const r = removeEntry(doc, entry.id);
            if (
              useMapStore.getState().run(r, 'action.initiative') === null &&
              !useMapStore.getState().doc?.combat
            ) {
              useNoticeStore.getState().push('info', t('notice.combatEmpty'));
            }
          }}
        >
          ×
        </button>
      </span>
    </li>
  );
}
