/**
 * Globale UI-Einstellungen (Theme, Sprache, Skalierung).
 * Persistenz über localStorage der WebView – rein lokal, Fehler werden toleriert.
 */
import { create } from 'zustand';
import { COVERAGE_RULES, type CoverageRule } from '../../core/aoe';
import { diagonalRules, type DiagonalRule } from '../../core/distance';
import { TIE_RULES, type TieRule } from '../../editor/combat';
import { defaultLocale, isLocale, type Locale } from '../../i18n';
import { sanitizeOverrides, type KeyOverrides } from '../keymap';

export type ThemeSetting = 'system' | 'light' | 'dark' | 'contrast';
export const themeSettings: readonly ThemeSetting[] = ['system', 'light', 'dark', 'contrast'];

export const UI_SCALE_MIN = 0.75;
export const UI_SCALE_MAX = 1.75;
export const UI_SCALE_STEP = 0.05;

/** Wählbare Autosave-Intervalle in Sekunden. */
export const autosaveIntervals = [30, 60, 120, 300] as const;
export type AutosaveSeconds = (typeof autosaveIntervals)[number];

export interface Settings {
  theme: ThemeSetting;
  locale: Locale;
  uiScale: number;
  /** Diagonalregel für Lineal und Bewegung. */
  diagonalRule: DiagonalRule;
  /** Distanzen zusätzlich in Metern anzeigen (5 ft = 1,5 m). */
  showMeters: boolean;
  autosaveSeconds: AutosaveSeconds;
  /** Flächenregel für Effekte: halbe Abdeckung (Standard) oder Feldmitte. */
  coverageRule: CoverageRule;
  /** Gleichstand bei der Initiative. */
  tieRule: TieRule;
  /** Tote Kreaturen in der Zugreihenfolge überspringen. */
  skipDead: boolean;
  /** Kamera folgt dem Token, das am Zug ist. */
  cameraFollow: boolean;
  /** Eigene Tastenbelegung (nur Abweichungen vom Standard). */
  keymap: KeyOverrides;
}

export const defaultSettings: Settings = {
  theme: 'system',
  locale: defaultLocale,
  uiScale: 1,
  diagonalRule: 'standard',
  showMeters: false,
  autosaveSeconds: 60,
  coverageRule: 'half',
  tieRule: 'bonus',
  skipDead: true,
  cameraFollow: true,
  keymap: {},
};

const STORAGE_KEY = 'dnd-battlemap.settings.v1';

export function clampScale(value: number): number {
  if (!Number.isFinite(value)) return defaultSettings.uiScale;
  const stepped = Math.round(value / UI_SCALE_STEP) * UI_SCALE_STEP;
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, Number(stepped.toFixed(2))));
}

/** Liest gespeicherte Einstellungen und verwirft ungültige Felder einzeln. */
export function parseSettings(raw: unknown): Settings {
  const result = { ...defaultSettings };
  if (typeof raw !== 'object' || raw === null) return result;
  const r = raw as Record<string, unknown>;
  if (themeSettings.includes(r.theme as ThemeSetting)) result.theme = r.theme as ThemeSetting;
  if (isLocale(r.locale)) result.locale = r.locale;
  if (typeof r.uiScale === 'number') result.uiScale = clampScale(r.uiScale);
  if (diagonalRules.includes(r.diagonalRule as DiagonalRule)) {
    result.diagonalRule = r.diagonalRule as DiagonalRule;
  }
  if (typeof r.showMeters === 'boolean') result.showMeters = r.showMeters;
  if (autosaveIntervals.includes(r.autosaveSeconds as AutosaveSeconds)) {
    result.autosaveSeconds = r.autosaveSeconds as AutosaveSeconds;
  }
  if (COVERAGE_RULES.includes(r.coverageRule as CoverageRule)) {
    result.coverageRule = r.coverageRule as CoverageRule;
  }
  if (TIE_RULES.includes(r.tieRule as TieRule)) result.tieRule = r.tieRule as TieRule;
  if (typeof r.skipDead === 'boolean') result.skipDead = r.skipDead;
  if (typeof r.cameraFollow === 'boolean') result.cameraFollow = r.cameraFollow;
  result.keymap = sanitizeOverrides(r.keymap);
  return result;
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseSettings(JSON.parse(raw)) : { ...defaultSettings };
  } catch {
    return { ...defaultSettings };
  }
}

function save(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Speicher nicht verfügbar: Einstellungen gelten nur für diese Sitzung.
  }
}

interface SettingsState extends Settings {
  setTheme: (theme: ThemeSetting) => void;
  setLocale: (locale: Locale) => void;
  setUiScale: (scale: number) => void;
  setDiagonalRule: (rule: DiagonalRule) => void;
  setShowMeters: (show: boolean) => void;
  setAutosaveSeconds: (seconds: AutosaveSeconds) => void;
  setCoverageRule: (rule: CoverageRule) => void;
  setCombatOptions: (o: Partial<Pick<Settings, 'tieRule' | 'skipDead' | 'cameraFollow'>>) => void;
  setKeymap: (keymap: KeyOverrides) => void;
  reset: () => void;
}

export const useSettings = create<SettingsState>((set) => ({
  ...load(),
  setTheme: (theme) => set({ theme }),
  setLocale: (locale) => set({ locale }),
  setUiScale: (scale) => set({ uiScale: clampScale(scale) }),
  setDiagonalRule: (diagonalRule) => set({ diagonalRule }),
  setShowMeters: (showMeters) => set({ showMeters }),
  setAutosaveSeconds: (autosaveSeconds) => set({ autosaveSeconds }),
  setCoverageRule: (coverageRule) => set({ coverageRule }),
  setCombatOptions: (o) => set(o),
  setKeymap: (keymap) => set({ keymap }),
  reset: () => set({ ...defaultSettings }),
}));

useSettings.subscribe((s) =>
  save({
    theme: s.theme,
    locale: s.locale,
    uiScale: s.uiScale,
    diagonalRule: s.diagonalRule,
    showMeters: s.showMeters,
    autosaveSeconds: s.autosaveSeconds,
    coverageRule: s.coverageRule,
    tieRule: s.tieRule,
    skipDead: s.skipDead,
    cameraFollow: s.cameraFollow,
    keymap: s.keymap,
  }),
);
