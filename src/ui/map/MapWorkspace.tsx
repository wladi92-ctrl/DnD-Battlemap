import { useEffect, useRef, useState } from 'react';
import { worldSize } from '../../core/grid';
import { formatNumber } from '../../core/units';
import type { MessageKey } from '../../i18n';
import { useEditorStore } from '../state/editorStore';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useRecoveryStore } from '../state/recoveryStore';
import { useSettings } from '../state/settingsStore';
import { useViewStore } from '../state/viewStore';
import { isTypingTarget } from '../shortcuts';
import { ShortcutTable } from '../ShortcutTable';
import { useT } from '../useT';
import { LayersPanel, TerrainPanel, ToolOptionsPanel } from './EditorPanels';
import {
  cancelEditing,
  copySelection,
  deleteSelection,
  duplicateSelection,
  flipSelection,
  paste,
  rotateSelectionOrPlacement,
  selectAll,
  setTool,
  type Notify,
} from './editorTools';
import { GeneratorDialog } from './GeneratorDialog';
import { LibraryPanel } from './LibraryPanel';
import { MapCanvas } from './MapCanvas';
import { NewMapDialog } from './NewMapDialog';
import { NoteDialog } from './NoteDialog';
import { PropertiesPanel } from './PropertiesPanel';
import { StatusBar } from './StatusBar';
import { TOOLS, Toolbar, ZOOM_STEP } from './Toolbar';
import { useFileActions } from './useFileActions';

export function MapWorkspace() {
  const t = useT();
  const doc = useMapStore((s) => s.doc);
  const actions = useFileActions();
  const [newOpen, setNewOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const notify: Notify = (key) => useNoticeStore.getState().push('info', t(key));

  const requestNew = async () => {
    if (await actions.confirmDiscard()) setNewOpen(true);
  };

  const undoRedo = (which: 'undo' | 'redo') => {
    cancelEditing();
    const label = useMapStore.getState()[which]();
    if (!label) return;
    useEditorStore.getState().setSelection([]);
    const key = which === 'undo' ? 'notice.undone' : 'notice.redone';
    useNoticeStore.getState().push('info', t(key, { action: t(label as MessageKey) }));
  };
  const undo = () => undoRedo('undo');
  const redo = () => undoRedo('redo');

  // Tastenkürzel des Arbeitsbereichs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey) return;
      // Nur aktiv, solange der Arbeitsbereich sichtbar ist (nicht auf Einstellungen/Über).
      if (rootRef.current?.closest('[hidden]')) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const key = e.key.toLowerCase();
      const typing = isTypingTarget(e.target);
      if (e.ctrlKey || e.metaKey) {
        const fileKeys: Record<string, () => unknown> = {
          n: requestNew,
          o: actions.openMap,
          s: e.shiftKey ? actions.saveAs : actions.save,
        };
        // Bearbeiten-Kürzel nicht in Textfeldern (dort gelten die Kürzel des Feldes).
        const editKeys: Record<string, () => unknown> = typing
          ? {}
          : {
              z: e.shiftKey ? redo : undo,
              y: redo,
              c: () => copySelection(),
              v: () =>
                paste(
                  useViewStore.getState().hoverCell ?? useViewStore.getState().cursorCell,
                  notify,
                ),
              d: () => duplicateSelection(notify),
              a: () => {
                setTool('select');
                selectAll();
              },
            };
        const run = fileKeys[key] ?? (useMapStore.getState().doc ? editKeys[key] : undefined);
        if (run) {
          e.preventDefault();
          void run();
        }
        return;
      }
      if (typing) return;
      const d = useMapStore.getState().doc;
      if (!d) return;
      const view = useViewStore.getState();
      const world = worldSize(d.grid);
      const center = { x: view.viewport.width / 2, y: view.viewport.height / 2 };
      const handlers: Record<string, () => void> = {
        g: () => useMapStore.getState().updateGrid({ visible: !d.grid.visible }),
        t: () => useEditorStore.getState().setShowTerrain(!useEditorStore.getState().showTerrain),
        q: () => rotateSelectionOrPlacement(e.shiftKey ? -1 : 1, notify),
        y: () => flipSelection(e.shiftKey ? 'y' : 'x', notify),
        delete: () => deleteSelection(notify),
        backspace: () => deleteSelection(notify),
        '+': () => view.zoomAt(center, ZOOM_STEP, world),
        '=': () => view.zoomAt(center, ZOOM_STEP, world),
        '-': () => view.zoomAt(center, 1 / ZOOM_STEP, world),
        '0': () => view.fit(world),
      };
      for (const tl of TOOLS) handlers[tl.key.toLowerCase()] = () => setTool(tl.id);
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
        onTemplate={() => setTemplateOpen(true)}
        onUndo={undo}
        onRedo={redo}
      />
      {doc ? (
        <>
          <div className="workspace-body">
            <LibraryPanel />
            <MapCanvas />
            <div className="side-panel">
              <ToolOptionsPanel />
              <LayersPanel />
              <TerrainPanel />
              <PropertiesPanel />
            </div>
          </div>
          <StatusBar />
          <NoteDialog />
          {templateOpen && <GeneratorDialog onClose={() => setTemplateOpen(false)} />}
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
