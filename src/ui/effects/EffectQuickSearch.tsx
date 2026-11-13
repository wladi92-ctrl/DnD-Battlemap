/**
 * Schnellsuche (Strg+F): Effekt eintippen, mit Pfeiltasten wählen, Eingabe aktiviert ihn als
 * Effekt-Werkzeug – auch im Vollbild, ohne Seitenleiste. Danach liegt der Fokus wieder auf der
 * Karte, sodass der Effekt sofort platziert werden kann.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { loadEffectSources, slotLevels, type EffectSource } from '../../data/srd/effects';
import { templateFromSource } from '../../editor/effects';
import type { MessageKey } from '../../i18n';
import { armEffect } from '../map/effectTools';
import { useLibraryStore } from '../state/libraryStore';
import { useNoticeStore } from '../state/noticeStore';
import { useViewStore } from '../state/viewStore';
import { useT } from '../useT';
import { chooseSlot, parseQuickQuery, searchEffects } from './quickSearch';

export function EffectQuickSearch() {
  const open = useViewStore((s) => s.quickSearch);
  return open ? <QuickSearchBox /> : null;
}

function close(refocusMap: boolean) {
  useViewStore.getState().setQuickSearch(false);
  if (refocusMap)
    setTimeout(() => document.querySelector<HTMLElement>('[role="application"]')?.focus(), 0);
}

function QuickSearchBox() {
  const t = useT();
  const id = useId();
  const [srd, setSrd] = useState<EffectSource[]>([]);
  const custom = useLibraryStore((s) => s.effects);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void loadEffectSources().then((l) => alive && setSrd(l));
    void useLibraryStore.getState().load();
    inputRef.current?.focus();
    return () => {
      alive = false;
    };
  }, []);

  const tt = (k: MessageKey) => t(k);
  const results = useMemo(
    () => searchEffects([...custom, ...srd], query, tt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [custom, srd, query, t],
  );
  const wanted = parseQuickQuery(query).slot;
  const index = Math.min(active, Math.max(0, results.length - 1));

  const pick = (e: EffectSource) => {
    const slot = chooseSlot(e, wanted);
    armEffect(templateFromSource(e, slot));
    useNoticeStore
      .getState()
      .push(
        'info',
        slot !== undefined
          ? t('quickSearch.armedSlot', { name: e.name, slot })
          : t('quickSearch.armed', { name: e.name }),
      );
    close(true);
  };

  return (
    <div className="quick-search-backdrop" onMouseDown={() => close(true)}>
      <div
        className="quick-search"
        role="dialog"
        aria-label={t('quickSearch.heading')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={`${id}-list`}
          aria-activedescendant={results.length ? `${id}-opt-${index}` : undefined}
          aria-label={t('quickSearch.heading')}
          placeholder={t('quickSearch.placeholder')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const hit = results[index];
              if (hit) pick(hit);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              close(true);
            }
          }}
        />
        <ul className="quick-search-results" role="listbox" id={`${id}-list`}>
          {results.map((e, i) => {
            const slots = slotLevels(e);
            const slot = chooseSlot(e, wanted);
            return (
              <li
                key={e.id}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === index}
                className={i === index ? 'active' : undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(e)}
              >
                <strong>{e.name}</strong>
                <span className="muted small">
                  {' '}
                  · {t(`effectKind.${e.kind}` as MessageKey)} ·{' '}
                  {t(`shape.${e.shape}` as MessageKey)} {e.size} ft
                  {e.damage ? ` · ${t(`damage.${e.damage.type}` as MessageKey)}` : ''}
                  {slots.length > 1 && slot !== undefined
                    ? ` · ${t('quickSearch.slot', { slot })}`
                    : ''}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="small muted">
          {query.trim() && !results.length ? t('quickSearch.none') : t('quickSearch.hint')}
        </p>
      </div>
    </div>
  );
}
