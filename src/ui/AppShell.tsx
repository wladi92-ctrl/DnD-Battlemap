import { useEffect, useState } from 'react';
import type { MessageKey } from '../i18n';
import { AboutPage } from './AboutPage';
import { AppIcon } from './AppIcon';
import { MapWorkspace } from './map/MapWorkspace';
import { Notices } from './Notices';
import { SettingsPage } from './SettingsPage';
import { useT } from './useT';
import { useFullscreenSync } from './fullscreen';
import { useViewStore } from './state/viewStore';

export type PageId = 'map' | 'settings' | 'about';

/** Seiten in Navigationsreihenfolge; Alt+1…3 springt direkt dorthin. */
export const pages: readonly { id: PageId; label: MessageKey; key: string }[] = [
  { id: 'map', label: 'nav.map', key: '1' },
  { id: 'settings', label: 'nav.settings', key: '2' },
  { id: 'about', label: 'nav.about', key: '3' },
];

export function AppShell() {
  const t = useT();
  const [page, setPage] = useState<PageId>('map');
  // Vollbild gilt nur für die Kartenansicht (Einstellungen/Über zeigen den Kopf wieder).
  const fullscreen = useViewStore((s) => s.fullscreen) && page === 'map';
  useFullscreenSync();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const target = pages.find((p) => p.key === e.key);
      if (target) {
        e.preventDefault();
        setPage(target.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={fullscreen ? 'app fullscreen' : 'app'}>
      {!fullscreen && (
        <header className="app-header">
          <div className="app-brand">
            <AppIcon />
            <span>{t('app.title')}</span>
          </div>
          <nav className="app-nav" aria-label={t('nav.label')}>
            {pages.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-current={page === p.id ? 'page' : undefined}
                aria-keyshortcuts={`Alt+${p.key}`}
                onClick={() => setPage(p.id)}
              >
                {t(p.label)}
              </button>
            ))}
          </nav>
        </header>
      )}
      {/* Der Arbeitsbereich bleibt gemountet, damit Renderer und Kamera erhalten bleiben. */}
      <main className="app-main app-main-map" hidden={page !== 'map'}>
        <MapWorkspace />
      </main>
      {page === 'settings' && (
        <main className="app-main">
          <SettingsPage />
        </main>
      )}
      {page === 'about' && (
        <main className="app-main">
          <AboutPage />
        </main>
      )}
      <Notices />
    </div>
  );
}
