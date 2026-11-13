/** Linke Seitenleiste mit Reitern: Elemente, Kreaturen (SRD + eigene), Charaktere, Effekte, Kampagne. */
import { useId, useRef, useState } from 'react';
import type { MessageKey } from '../../i18n';
import { CharacterPanel } from '../creatures/CharacterPanel';
import { EffectLibraryPanel } from '../effects/EffectLibraryPanel';
import { CreaturePanel } from '../creatures/CreaturePanel';
import { useT } from '../useT';
import { LibraryPanel } from './LibraryPanel';
import { CampaignPanel } from '../campaign/CampaignPanel';

const TABS = ['elements', 'creatures', 'characters', 'effects', 'campaign'] as const;
type Tab = (typeof TABS)[number];

export function LeftPanel() {
  const t = useT();
  const id = useId();
  const [tab, setTab] = useState<Tab>('elements');
  // Panels erst beim ersten Öffnen einbinden (SRD-Daten werden dann nachgeladen).
  const [opened, setOpened] = useState<ReadonlySet<Tab>>(new Set(['elements']));
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const open = (next: Tab) => {
    setTab(next);
    setOpened((s) => new Set(s).add(next));
  };

  const onKey = (e: React.KeyboardEvent) => {
    const i = TABS.indexOf(tab);
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = TABS[(i + delta + TABS.length) % TABS.length] as Tab;
    open(next);
    refs.current[next]?.focus();
  };

  return (
    <aside className="library-panel">
      <div className="side-tabs" role="tablist" aria-label={t('side.tabs')} onKeyDown={onKey}>
        {TABS.map((tb) => (
          <button
            key={tb}
            ref={(el) => {
              refs.current[tb] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-${tb}`}
            aria-selected={tab === tb}
            aria-controls={`${id}-${tb}-panel`}
            tabIndex={tab === tb ? 0 : -1}
            onClick={() => open(tb)}
          >
            {t(`side.${tb}` as MessageKey)}
          </button>
        ))}
      </div>
      {TABS.map((tb) => (
        <div
          key={tb}
          role="tabpanel"
          id={`${id}-${tb}-panel`}
          aria-labelledby={`${id}-${tb}`}
          hidden={tab !== tb}
          className="side-tab-panel"
        >
          {opened.has(tb) &&
            (tb === 'elements' ? (
              <LibraryPanel />
            ) : tb === 'creatures' ? (
              <CreaturePanel />
            ) : tb === 'characters' ? (
              <CharacterPanel />
            ) : tb === 'effects' ? (
              <EffectLibraryPanel />
            ) : (
              <CampaignPanel />
            ))}
        </div>
      ))}
    </aside>
  );
}
