/**
 * Einstellungen → „Bibliothek teilen“: Charaktere, eigene Kreaturen, eigene Effekte und
 * Kreaturenbilder als JSON exportieren bzw. importieren (z. B. für andere Spielleitungen).
 */
import { useId, useState } from 'react';
import type { MessageKey } from '../../i18n';
import { getFileAccess } from '../../storage/fileAccess';
import type { LibraryKind } from '../../storage/library';
import {
  conflictingEntries,
  exportLibrary,
  importEntries,
  LIBRARY_KINDS,
  LibraryImportError,
  parseLibraryImport,
} from '../../storage/libraryTransfer';
import { useLibraryStore } from '../state/libraryStore';
import { useNoticeStore } from '../state/noticeStore';
import { useT } from '../useT';

const KIND_LABEL: Record<LibraryKind, MessageKey> = {
  pc: 'libTransfer.kind.pc',
  creature: 'libTransfer.kind.creature',
  effect: 'libTransfer.kind.effect',
  portrait: 'libTransfer.kind.portrait',
};

export function LibraryTransferCard() {
  const t = useT();
  const id = useId();
  const [kinds, setKinds] = useState<Set<LibraryKind>>(() => new Set(LIBRARY_KINDS));
  const [busy, setBusy] = useState(false);
  const notice = useNoticeStore.getState().push;

  const doExport = async () => {
    setBusy(true);
    try {
      const { text, count } = await exportLibrary(LIBRARY_KINDS.filter((k) => kinds.has(k)));
      if (!count) {
        notice('info', t('libTransfer.empty'));
        return;
      }
      const saved = await getFileAccess().exportText(
        text,
        'bibliothek.dndlib.json',
        t('libTransfer.filter'),
        'json',
      );
      if (saved) notice('info', t('libTransfer.exported', { count, file: saved }));
    } catch (e) {
      notice('error', t('libTransfer.error', { error: String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    setBusy(true);
    try {
      const file = await getFileAccess().openFile(
        t('libTransfer.importTitle'),
        t('libTransfer.filter'),
        ['json'],
      );
      if (!file) return;
      const parsed = parseLibraryImport(file.bytes);
      if (!parsed.entries.length) {
        notice('error', t('libTransfer.nothing', { skipped: parsed.skipped }));
        return;
      }
      const conflicts = await conflictingEntries(parsed.entries);
      if (conflicts.length) {
        const ok = await getFileAccess().confirm(
          t('libTransfer.overwrite', {
            count: conflicts.length,
            names: conflicts
              .slice(0, 5)
              .map((c) => c.name)
              .join(', '),
          }),
          t('confirm.title'),
          t('libTransfer.overwriteOk'),
          t('common.cancel'),
        );
        if (!ok) return;
      }
      const n = await importEntries(parsed.entries);
      await useLibraryStore.getState().load(true);
      notice(
        'info',
        parsed.skipped
          ? t('libTransfer.importedSkipped', { count: n, skipped: parsed.skipped })
          : t('libTransfer.imported', { count: n }),
      );
    } catch (e) {
      notice(
        'error',
        e instanceof LibraryImportError
          ? t(`libTransfer.bad.${e.code}` as MessageKey)
          : t('libTransfer.error', { error: String(e) }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>{t('libTransfer.heading')}</h2>
      <p className="muted small">{t('libTransfer.intro')}</p>
      <fieldset className="panel-fieldset">
        <legend>{t('libTransfer.kinds')}</legend>
        {LIBRARY_KINDS.map((k) => (
          <label key={k} className="panel-check" htmlFor={`${id}-${k}`}>
            <input
              id={`${id}-${k}`}
              type="checkbox"
              checked={kinds.has(k)}
              onChange={(e) =>
                setKinds((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(k);
                  else next.delete(k);
                  return next;
                })
              }
            />
            {t(KIND_LABEL[k])}
          </label>
        ))}
      </fieldset>
      <div className="field-inline">
        <button
          type="button"
          className="btn"
          disabled={busy || !kinds.size}
          onClick={() => void doExport()}
        >
          {t('libTransfer.export')}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void doImport()}>
          {t('libTransfer.import')}
        </button>
      </div>
    </div>
  );
}
