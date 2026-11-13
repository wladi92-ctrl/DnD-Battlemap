/**
 * Vollbildmodus des GM-Fensters: Fenster im Vollbild (Desktop: Tauri, Browser: Fullscreen-API)
 * und Kartenansicht ohne Seitenleisten. Verlässt der Nutzer das Vollbild auf anderem Weg
 * (z. B. Esc im Browser), folgt der Modus.
 */
import { isTauri } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import { useViewStore } from './state/viewStore';

async function setWindowFullscreen(on: boolean): Promise<void> {
  try {
    if (isTauri()) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setFullscreen(on);
    } else if (on && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
    } else if (!on && document.fullscreenElement) {
      await document.exitFullscreen?.();
    }
  } catch {
    // Fenster-Vollbild nicht verfügbar (z. B. ohne Nutzeraktion im Browser): der
    // Kartenmodus ohne Seitenleisten funktioniert trotzdem.
  }
}

export function setFullscreen(on: boolean): void {
  useViewStore.getState().setFullscreenFlag(on);
  void setWindowFullscreen(on);
}

export function toggleFullscreen(): void {
  setFullscreen(!useViewStore.getState().fullscreen);
}

/** Browser: Verlassen des Vollbilds per Esc übernehmen. */
export function useFullscreenSync(): void {
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && useViewStore.getState().fullscreen && !isTauri())
        useViewStore.getState().setFullscreenFlag(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
}
