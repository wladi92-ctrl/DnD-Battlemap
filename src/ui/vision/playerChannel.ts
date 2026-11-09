/**
 * Verbindung zwischen GM-Fenster und Spieleransicht – rein lokal über einen BroadcastChannel
 * (gleiche Herkunft, kein Netzwerk). Das GM-Fenster schickt ein für Spieler gefiltertes
 * Dokument und die Sichtmaske; Bilder nur, wenn sie sich ändern oder die Ansicht neu startet.
 */
import { isTauri } from '@tauri-apps/api/core';
import { MASK_VISIBLE } from '../../core/vision';
import { computeVision, playerDocument, restrictsPlayers } from '../../editor/vision';
import { translate } from '../../i18n';
import type { MapDocument } from '../../storage/mapDocument';
import { useMapStore } from '../state/mapStore';
import { useSettings } from '../state/settingsStore';

export const PLAYER_CHANNEL = 'dnd-battlemap-player';
export const PLAYER_WINDOW = 'player';

export type PlayerMessage =
  | { type: 'hello' }
  | { type: 'bye' }
  | { type: 'state'; doc: MapDocument | null; mask: Uint8Array | null }
  | { type: 'assets'; assets: Map<string, Uint8Array> };

/** Spieler-Sicht eines Dokuments: gefiltertes Dokument und Maske (null = alles sichtbar). */
export function playerState(doc: MapDocument): { doc: MapDocument; mask: Uint8Array | null } {
  if (!restrictsPlayers(doc)) {
    const all = new Uint8Array(doc.grid.cols * doc.grid.rows).fill(MASK_VISIBLE);
    return { doc: playerDocument(doc, all), mask: null };
  }
  const v = computeVision(doc);
  return { doc: playerDocument(doc, v.mask), mask: v.mask };
}

/**
 * GM-Seite: sendet Änderungen an geöffnete Spieleransichten (gebündelt, höchstens ~10× pro
 * Sekunde). Liefert eine Funktion zum Beenden.
 */
export function startPlayerBroadcast(): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(PLAYER_CHANNEL);
  let connected = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastAssets: ReadonlyMap<string, Uint8Array> | null = null;

  const sendState = () => {
    timer = null;
    if (!connected) return;
    const { doc, assets } = useMapStore.getState();
    if (assets !== lastAssets) {
      lastAssets = assets;
      channel.postMessage({ type: 'assets', assets: new Map(assets) } satisfies PlayerMessage);
    }
    const st = doc ? playerState(doc) : { doc: null, mask: null };
    channel.postMessage({ type: 'state', doc: st.doc, mask: st.mask } satisfies PlayerMessage);
  };
  const schedule = () => {
    if (connected && !timer) timer = setTimeout(sendState, 100);
  };

  channel.onmessage = (e: MessageEvent<PlayerMessage>) => {
    if (e.data?.type === 'hello') {
      connected = true;
      lastAssets = null; // neue Ansicht: Bilder erneut senden
      schedule();
    } else if (e.data?.type === 'bye') {
      connected = false;
    }
  };
  const off = useMapStore.subscribe((s, prev) => {
    if (s.doc !== prev.doc || s.assets !== prev.assets) schedule();
  });
  return () => {
    off();
    if (timer) clearTimeout(timer);
    channel.close();
  };
}

/** Spieleransicht öffnen (Desktop: eigenes Fenster; Browser: Popup) oder in den Vordergrund holen. */
export async function openPlayerView(): Promise<void> {
  const title = translate(useSettings.getState().locale, 'player.title');
  if (isTauri()) {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const existing = await WebviewWindow.getByLabel(PLAYER_WINDOW);
    if (existing) {
      await existing.setFocus();
      return;
    }
    new WebviewWindow(PLAYER_WINDOW, {
      url: 'index.html#player',
      title,
      width: 1280,
      height: 800,
      center: true,
    });
    return;
  }
  window.open(`${location.pathname}#player`, 'dnd-battlemap-player', 'popup,width=1280,height=800');
}

/** Beim Schließen des GM-Fensters die Spieleransicht mitschließen (Desktop). */
export async function closePlayerView(): Promise<void> {
  if (!isTauri()) return;
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const w = await WebviewWindow.getByLabel(PLAYER_WINDOW);
  await w?.destroy();
}
