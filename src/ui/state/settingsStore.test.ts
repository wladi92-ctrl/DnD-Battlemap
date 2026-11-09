import { beforeEach, describe, expect, it } from 'vitest';
import { clampScale, defaultSettings, parseSettings, useSettings } from './settingsStore';

describe('settingsStore', () => {
  beforeEach(() => useSettings.getState().reset());

  it('verwirft ungültige Werte feldweise', () => {
    expect(
      parseSettings({
        theme: 'neon',
        locale: 'en',
        uiScale: 9,
        diagonalRule: 'variant',
        showMeters: 'ja',
        autosaveSeconds: 7,
      }),
    ).toEqual({ ...defaultSettings, locale: 'en', uiScale: 1.75, diagonalRule: 'variant' });
    expect(parseSettings(null)).toEqual(defaultSettings);
    expect(parseSettings('kaputt')).toEqual(defaultSettings);
  });

  it('rastet die Skalierung auf 5-%-Schritte und Grenzen', () => {
    expect(clampScale(1.03)).toBe(1.05);
    expect(clampScale(0.1)).toBe(0.75);
    expect(clampScale(Number.NaN)).toBe(1);
  });

  it('speichert Änderungen in localStorage', () => {
    useSettings.getState().setTheme('dark');
    useSettings.getState().setUiScale(1.25);
    const stored = JSON.parse(localStorage.getItem('dnd-battlemap.settings.v1') ?? '{}');
    expect(stored).toEqual({ ...defaultSettings, theme: 'dark', uiScale: 1.25 });
  });
});
