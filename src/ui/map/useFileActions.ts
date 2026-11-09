/**
 * Datei-Aktionen (Neu, Öffnen, Speichern, Speichern unter, Wiederherstellen) inkl.
 * Rückfragen bei ungespeicherten Änderungen und verständlichen Fehlermeldungen.
 */
import { useCallback, useMemo } from 'react';
import type { MessageKey } from '../../i18n';
import { ProjectFileError } from '../../storage/errors';
import { baseName, getFileAccess } from '../../storage/fileAccess';
import { suggestFileName, type NewMapOptions } from '../../storage/mapDocument';
import { decodeProject, encodeProject } from '../../storage/projectFile';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useRecoveryStore } from '../state/recoveryStore';
import { useT } from '../useT';

type T = ReturnType<typeof useT>;

export function reportError(t: T, e: unknown): void {
  const push = useNoticeStore.getState().push;
  if (e instanceof ProjectFileError) {
    push('error', t(`error.${e.code}` as MessageKey), e.details);
  } else {
    push('error', t('error.unknown'), [e instanceof Error ? e.message : String(e)]);
  }
}

export function useFileActions() {
  const t = useT();

  /** true, wenn fortgefahren werden darf (keine Änderungen oder Nutzer verwirft). */
  const confirmDiscard = useCallback(async (): Promise<boolean> => {
    const fa = getFileAccess();
    const pending = useRecoveryStore.getState().pending;
    if (pending) {
      const ok = await fa.confirm(
        t('recovery.discardConfirm', { name: pending.doc.name }),
        t('recovery.heading'),
        t('recovery.discard'),
        t('common.cancel'),
      );
      if (!ok) return false;
      useRecoveryStore.getState().setPending(null);
      await fa.autosaveClear().catch(() => undefined);
    }
    if (!useMapStore.getState().dirty) return true;
    return fa.confirm(
      t('confirm.discard'),
      t('confirm.title'),
      t('confirm.discardOk'),
      t('common.cancel'),
    );
  }, [t]);

  const createMap = useCallback((opts: NewMapOptions) => {
    useMapStore.getState().newMap(opts);
  }, []);

  const openMap = useCallback(async () => {
    try {
      if (!(await confirmDiscard())) return;
      const fa = getFileAccess();
      const file = await fa.openProject(t('file.openTitle'), t('file.filterName'));
      if (!file) return;
      const { doc } = decodeProject(file.bytes);
      useMapStore.getState().loadMap(doc, { path: file.path, name: file.name });
      await fa.autosaveClear().catch(() => undefined);
      useNoticeStore.getState().push('info', t('notice.opened', { name: file.name }));
    } catch (e) {
      reportError(t, e);
    }
  }, [confirmDiscard, t]);

  const saveInternal = useCallback(
    async (forceDialog: boolean): Promise<boolean> => {
      const { doc, filePath } = useMapStore.getState();
      if (!doc) return false;
      const fa = getFileAccess();
      try {
        const target = forceDialog || !fa.canSaveInPlace ? null : filePath;
        const bytes = encodeProject(doc);
        const saved = await fa.saveProject(
          bytes,
          target,
          suggestFileName(doc.name),
          t('file.filterName'),
        );
        if (!saved) return false;
        // Nur übernehmen, wenn das Dokument während des Speicherns nicht geändert wurde.
        if (useMapStore.getState().doc === doc) {
          useMapStore.getState().markSaved({
            path: fa.canSaveInPlace ? saved : null,
            name: baseName(saved),
          });
        }
        await fa.autosaveClear().catch(() => undefined);
        useNoticeStore.getState().push('info', t('notice.saved', { name: baseName(saved) }));
        return true;
      } catch (e) {
        reportError(t, e);
        return false;
      }
    },
    [t],
  );

  const save = useCallback(() => saveInternal(false), [saveInternal]);
  const saveAs = useCallback(() => saveInternal(true), [saveInternal]);

  const restoreRecovery = useCallback(() => {
    const pending = useRecoveryStore.getState().pending;
    if (!pending) return;
    const path = pending.recovery?.filePath ?? null;
    useMapStore.getState().loadMap(pending.doc, { path, name: path ? baseName(path) : null }, true);
    useRecoveryStore.getState().setPending(null);
    useNoticeStore.getState().push('info', t('notice.restored', { name: pending.doc.name }));
  }, [t]);

  const discardRecovery = useCallback(async () => {
    const pending = useRecoveryStore.getState().pending;
    if (!pending) return;
    const fa = getFileAccess();
    const ok = await fa.confirm(
      t('recovery.discardConfirm', { name: pending.doc.name }),
      t('recovery.heading'),
      t('recovery.discard'),
      t('common.cancel'),
    );
    if (!ok) return;
    useRecoveryStore.getState().setPending(null);
    await fa.autosaveClear().catch((e: unknown) => reportError(t, e));
  }, [t]);

  return useMemo(
    () => ({ confirmDiscard, createMap, openMap, save, saveAs, restoreRecovery, discardRecovery }),
    [confirmDiscard, createMap, openMap, save, saveAs, restoreRecovery, discardRecovery],
  );
}
