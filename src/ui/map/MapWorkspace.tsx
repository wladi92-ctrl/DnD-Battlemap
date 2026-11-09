import { useEffect, useRef, useState } from 'react';
import { worldSize } from '../../core/grid';
import { formatNumber } from '../../core/units';
import { useMapStore } from '../state/mapStore';
import { useRecoveryStore } from '../state/recoveryStore';
import { useSettings } from '../state/settingsStore';
import { useViewStore } from '../state/viewStore';
import { isTypingTarget } from '../shortcuts';
import { ShortcutTable } from '../ShortcutTable';
import { useT } from '../useT';
import { MapCanvas } from './MapCanvas';
import { NewMapDialog } from './NewMapDialog';
import { PropertiesPanel } from './PropertiesPanel';
import { StatusBar } from './StatusBar';
import { Toolbar, ZOOM_STEP } from './Toolbar';
import { useFileActions } from './useFileActions';

export function MapWorkspace() {
  const doc = useMapStore((s) => s.doc);
  const actions = useFileActions();
  const [newOpen, setNewOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const requestNew = async () => {
    if (await actions.confirmDiscard()) setNewOpen(true);
  };

  // Tastenkürzel des Arbeitsbereichs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey) return;
      // Nur aktiv, solange der Arbeitsbereich sichtbar ist (nicht auf Einstellungen/Über).
      if (rootRef.current?.closest('[hidden]')) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        const map: Record<string, () => unknown> = {
          n: requestNew,
          o: actions.openMap,
          s: e.shiftKey ? actions.saveAs : actions.save,
        };
        const run = map[key];
        if (run) {
          e.preventDefault();
          void run();
        }
        return;
      }
      if (isTypingTarget(e.target)) return;
      const d = useMapStore.getState().doc;
      if (!d) return;
      const view = useViewStore.getState();
      const world = worldSize(d.grid);
      const center = { x: view.viewport.width / 2, y: view.viewport.height / 2 };
      const handlers: Record<string, () => void> = {
        h: () => view.setTool('pan'),
        r: () => view.setTool('ruler'),
        g: () => useMapStore.getState().updateGrid({ visible: !d.grid.visible }),
        '+': () => view.zoomAt(center, ZOOM_STEP, world),
        '=': () => view.zoomAt(center, ZOOM_STEP, world),
        '-': () => view.zoomAt(center, 1 / ZOOM_STEP, world),
        '0': () => view.fit(world),
      };
      const handler = handlers[key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="workspace" ref={rootRef}>
      <Toolbar
        onNew={() => void requestNew()}
        onOpen={() => void actions.openMap()}
        onSave={() => void actions.save()}
        onSaveAs={() => void actions.saveAs()}
      />
      {doc ? (
        <>
          <div className="workspace-body">
            <MapCanvas />
            <PropertiesPanel />
          </div>
          <StatusBar />
        </>
      ) : (
        <EmptyState onNew={() => void requestNew()} onOpen={() => void actions.openMap()} />
      )}
      {newOpen && (
        <NewMapDialog
          onClose={() => setNewOpen(false)}
          onCreate={(opts) => {
            actions.createMap(opts);
            setNewOpen(false);
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ onNew, onOpen }: { onNew: () => void; onOpen: () => void }) {
  const t = useT();
  const pending = useRecoveryStore((s) => s.pending);
  const locale = useSettings((s) => s.locale);
  const { restoreRecovery, discardRecovery } = useFileActions();

  const savedAt = pending?.recovery?.savedAt ? new Date(pending.recovery.savedAt) : null;
  const time =
    savedAt && !Number.isNaN(savedAt.getTime())
      ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(savedAt)
      : '–';

  return (
    <section className="page empty-state">
      {pending && (
        <div className="card recovery" role="alert">
          <h2>{t('recovery.heading')}</h2>
          <p>{t('recovery.text', { name: pending.doc.name, time })}</p>
          <p className="muted small">
            {pending.doc.grid.cols} × {pending.doc.grid.rows} ·{' '}
            {formatNumber(pending.doc.grid.feetPerCell, locale)} ft
          </p>
          <div className="field-inline">
            <button type="button" className="btn btn-primary" onClick={restoreRecovery}>
              {t('recovery.restore')}
            </button>
            <button type="button" className="btn" onClick={() => void discardRecovery()}>
              {t('recovery.discard')}
            </button>
          </div>
        </div>
      )}
      <h1>{t('start.heading')}</h1>
      <div className="card">
        <p>{t('start.intro')}</p>
        <div className="field-inline">
          <button type="button" className="btn btn-primary" onClick={onNew}>
            {t('file.new')}
          </button>
          <button type="button" className="btn" onClick={onOpen}>
            {t('file.open')}
          </button>
        </div>
        <p className="muted">{t('start.status')}</p>
        <p>
          <strong>{t('start.offline')}</strong>
        </p>
      </div>
      <div className="card">
        <h2>{t('start.shortcuts')}</h2>
        <ShortcutTable />
      </div>
    </section>
  );
}
