import { measurePath } from '../../core/distance';
import { formatDistance } from '../../core/units';
import { resolveElement } from '../../data/elements';
import { objectsAt } from '../../editor/ops';
import type { MessageKey } from '../../i18n';
import { layerState } from '../../storage/mapDocument';
import { useMapStore } from '../state/mapStore';
import { useSettings } from '../state/settingsStore';
import { rulerPath, useViewStore } from '../state/viewStore';
import { useT } from '../useT';
import { useEffect, useState } from 'react';
import { getActiveRenderer } from './rendererRegistry';

export function StatusBar() {
  const t = useT();
  const doc = useMapStore((s) => s.doc);
  const dirty = useMapStore((s) => s.dirty);
  const fileName = useMapStore((s) => s.fileName);
  const hover = useViewStore((s) => s.hoverCell);
  const cursor = useViewStore((s) => s.cursorCell);
  const ruler = useViewStore((s) => s.ruler);
  const { diagonalRule, showMeters, locale, showPerformance } = useSettings();
  if (!doc) return null;

  const fmt = (feet: number) => formatDistance(feet, { locale, showMeters });
  const cell = hover ?? cursor;
  const path = rulerPath(ruler);
  const { cols, rows, feetPerCell } = doc.grid;

  return (
    <footer className="status-bar">
      {showPerformance && <PerformanceInfo />}
      <span className="status-cell">
        {/* Anzeige 1-basiert, intern 0-basiert */}
        {cell ? t('status.cell', { x: cell.x + 1, y: cell.y + 1 }) : '–'}
      </span>
      {cell && <HoverInfo x={cell.x} y={cell.y} />}
      {path.length > 1 && (
        <span>
          {t('status.ruler', {
            distance: fmt(measurePath(path, diagonalRule, feetPerCell).feet),
          })}
        </span>
      )}
      <span>
        {t('status.size', {
          cols,
          rows,
          width: fmt(cols * feetPerCell),
          height: fmt(rows * feetPerCell),
        })}
      </span>
      <span>{t('status.rule', { rule: t(`rule.short.${diagonalRule}` as MessageKey) })}</span>
      <span className="status-file">
        {fileName ?? doc.name}
        {dirty && <span className="status-dirty"> • {t('status.unsaved')}</span>}
      </span>
    </footer>
  );
}

/** Oberstes Objekt und GM-Notiz unter dem Zeiger/Fokusfeld. */
function HoverInfo({ x, y }: { x: number; y: number }) {
  const t = useT();
  const doc = useMapStore((s) => s.doc);
  const locale = useSettings((s) => s.locale);
  if (!doc) return null;
  const top = objectsAt(doc, x + 0.5, y + 0.5)[0];
  const floorId = doc.floor[y * doc.grid.cols + x];
  const elementId = top?.element ?? floorId;
  const name = elementId ? resolveElement(elementId, doc.customElements, locale)?.name : undefined;
  const note = layerState(doc, 'gm').visible
    ? doc.notes.find((n) => n.x === x && n.y === y)
    : undefined;
  return (
    <>
      {name && <span>{name}</span>}
      {note && (
        <span className="status-note" title={note.text}>
          {t('status.note', {
            text: note.text.length > 60 ? `${note.text.slice(0, 60)}…` : note.text,
          })}
        </span>
      )}
    </>
  );
}

/** Bildaufbauzeit (Mittel/95. Perzentil) und daraus mögliche Bildrate; zweimal pro Sekunde. */
function PerformanceInfo() {
  const t = useT();
  const [stats, setStats] = useState(() => getActiveRenderer()?.renderStats() ?? null);
  useEffect(() => {
    const id = setInterval(() => setStats(getActiveRenderer()?.renderStats() ?? null), 500);
    return () => clearInterval(id);
  }, []);
  if (!stats?.frames) return <span>{t('status.perfWaiting')}</span>;
  const fps = Math.min(999, Math.floor(1000 / Math.max(0.1, stats.p95Ms)));
  return (
    <span title={t('status.perfHint')}>
      {t('status.perf', {
        avg: stats.avgMs.toFixed(1),
        p95: stats.p95Ms.toFixed(1),
        fps,
      })}
    </span>
  );
}
