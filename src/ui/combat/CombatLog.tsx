/** Kampflog: neueste Einträge oben, Notiz anhängen, als Markdown exportieren, leeren. */
import { useState } from 'react';
import type { MessageKey } from '../../i18n';
import { getFileAccess } from '../../storage/fileAccess';
import type { LogEntry, MapDocument } from '../../storage/mapDocument';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useSettings } from '../state/settingsStore';
import { useT } from '../useT';
import { log } from './combatTools';

type T = (key: MessageKey, params?: Record<string, string | number>) => string;

/** Kampflog als Markdown (Überschrift, Zeit, Runde, Art, Text). */
export function logToMarkdown(doc: MapDocument, t: T, locale: string): string {
  const time = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' });
  const lines = [
    `# ${t('log.exportTitle', { name: doc.name })}`,
    '',
    `| ${t('log.col.time')} | ${t('log.col.round')} | ${t('log.col.kind')} | ${t('log.col.text')} |`,
    '| --- | --- | --- | --- |',
    ...doc.combatLog.map(
      (e: LogEntry) =>
        `| ${time.format(new Date(e.time))} | ${e.round ?? '–'} | ${t(`logKind.${e.kind}` as MessageKey)} | ${e.text.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`,
    ),
    '',
  ];
  return lines.join('\n');
}

export function CombatLog() {
  const t = useT();
  const doc = useMapStore((s) => s.doc);
  const locale = useSettings((s) => s.locale);
  const [note, setNote] = useState('');
  if (!doc) return null;
  const entries = [...doc.combatLog].reverse();
  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short' });

  const exportLog = async () => {
    try {
      const name = `${t('log.fileName')}-${doc.name}.md`.replace(/[\\/:*?"<>|]/g, '');
      const saved = await getFileAccess().exportText(
        logToMarkdown(doc, t, locale),
        name,
        t('log.filterName'),
        'md',
      );
      if (saved) useNoticeStore.getState().push('info', t('notice.logExported', { name: saved }));
    } catch (e) {
      useNoticeStore.getState().push('error', String(e));
    }
  };

  const clear = async () => {
    const ok = await getFileAccess().confirm(
      t('log.clearConfirm'),
      t('confirm.title'),
      t('log.clear'),
      t('common.cancel'),
    );
    if (ok) useMapStore.getState().clearLog();
  };

  return (
    <details className="combat-log">
      <summary>{t('log.heading', { count: doc.combatLog.length })}</summary>
      <form
        className="field-inline"
        onSubmit={(e) => {
          e.preventDefault();
          if (!note.trim()) return;
          log('note', note.trim());
          setNote('');
        }}
      >
        <input
          aria-label={t('log.note')}
          placeholder={t('log.note')}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="submit" className="btn btn-small" disabled={!note.trim()}>
          {t('log.add')}
        </button>
      </form>
      <ol className="log-list" aria-live="polite">
        {entries.slice(0, 200).map((e) => (
          <li key={e.id} className={`log-${e.kind}`}>
            <span className="muted small">
              {time.format(new Date(e.time))}
              {e.round !== null ? ` · ${t('log.roundShort', { round: e.round })}` : ''}
            </span>{' '}
            {e.text}
          </li>
        ))}
      </ol>
      {entries.length > 200 && (
        <p className="small muted">{t('log.more', { count: entries.length - 200 })}</p>
      )}
      <div className="field-inline">
        <button
          type="button"
          className="btn btn-small"
          disabled={!entries.length}
          onClick={() => void exportLog()}
        >
          {t('log.export')}
        </button>
        <button
          type="button"
          className="btn btn-small"
          disabled={!entries.length}
          onClick={() => void clear()}
        >
          {t('log.clear')}
        </button>
      </div>
    </details>
  );
}
