/** Elementbibliothek: Suche, Kategorien, Vorschaubilder, eigene Elemente importieren. */
import { useId, useMemo, useRef, useState } from 'react';
import { CATEGORY_IDS } from '../../data/elements/categories';
import {
  builtinElements,
  builtinInfo,
  customInfo,
  elementDataUrl,
  searchElements,
  type ElementInfo,
} from '../../data/elements';
import type { MessageKey } from '../../i18n';
import { useEditorStore } from '../state/editorStore';
import { useMapStore } from '../state/mapStore';
import { useSettings } from '../state/settingsStore';
import { useViewStore } from '../state/viewStore';
import { useT } from '../useT';
import { setTool } from './editorTools';
import { ImportElementDialog } from './ImportElementDialog';
import { useAssetUrls } from './useAssetUrls';

const PAINT_TOOLS = ['brush', 'rect', 'line', 'fill'];

export function LibraryPanel() {
  const t = useT();
  const id = useId();
  const locale = useSettings((s) => s.locale);
  const custom = useMapStore((s) => s.doc?.customElements);
  const elementId = useEditorStore((s) => s.elementId);
  const paintMode = useEditorStore((s) => s.paintMode);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const assetUrls = useAssetUrls();

  const catName = (c: string) => t(`category.${c}` as MessageKey);
  const items = useMemo<ElementInfo[]>(
    () => [
      ...builtinElements.map((e) => builtinInfo(e, locale)),
      ...(custom ?? []).map(customInfo),
    ],
    [locale, custom],
  );
  const filtered = searchElements(items, query, category || null, catName);

  const choose = (e: ElementInfo) => {
    useEditorStore.getState().selectElement(e.id, e.layer);
    if (!PAINT_TOOLS.includes(useViewStore.getState().tool)) setTool('brush');
  };

  // Pfeiltasten bewegen den Fokus innerhalb der Kachelliste.
  const onGridKey = (e: React.KeyboardEvent) => {
    const buttons = [...(gridRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const perRow = Math.max(
      1,
      Math.round((gridRef.current?.clientWidth ?? 1) / (buttons[0]?.offsetWidth || 1)),
    );
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: perRow, ArrowUp: -perRow }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    buttons[Math.min(buttons.length - 1, Math.max(0, i + delta))]?.focus();
  };

  const thumb = (e: ElementInfo) =>
    e.custom ? assetUrls.get(e.asset ?? '') : elementDataUrl(e.id);
  const tabStop = filtered.find((e) => e.id === elementId)?.id ?? filtered[0]?.id;

  return (
    <aside className="library-panel" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{t('library.heading')}</h2>
      <input
        type="search"
        aria-label={t('library.search')}
        placeholder={t('library.search')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <select
        aria-label={t('library.category')}
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        <option value="">{t('library.allCategories')}</option>
        {CATEGORY_IDS.map((c) => (
          <option key={c} value={c}>
            {catName(c)}
          </option>
        ))}
      </select>
      <p className="muted small" aria-live="polite">
        {t('library.count', { count: filtered.length })}
      </p>
      <div
        className="library-grid"
        ref={gridRef}
        role="group"
        aria-label={t('library.heading')}
        onKeyDown={onGridKey}
      >
        {filtered.map((e) => {
          const selected = paintMode === 'element' && e.id === elementId;
          const src = thumb(e);
          return (
            <button
              key={e.id}
              type="button"
              className="library-item"
              aria-pressed={selected}
              tabIndex={e.id === tabStop ? 0 : -1}
              title={`${e.name} · ${catName(e.category)} · ${e.w}×${e.h}`}
              onClick={() => choose(e)}
            >
              {src ? (
                <img src={src} alt="" loading="lazy" draggable={false} />
              ) : (
                <span className="library-missing">?</span>
              )}
              <span>{e.name}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="btn library-import" onClick={() => setImportOpen(true)}>
        {t('library.import')}
      </button>
      {importOpen && (
        <ImportElementDialog onClose={() => setImportOpen(false)} onCreated={choose} />
      )}
    </aside>
  );
}
