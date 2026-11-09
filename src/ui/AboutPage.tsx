import { useEffect, useId, useMemo, useState } from 'react';
import { SRD_ATTRIBUTION, SRD_LICENSE } from '../data/licenses/srd-attribution';
import { detectGraphicsSupport, type GraphicsSupport } from '../render/graphicsSupport';
import { useT } from './useT';

/** Struktur von src/data/licenses/third-party.json (erzeugt durch scripts/gen-licenses.mjs). */
export interface ThirdPartyPackage {
  name: string;
  version: string;
  license: string;
  ecosystem: 'npm' | 'cargo';
  repository?: string;
  textId?: string;
}
export interface ThirdPartyData {
  packages: ThirdPartyPackage[];
  texts: Record<string, string>;
}

const emptyData: ThirdPartyData = { packages: [], texts: {} };

export function AboutPage() {
  const t = useT();
  const id = useId();
  const [graphics, setGraphics] = useState<GraphicsSupport | null>(null);
  const [data, setData] = useState<ThirdPartyData | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let active = true;
    void detectGraphicsSupport().then((g) => active && setGraphics(g));
    // Lizenzliste ist groß und wird erst beim Öffnen der Seite geladen (eigener Chunk).
    void import('../data/licenses/third-party.json').then(
      (m) => active && setData(m.default as ThirdPartyData),
    );
    return () => {
      active = false;
    };
  }, []);

  const packages = useMemo(() => {
    const all = (data ?? emptyData).packages;
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (p) => p.name.toLowerCase().includes(q) || p.license.toLowerCase().includes(q),
    );
  }, [data, filter]);

  const graphicsLabel =
    graphics === null
      ? t('about.graphics.checking')
      : graphics.kind === 'webgl'
        ? t('about.graphics.webgl', { version: graphics.version })
        : graphics.kind === 'canvas'
          ? t('about.graphics.canvas')
          : t('about.graphics.none');

  return (
    <section className="page">
      <h1>{t('about.heading')}</h1>
      <div className="card">
        <h2>{t('app.title')}</h2>
        <p>{t('app.subtitle')}</p>
        <p className="muted">{t('about.version', { version: __APP_VERSION__ })}</p>
        <p>
          {t('about.graphics')}: <span data-testid="graphics">{graphicsLabel}</span>
        </p>
      </div>

      <div className="card">
        <h2>{t('about.srd.heading')}</h2>
        <p className="attribution" lang="en">
          {SRD_ATTRIBUTION}
        </p>
        <p className="muted">
          {SRD_LICENSE.name} – {t('about.srd.note')}
        </p>
      </div>

      <div className="card">
        <h2>{t('about.assets.heading')}</h2>
        <p>{t('about.assets.text')}</p>
      </div>

      <div className="card">
        <h2>
          {t('about.thirdParty.heading')}
          {data && (
            <span className="badge">
              {t('about.thirdParty.count', { count: data.packages.length })}
            </span>
          )}
        </h2>
        <div className="field">
          <label htmlFor={`${id}-filter`}>{t('about.thirdParty.filter')}</label>
          <input
            id={`${id}-filter`}
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        {data === null ? (
          <p className="muted">{t('about.thirdParty.loading')}</p>
        ) : packages.length === 0 ? (
          <p className="muted">{t('about.thirdParty.empty')}</p>
        ) : (
          <ul className="license-list">
            {packages.map((p) => (
              <LicenseEntry
                key={`${p.ecosystem}:${p.name}@${p.version}`}
                pkg={p}
                text={p.textId ? data.texts[p.textId] : undefined}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function LicenseEntry({ pkg, text }: { pkg: ThirdPartyPackage; text: string | undefined }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <li>
      <details onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          {pkg.name} <span className="muted">{pkg.version}</span>
          <span className="badge">{pkg.ecosystem}</span>
          <span className="badge" title={t('about.thirdParty.license')}>
            {pkg.license}
          </span>
        </summary>
        {open &&
          (text ? (
            <pre className="license-text">{text}</pre>
          ) : (
            <p className="muted">{t('about.thirdParty.noText')}</p>
          ))}
      </details>
    </li>
  );
}
