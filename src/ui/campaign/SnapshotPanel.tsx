/**
 * Schnappschüsse der Karte („Vorher/Nachher“, Kampf pausieren): aktuellen Stand sichern
 * (inkl. Kampf, Tokens, Effekten, Nebel), später wiederherstellen (rückgängig machbar).
 * Werden mit der Karte bzw. Kampagne gespeichert.
 */
import { useId, useState } from 'react';
import { restoreSnapshot, SNAPSHOTS_MAX } from '../../editor/snapshot';
import { getFileAccess } from '../../storage/fileAccess';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useSettings } from '../state/settingsStore';
import { useT } from '../useT';

export function SnapshotPanel() {
  const t = useT();
  const id = useId();
  const snapshots = useMapStore((s) => s.snapshots);
  const hasDoc = useMapStore((s) => s.doc !== null);
  const locale = useSettings((s) => s.locale);
  const [name, setName] = useState('');
  if (!hasDoc) return null;
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' });
  const notice = useNoticeStore.getState().push;

  const take = () => {
    const doc = useMapStore.getState().doc;
    const label =
      name.trim() ||
      (doc?.combat
        ? t('snapshot.defaultCombat', { round: doc.combat.round })
        : t('snapshot.defaultName', { n: snapshots.length + 1 }));
    if (useMapStore.getState().takeSnapshot(label)) {
      notice('info', t('snapshot.taken', { name: label }));
      setName('');
    } else notice('error', t('snapshot.full', { max: SNAPSHOTS_MAX }));
  };

  const restore = async (sid: string) => {
    const s = useMapStore.getState().snapshots.find((x) => x.id === sid);
    const doc = useMapStore.getState().doc;
    if (!s || !doc) return;
    const ok = await getFileAccess().confirm(
      t('snapshot.restoreConfirm', { name: s.name }),
      t('confirm.title'),
      t('snapshot.restore'),
      t('common.cancel'),
    );
    if (!ok) return;
    const reason = useMapStore.getState().run(restoreSnapshot(doc, s), 'action.snapshotRestore');
    notice('info', reason ? t('snapshot.same') : t('snapshot.restored', { name: s.name }));
  };

  return (
    <details className="panel-section">
      <summary>{t('snapshot.heading', { count: snapshots.length })}</summary>
      <p className="small muted">{t('snapshot.intro')}</p>
      <div className="field-inline">
        <input
          aria-label={t('snapshot.name')}
          placeholder={t('snapshot.name')}
          id={`${id}-name`}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && take()}
        />
        <button type="button" className="btn" onClick={take}>
          {t('snapshot.take')}
        </button>
      </div>
      {snapshots.length > 0 && (
        <ul className="campaign-list">
          {[...snapshots].reverse().map((s) => (
            <li key={s.id}>
              <span>
                {s.name}
                <span className="muted small">
                  {' '}
                  · {s.createdAt ? fmt.format(new Date(s.createdAt)) : ''}
                </span>
              </span>
              <span className="campaign-list-actions">
                <button type="button" className="btn btn-small" onClick={() => void restore(s.id)}>
                  {t('snapshot.restore')}
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  aria-label={t('snapshot.delete', { name: s.name })}
                  onClick={() => useMapStore.getState().deleteSnapshot(s.id)}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
