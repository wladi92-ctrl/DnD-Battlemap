/**
 * Schwebende Leiste im Vollbild: Vollbild beenden, Schnellsuche öffnen und die Optionen des
 * aktiven Werkzeugs (Effekt, Zeichnen), die sonst in der rechten Seitenleiste stehen.
 */
import { EffectToolPanel } from '../effects/EffectPanels';
import { buildKeymap, keyLabel } from '../keymap';
import { setFullscreen } from '../fullscreen';
import { useSettings } from '../state/settingsStore';
import { useViewStore } from '../state/viewStore';
import { useT } from '../useT';
import { DrawPanel } from './DrawPanel';

export function FullscreenPanel() {
  const t = useT();
  const keymap = buildKeymap(useSettings((s) => s.keymap));
  const exitKeys = keymap.fullscreen.map((k) => keyLabel(k, t)).join(', ');
  return (
    <aside className="fullscreen-panel" aria-label={t('fullscreen.panel')}>
      <div className="fullscreen-actions">
        <button
          type="button"
          className="btn"
          aria-keyshortcuts="Control+F"
          onClick={() => useViewStore.getState().setQuickSearch(true)}
        >
          {t('quickSearch.open')}
        </button>
        <button type="button" className="btn" onClick={() => setFullscreen(false)}>
          {exitKeys ? t('fullscreen.exitKey', { key: exitKeys }) : t('fullscreen.exit')}
        </button>
      </div>
      <EffectToolPanel />
      <DrawPanel />
    </aside>
  );
}
