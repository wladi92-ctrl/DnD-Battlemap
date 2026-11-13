/**
 * App-weite Abläufe: Wiederherstellung beim Start, periodischer Autosave,
 * Fenstertitel und Schutz vor Schließen mit ungespeicherten Änderungen.
 */
import { isTauri } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import { startAutosave } from '../storage/autosave';
import { getFileAccess } from '../storage/fileAccess';
import { decodeProject } from '../storage/projectFile';
import { decodeCampaign, isCampaignFile } from '../storage/campaignFile';
import { currentAutosaveSnapshot } from './autosaveSnapshot';
import { useCampaignStore } from './state/campaignStore';
import { reportError } from './map/useFileActions';
import { useMapStore } from './state/mapStore';
import { useNoticeStore } from './state/noticeStore';
import { useRecoveryStore } from './state/recoveryStore';
import { useSettings } from './state/settingsStore';
import { useT } from './useT';
import { closePlayerView, startPlayerBroadcast } from './vision/playerChannel';

export function useAppLifecycle() {
  const t = useT();
  const autosaveSeconds = useSettings((s) => s.autosaveSeconds);
  const mapName = useMapStore((s) => s.doc?.name ?? null);
  const campaignName = useCampaignStore((s) => s.campaign?.name ?? null);
  const name = campaignName && mapName ? `${campaignName} · ${mapName}` : mapName;
  const mapDirty = useMapStore((s) => s.dirty);
  const campaignDirty = useCampaignStore((s) => s.dirty);
  const dirty = mapDirty || campaignDirty;

  // Wiederherstellung nach Absturz: vorhandenen Autosave beim Start anbieten.
  useEffect(() => {
    let active = true;
    const fa = getFileAccess();
    fa.autosaveRead()
      .then((bytes) => {
        if (!active || !bytes || useMapStore.getState().doc) return;
        try {
          if (isCampaignFile(bytes))
            useRecoveryStore.getState().setPendingCampaign(decodeCampaign(bytes));
          else useRecoveryStore.getState().setPending(decodeProject(bytes));
        } catch {
          // Unlesbare Sicherung (z. B. aus abgebrochenem Schreibvorgang) verwerfen.
          void fa.autosaveClear().catch(() => undefined);
        }
      })
      .catch((e: unknown) => reportError(t, e));
    return () => {
      active = false;
    };
    // Nur einmal beim Start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodischer Autosave.
  useEffect(() => {
    let warned = false;
    const handle = startAutosave({
      intervalMs: autosaveSeconds * 1000,
      getSnapshot: currentAutosaveSnapshot,
      write: (bytes) => getFileAccess().autosaveWrite(bytes),
      onError: () => {
        if (!warned) useNoticeStore.getState().push('error', t('notice.autosaveFailed'));
        warned = true;
      },
    });
    return handle.stop;
  }, [autosaveSeconds, t]);

  // Fenstertitel: "Name • – DnD Battlemap"
  useEffect(() => {
    const title = name ? `${name}${dirty ? ' •' : ''} – ${t('app.title')}` : t('app.title');
    document.title = title;
    if (isTauri()) {
      void import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => getCurrentWindow().setTitle(title))
        .catch(() => undefined);
    }
  }, [name, dirty, t]);

  // Unerwartete Fehler außerhalb von React (Ereignisse, Promises) melden statt still zu scheitern.
  useEffect(() => {
    const report = (message: string) => {
      // Harmlose Browser-Meldung beim Ändern der Fenstergröße.
      if (message.includes('ResizeObserver loop')) return;
      useNoticeStore.getState().push('error', t('crash.notice'), [message]);
    };
    const onError = (e: ErrorEvent) => report(e.message || String(e.error));
    const onRejection = (e: PromiseRejectionEvent) =>
      report(e.reason instanceof Error ? e.reason.message : String(e.reason));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [t]);

  // Spieleransicht mit Daten versorgen (lokal, BroadcastChannel).
  useEffect(() => startPlayerBroadcast(), []);

  // Schließen mit ungespeicherten Änderungen abfangen.
  useEffect(() => {
    if (!isTauri()) {
      const onBeforeUnload = (e: BeforeUnloadEvent) => {
        if (useMapStore.getState().dirty || useCampaignStore.getState().dirty) e.preventDefault();
      };
      window.addEventListener('beforeunload', onBeforeUnload);
      return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }
    let unlisten: (() => void) | null = null;
    let disposed = false;
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const off = await getCurrentWindow().onCloseRequested(async (event) => {
        const fa = getFileAccess();
        if (useMapStore.getState().dirty || useCampaignStore.getState().dirty) {
          const ok = await fa.confirm(
            t('confirm.closeUnsaved'),
            t('confirm.title'),
            t('confirm.closeOk'),
            t('common.cancel'),
          );
          if (!ok) {
            event.preventDefault();
            return;
          }
        }
        // Wiederherstellungsdaten nur behalten, wenn der Nutzer noch nicht entschieden hat.
        const rec = useRecoveryStore.getState();
        if (!rec.pending && !rec.pendingCampaign) await fa.autosaveClear().catch(() => undefined);
        // Spieleransicht gehört zum Hauptfenster und schließt mit.
        await closePlayerView().catch(() => undefined);
      });
      if (disposed) off();
      else unlisten = off;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [t]);
}
