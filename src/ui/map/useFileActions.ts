/**
 * Datei-Aktionen (Neu, Öffnen, Speichern, Speichern unter, Wiederherstellen) inkl.
 * Rückfragen bei ungespeicherten Änderungen und verständlichen Fehlermeldungen.
 * Ist eine Kampagne geöffnet, speichern „Speichern“/„Speichern unter“ die ganze Kampagne und
 * „Neue Karte“ legt eine neue Szene an; „Öffnen“ lädt Karten (.dndmap) und Kampagnen
 * (.dndcampaign).
 */
import { useCallback, useMemo } from 'react';
import type { MessageKey } from '../../i18n';
import { ProjectFileError } from '../../storage/errors';
import { baseName, getFileAccess } from '../../storage/fileAccess';
import { suggestFileName, type NewMapOptions } from '../../storage/mapDocument';
import { decodeProject, encodeProject } from '../../storage/projectFile';
import {
  CAMPAIGN_EXTENSION,
  decodeCampaign,
  encodeCampaign,
  isCampaignFile,
} from '../../storage/campaignFile';
import { useCampaignStore } from '../state/campaignStore';
import { referencedAssets, useMapStore } from '../state/mapStore';
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
    const rec = useRecoveryStore.getState();
    const pendingName = rec.pending?.doc.name ?? rec.pendingCampaign?.campaign.name;
    if (pendingName !== undefined) {
      const ok = await fa.confirm(
        t('recovery.discardConfirm', { name: pendingName }),
        t('recovery.heading'),
        t('recovery.discard'),
        t('common.cancel'),
      );
      if (!ok) return false;
      useRecoveryStore.getState().setPending(null);
      useRecoveryStore.getState().setPendingCampaign(null);
      await fa.autosaveClear().catch(() => undefined);
    }
    if (!useMapStore.getState().dirty && !useCampaignStore.getState().dirty) return true;
    return fa.confirm(
      t('confirm.discard'),
      t('confirm.title'),
      t('confirm.discardOk'),
      t('common.cancel'),
    );
  }, [t]);

  const createMap = useCallback((opts: NewMapOptions) => {
    const campaign = useCampaignStore.getState();
    if (campaign.campaign) {
      // In einer Kampagne: neue Szene anlegen und dorthin wechseln.
      const id = campaign.addScene(opts);
      if (id) useCampaignStore.getState().switchScene(id);
      return;
    }
    useMapStore.getState().newMap(opts);
  }, []);

  /** Lädt eine bereits gelesene .dndmap-Datei (Dialog oder Drag & Drop). */
  const loadFile = useCallback(
    async (file: { path: string | null; name: string; bytes: Uint8Array }) => {
      if (isCampaignFile(file.bytes)) {
        const contents = decodeCampaign(file.bytes);
        useCampaignStore.getState().load(contents, { path: file.path, name: file.name });
        if (contents.damaged.length)
          useNoticeStore
            .getState()
            .push('error', t('campaign.damagedScenes', { names: contents.damaged.join(', ') }));
      } else {
        const { doc, assets, snapshots } = decodeProject(file.bytes);
        useCampaignStore.getState().close();
        useMapStore
          .getState()
          .loadMap(doc, { path: file.path, name: file.name }, false, assets, snapshots);
      }
      await getFileAccess()
        .autosaveClear()
        .catch(() => undefined);
      useNoticeStore.getState().push('info', t('notice.opened', { name: file.name }));
    },
    [t],
  );

  const openMap = useCallback(async () => {
    try {
      if (!(await confirmDiscard())) return;
      const file = await getFileAccess().openProject(t('file.openTitle'), t('file.filterName'));
      if (file) await loadFile(file);
    } catch (e) {
      reportError(t, e);
    }
  }, [confirmDiscard, loadFile, t]);

  /** Öffnet eine per Drag & Drop abgelegte Kartendatei. */
  const openDropped = useCallback(
    async (name: string, bytes: Uint8Array) => {
      try {
        if (await confirmDiscard()) await loadFile({ path: null, name, bytes });
      } catch (e) {
        reportError(t, e);
      }
    },
    [confirmDiscard, loadFile, t],
  );

  const saveInternal = useCallback(
    async (forceDialog: boolean): Promise<boolean> => {
      const { doc, filePath, assets, snapshots } = useMapStore.getState();
      if (!doc) return false;
      const fa = getFileAccess();
      const campaign = useCampaignStore.getState();
      if (campaign.campaign) {
        try {
          const contents = campaign.collect();
          if (!contents) return false;
          const target = forceDialog || !fa.canSaveInPlace ? null : campaign.filePath;
          const revision = campaign.revision;
          const mapDoc = doc;
          const saved = await fa.saveProject(
            encodeCampaign(contents),
            target,
            `${suggestFileName(contents.campaign.name).replace(/\.dndmap$/, '')}.${CAMPAIGN_EXTENSION}`,
            t('campaign.filterName'),
            CAMPAIGN_EXTENSION,
          );
          if (!saved) return false;
          const file = { path: fa.canSaveInPlace ? saved : null, name: baseName(saved) };
          // Nur als gespeichert markieren, wenn sich während des Speicherns nichts geändert hat.
          if (
            useCampaignStore.getState().revision === revision &&
            useMapStore.getState().doc === mapDoc
          )
            useCampaignStore.getState().markSaved(file);
          await fa.autosaveClear().catch(() => undefined);
          useNoticeStore.getState().push('info', t('notice.saved', { name: baseName(saved) }));
          return true;
        } catch (e) {
          reportError(t, e);
          return false;
        }
      }
      try {
        const target = forceDialog || !fa.canSaveInPlace ? null : filePath;
        const bytes = encodeProject(doc, referencedAssets(doc, assets, snapshots), null, snapshots);
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
    const { pending, pendingCampaign } = useRecoveryStore.getState();
    if (pendingCampaign) {
      const path = pendingCampaign.recovery?.filePath ?? null;
      useCampaignStore
        .getState()
        .load(pendingCampaign, { path, name: path ? baseName(path) : null }, true);
      useRecoveryStore.getState().setPendingCampaign(null);
      useNoticeStore
        .getState()
        .push('info', t('notice.restored', { name: pendingCampaign.campaign.name }));
      return;
    }
    if (!pending) return;
    const path = pending.recovery?.filePath ?? null;
    useMapStore
      .getState()
      .loadMap(
        pending.doc,
        { path, name: path ? baseName(path) : null },
        true,
        pending.assets,
        pending.snapshots,
      );
    useRecoveryStore.getState().setPending(null);
    useNoticeStore.getState().push('info', t('notice.restored', { name: pending.doc.name }));
  }, [t]);

  const discardRecovery = useCallback(async () => {
    const rec = useRecoveryStore.getState();
    const name = rec.pending?.doc.name ?? rec.pendingCampaign?.campaign.name;
    if (name === undefined) return;
    const fa = getFileAccess();
    const ok = await fa.confirm(
      t('recovery.discardConfirm', { name }),
      t('recovery.heading'),
      t('recovery.discard'),
      t('common.cancel'),
    );
    if (!ok) return;
    useRecoveryStore.getState().setPending(null);
    useRecoveryStore.getState().setPendingCampaign(null);
    await fa.autosaveClear().catch((e: unknown) => reportError(t, e));
  }, [t]);

  return useMemo(
    () => ({
      confirmDiscard,
      createMap,
      openMap,
      openDropped,
      save,
      saveAs,
      restoreRecovery,
      discardRecovery,
    }),
    [
      confirmDiscard,
      createMap,
      openMap,
      openDropped,
      save,
      saveAs,
      restoreRecovery,
      discardRecovery,
    ],
  );
}
