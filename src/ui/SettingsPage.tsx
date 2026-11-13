import { useId } from 'react';
import { COVERAGE_RULES, type CoverageRule } from '../core/aoe';
import { diagonalRules, type DiagonalRule } from '../core/distance';
import { locales, isLocale, type MessageKey } from '../i18n';
import {
  autosaveIntervals,
  themeSettings,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  UI_SCALE_STEP,
  useSettings,
  type AutosaveSeconds,
  type ThemeSetting,
} from './state/settingsStore';
import { KeymapCard } from './settings/KeymapCard';
import { LibraryTransferCard } from './settings/LibraryTransferCard';
import { useT } from './useT';

const themeLabels: Record<ThemeSetting, MessageKey> = {
  system: 'settings.theme.system',
  light: 'settings.theme.light',
  dark: 'settings.theme.dark',
  contrast: 'settings.theme.contrast',
};

const localeLabels: Record<keyof typeof locales, MessageKey> = { de: 'lang.de', en: 'lang.en' };

export function SettingsPage() {
  const t = useT();
  const id = useId();
  const s = useSettings();

  const intervalLabel = (sec: AutosaveSeconds) =>
    sec < 60
      ? t('settings.autosave.seconds', { n: sec })
      : sec === 60
        ? t('settings.autosave.minute')
        : t('settings.autosave.minutes', { n: sec / 60 });

  return (
    <section className="page">
      <h1>{t('settings.heading')}</h1>
      <div className="card">
        <h2>{t('settings.section.appearance')}</h2>
        <div className="field">
          <label htmlFor={`${id}-theme`}>{t('settings.theme')}</label>
          <select
            id={`${id}-theme`}
            value={s.theme}
            onChange={(e) => s.setTheme(e.target.value as ThemeSetting)}
          >
            {themeSettings.map((th) => (
              <option key={th} value={th}>
                {t(themeLabels[th])}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-locale`}>{t('settings.language')}</label>
          <select
            id={`${id}-locale`}
            value={s.locale}
            onChange={(e) => {
              if (isLocale(e.target.value)) s.setLocale(e.target.value);
            }}
          >
            {(Object.keys(locales) as (keyof typeof locales)[]).map((l) => (
              <option key={l} value={l}>
                {t(localeLabels[l])}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-scale`}>{t('settings.uiScale')}</label>
          <div className="field-inline">
            <input
              id={`${id}-scale`}
              type="range"
              min={UI_SCALE_MIN}
              max={UI_SCALE_MAX}
              step={UI_SCALE_STEP}
              value={s.uiScale}
              onChange={(e) => s.setUiScale(Number(e.target.value))}
            />
            <output htmlFor={`${id}-scale`}>
              {t('settings.uiScale.value', { percent: Math.round(s.uiScale * 100) })}
            </output>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>{t('settings.section.rules')}</h2>
        <div className="field">
          <label htmlFor={`${id}-diag`}>{t('settings.diagonalRule')}</label>
          <select
            id={`${id}-diag`}
            value={s.diagonalRule}
            onChange={(e) => s.setDiagonalRule(e.target.value as DiagonalRule)}
          >
            {diagonalRules.map((r) => (
              <option key={r} value={r}>
                {t(`rule.${r}` as MessageKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-cov`}>{t('settings.coverageRule')}</label>
          <select
            id={`${id}-cov`}
            value={s.coverageRule}
            onChange={(e) => s.setCoverageRule(e.target.value as CoverageRule)}
          >
            {COVERAGE_RULES.map((r) => (
              <option key={r} value={r}>
                {t(`coverage.${r}` as MessageKey)}
              </option>
            ))}
          </select>
        </div>
        <label className="panel-check">
          <input
            type="checkbox"
            checked={s.showMeters}
            onChange={(e) => s.setShowMeters(e.target.checked)}
          />
          {t('settings.showMeters')}
        </label>
      </div>

      <div className="card">
        <h2>{t('settings.section.data')}</h2>
        <div className="field">
          <label htmlFor={`${id}-autosave`}>{t('settings.autosave')}</label>
          <select
            id={`${id}-autosave`}
            value={s.autosaveSeconds}
            onChange={(e) => s.setAutosaveSeconds(Number(e.target.value) as AutosaveSeconds)}
          >
            {autosaveIntervals.map((sec) => (
              <option key={sec} value={sec}>
                {intervalLabel(sec)}
              </option>
            ))}
          </select>
        </div>
        <label className="panel-check">
          <input
            type="checkbox"
            checked={s.showPerformance}
            onChange={(e) => s.setShowPerformance(e.target.checked)}
          />
          {t('settings.showPerformance')}
        </label>
      </div>

      <KeymapCard />

      <LibraryTransferCard />

      <div className="field-inline">
        <button type="button" className="btn" onClick={s.reset}>
          {t('settings.reset')}
        </button>
        <span className="muted">{t('settings.saved')}</span>
      </div>
    </section>
  );
}
