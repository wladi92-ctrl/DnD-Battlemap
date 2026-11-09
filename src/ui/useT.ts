import { useCallback } from 'react';
import { translate, type MessageKey } from '../i18n';
import { useSettings } from './state/settingsStore';

/** Liefert eine an die aktuelle Sprache gebundene Übersetzungsfunktion. */
export function useT() {
  const locale = useSettings((s) => s.locale);
  return useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );
}
