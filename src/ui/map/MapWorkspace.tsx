import { useEffect, useRef, useState } from 'react';
import { worldSize } from '../../core/grid';
import { formatNumber } from '../../core/units';
import type { MessageKey } from '../../i18n';
import { useEditorStore } from '../state/editorStore';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useRecoveryStore } from '../state/recoveryStore';
import { useSettings } from '../state/settingsStore';
import { useViewStore, type Tool } from '../state/viewStore';
import { buildKeymap, keyIndex, type ActionId } from '../keymap';
import { clearDrawings, pingAtPointer } from './drawTools';
import { DrawPanel } from './DrawPanel';
import { FullscreenPanel } from './FullscreenPanel';
import { EffectQuickSearch } from '../effects/EffectQuickSearch';
import { toggleFullscreen } from '../fullscreen';
import { ExportDialog } from '../export/ExportDialog';
import { EncounterDialog } from '../encounter/EncounterDialog';
import { SnapshotPanel } from '../campaign/SnapshotPanel';
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
  toggleSelectedDoors,
  setTool,
  type Notify,
} from './editorTools';
import { GeneratorDialog } from './GeneratorDialog';
import { LeftPanel } from './LeftPanel';
import { rotateAoe } from './effectTools';
import { StatblockDialog } from '../creatures/StatblockDialog';
import { TokenPanel } from '../creatures/TokenPanel';
import { EffectListPanel, EffectToolPanel } from '../effects/EffectPanels';
import { SaveAssistant } from '../effects/SaveAssistant';
import { InitiativePanel } from '../combat/InitiativePanel';
import { VisionPanel } from '../vision/VisionPanel';
import { DiceRoller } from '../combat/DiceRoller';
import { AttackDialog } from '../combat/AttackDialog';
import { advanceTurn, previousTurn } from '../combat/combatTools';
import { MapCanvas } from './MapCanvas';
import { NewMapDialog } from './NewMapDialog';
import { NoteDialog } from './NoteDialog';
import { BackgroundImagePanel, PropertiesPanel } from './PropertiesPanel';
import { StatusBar } from './StatusBar';
import { Toolbar, ZOOM_STEP } from './Toolbar';
import { reportError, useFileActions } from './useFileActions';
import { EXAMPLES, loadExample } from '../examples';
import { CalibrationDialog } from '../import/CalibrationDialog';
import { beginImageImport, pickImageImport } from '../import/useImageImport';
import { extensionOf } from '../../storage/assets';
import { PROJECT_EXTENSION } from '../../storage/fileAccess';

