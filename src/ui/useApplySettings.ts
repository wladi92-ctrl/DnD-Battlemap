import { useEffect } from 'react';
import { useSettings, type ThemeSetting } from './state/settingsStore';

const darkQuery = '(prefers-color-scheme: dark)';

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(darkQuery).matches;
}

/** Löst "system" in ein konkretes Theme auf. */
export function resolveTheme(setting: ThemeSetting, prefersDark: boolean) {
  if (setting === 'system') return prefersDark ? 'dark' : 'light';
  return setting;
}

/** Überträgt Theme, Sprache und Skalierung auf das <html>-Element. */
export function useApplySettings() {
  const theme = useSettings((s) => s.theme);
  const locale = useSettings((s) => s.locale);
  const uiScale = useSettings((s) => s.uiScale);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      root.dataset.theme = resolveTheme(theme, systemPrefersDark());
    };
    apply();
    if (theme !== 'system' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(darkQuery);
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);
}