export function MapWorkspace() {
  const t = useT();
  const doc = useMapStore((s) => s.doc);
  const actions = useFileActions();
  const [newOpen, setNewOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const fullscreen = useViewStore((s) => s.fullscreen);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const notify: Notify = (key, params) => useNoticeStore.getState().push('info', t(key, params));

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
          e: () => useMapStore.getState().doc && setExportOpen(true),
          // Schnellsuche für Effekte (auch im Vollbild)
          f: () => useMapStore.getState().doc && useViewStore.getState().setQuickSearch(true),
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
      // Einzeltasten: Belegung aus den Einstellungen (anpassbar).
      const commandActions: Record<ActionId, () => void> = {
        grid: () => useMapStore.getState().updateGrid({ visible: !d.grid.visible }),
        door: () => toggleSelectedDoors(notify),
        terrain: () =>
          useEditorStore.getState().setShowTerrain(!useEditorStore.getState().showTerrain),
        rotate: () =>
          view.tool === 'effect'
            ? rotateAoe(e.shiftKey ? -1 : 1)
            : rotateSelectionOrPlacement(e.shiftKey ? -1 : 1, notify),
        flip: () => flipSelection(e.shiftKey ? 'y' : 'x', notify),
        delete: () => deleteSelection(notify),
        zoomIn: () => view.zoomAt(center, ZOOM_STEP, world),
        zoomOut: () => view.zoomAt(center, 1 / ZOOM_STEP, world),
        fit: () => view.fit(world),
        dice: () => useEditorStore.getState().setDiceOpen(!useEditorStore.getState().diceOpen),
        nextTurn: () => void (d.combat && advanceTurn()),
        prevTurn: () => void (d.combat && previousTurn()),
        ping: () => pingAtPointer(),
        clearDrawings: () => clearDrawings(),
        fullscreen: () => toggleFullscreen(),
      };
      const command = keyIndex(buildKeymap(useSettings.getState().keymap)).get(key);
      if (!command) return;
      e.preventDefault();
      if (command.startsWith('tool.')) setTool(command.slice(5) as Tool);
      else commandActions[command as ActionId]();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const importImage = async () => {
    if (await actions.confirmDiscard()) await pickImageImport(t, 'newMap');
  };

  // Drag & Drop: Kartenbilder werden importiert, .dndmap-Dateien geöffnet.
  const hasFiles = (e: React.DragEvent) => [...e.dataTransfer.types].includes('Files');
  const onDragOver = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setDragging(false);
  };
  const onDrop = async (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (extensionOf(file.name) === PROJECT_EXTENSION) {
      await actions.openDropped(file.name, bytes);
    } else if (await actions.confirmDiscard()) {
      await beginImageImport(t, { name: file.name, bytes }, 'newMap');
    }
  };

  return (
    <div
      className={fullscreen ? 'workspace fullscreen' : 'workspace'}
      ref={rootRef}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => void onDrop(e)}
    >
      {dragging && <div className="drop-overlay">{t('imageImport.dropHint')}</div>}
      <CalibrationDialog />
      <Toolbar
        onNew={() => void requestNew()}
        onOpen={() => void actions.openMap()}
        onImportImage={() => void importImage()}
        onSave={() => void actions.save()}
        onSaveAs={() => void actions.saveAs()}
        onExport={() => setExportOpen(true)}
        onTemplate={() => setTemplateOpen(true)}
        onUndo={undo}
        onRedo={redo}
      />
      {doc ? (
        <>
          <div className="workspace-body">
            <LeftPanel hidden={fullscreen} />
            <MapCanvas />
            {fullscreen && <FullscreenPanel />}
            {!fullscreen && (
              <div className="side-panel">
                <InitiativePanel />
                <EffectToolPanel />
                <TokenPanel />
                <EffectListPanel />
                <VisionPanel />
                <DrawPanel />
                <SnapshotPanel />
                <ToolOptionsPanel />
                <LayersPanel />
                <TerrainPanel />
                <BackgroundImagePanel />
                <PropertiesPanel />
              </div>
            )}
          </div>
          {!fullscreen && <StatusBar />}
          <EffectQuickSearch />
          <NoteDialog />
          <StatblockDialog />
          <SaveAssistant />
          <AttackDialog />
          <DiceRoller />
          {templateOpen && <GeneratorDialog onClose={() => setTemplateOpen(false)} />}
          {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
          <EncounterDialog />
        </>
      ) : (
        <EmptyState
          onNew={() => void requestNew()}
          onOpen={() => void actions.openMap()}
          onImport={() => void importImage()}
        />
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

function EmptyState({
  onNew,
  onOpen,
  onImport,
}: {
  onNew: () => void;
  onOpen: () => void;
  onImport: () => void;
}) {
  const t = useT();
  const pending = useRecoveryStore((s) => s.pending);
  const pendingCampaign = useRecoveryStore((s) => s.pendingCampaign);
  const locale = useSettings((s) => s.locale);
  const { restoreRecovery, discardRecovery, openDropped } = useFileActions();

  const recovery = pending?.recovery ?? pendingCampaign?.recovery;
  const savedAt = recovery?.savedAt ? new Date(recovery.savedAt) : null;
  const time =
    savedAt && !Number.isNaN(savedAt.getTime())
      ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(savedAt)
      : '–';

  return (
    <section className="page empty-state">
      {(pending || pendingCampaign) && (
        <div className="card recovery" role="alert">
          <h2>{t('recovery.heading')}</h2>
          <p>
            {t('recovery.text', {
              name: pending?.doc.name ?? pendingCampaign?.campaign.name ?? '',
              time,
            })}
          </p>
          <p className="muted small">
            {pending
              ? `${pending.doc.grid.cols} × ${pending.doc.grid.rows} · ${formatNumber(pending.doc.grid.feetPerCell, locale)} ft`
              : t('campaign.recoveryInfo', { count: pendingCampaign?.campaign.scenes.length ?? 0 })}
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
          <button type="button" className="btn" onClick={onImport}>
            {t('imageImport.button')}
          </button>
        </div>
        <p className="muted small">{t('imageImport.dropHint')}</p>
        <p className="muted">{t('start.status')}</p>
        <p>
          <strong>{t('start.offline')}</strong>
        </p>
      </div>
      <div className="card">
        <h2>{t('examples.heading')}</h2>
        <p className="muted small">{t('examples.intro')}</p>
        <ul className="example-list">
          {EXAMPLES.map((ex) => (
            <li key={ex.id}>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  void loadExample(ex)
                    .then((bytes) => openDropped(ex.file, bytes))
                    .catch((e: unknown) => reportError(t, e))
                }
              >
                {t(ex.title)}
              </button>
              <span className="muted small">{t(ex.description)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h2>{t('start.shortcuts')}</h2>
        <ShortcutTable />
      </div>
    </section>
  );
}
