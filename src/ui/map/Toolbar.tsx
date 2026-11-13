import { worldSize } from '../../core/grid';
import type { MessageKey } from '../../i18n';
import { useEditorStore } from '../state/editorStore';
import { useMapStore } from '../state/mapStore';
import { useViewStore, type Tool } from '../state/viewStore';
import { useT } from '../useT';
import { buildKeymap, keyLabel, TOOL_DEFAULTS } from '../keymap';
import { useSettings } from '../state/settingsStore';
import { setTool } from './editorTools';
import { ToolIcon } from './ToolIcon';

interface Props {
  onNew: () => void;
  onOpen: () => void;
  onImportImage: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExport: () => void;
  onTemplate: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export const ZOOM_STEP = 1.25;

/** Werkzeuge in Anzeigereihenfolge mit Tastenkürzel. */
/** Werkzeuge in Toolbar-Reihenfolge (Tasten: anpassbar, siehe keymap.ts). */
export const TOOLS: readonly Tool[] = TOOL_DEFAULTS.map((tl) => tl.id);

export function Toolbar({
  onNew,
  onOpen,
  onImportImage,
  onSave,
  onSaveAs,
  onExport,
  onTemplate,
  onUndo,
  onRedo,
}: Props) {
  const t = useT();
  const tool = useViewStore((s) => s.tool);
  const keymap = buildKeymap(useSettings((s) => s.keymap));
  const zoom = useViewStore((s) => s.camera.zoom);
  const doc = useMapStore((s) => s.doc);
  const undoTop = useMapStore((s) => s.history.undo[s.history.undo.length - 1]);
  const redoTop = useMapStore((s) => s.history.redo[s.history.redo.length - 1]);
  const showTerrain = useEditorStore((s) => s.showTerrain);
  const diceOpen = useEditorStore((s) => s.diceOpen);

  const zoomBy = (factor: number) => {
    if (!doc) return;
    const v = useViewStore.getState();
    v.zoomAt({ x: v.viewport.width / 2, y: v.viewport.height / 2 }, factor, worldSize(doc.grid));
  };
  const actionLabel = (label: string | undefined) => (label ? t(label as MessageKey) : '');

  return (
    <div className="toolbar" role="toolbar" aria-label={t('toolbar.label')}>
      <div className="toolbar-group" role="group" aria-label={t('toolbar.file')}>
        <button type="button" className="btn" onClick={onNew} aria-keyshortcuts="Control+N">
          {t('file.new')}
        </button>
        <button type="button" className="btn" onClick={onOpen} aria-keyshortcuts="Control+O">
          {t('file.open')}
        </button>
        <button type="button" className="btn" onClick={onImportImage}>
          {t('imageImport.button')}
        </button>
        <button
          type="button"
          className="btn"
          onClick={onSave}
          disabled={!doc}
          aria-keyshortcuts="Control+S"
        >
          {t('file.save')}
        </button>
        <button
          type="button"
          className="btn"
          onClick={onSaveAs}
          disabled={!doc}
          aria-keyshortcuts="Control+Shift+S"
        >
          {t('file.saveAs')}
        </button>
        <button
          type="button"
          className="btn"
          onClick={onExport}
          disabled={!doc}
          aria-keyshortcuts="Control+E"
        >
          {t('file.export')}
        </button>
      </div>
      {doc && (
        <>
          <div className="toolbar-group" role="group" aria-label={t('toolbar.edit')}>
            <button
              type="button"
              className="btn btn-icon"
              onClick={onUndo}
              disabled={!undoTop}
              aria-label={t('edit.undo')}
              aria-keyshortcuts="Control+Z"
              title={`${t('edit.undo')}${undoTop ? `: ${actionLabel(undoTop.label)}` : ''} (Strg+Z)`}
            >
              <ToolIcon name="undo" />
            </button>
            <button
              type="button"
              className="btn btn-icon"
              onClick={onRedo}
              disabled={!redoTop}
              aria-label={t('edit.redo')}
              aria-keyshortcuts="Control+Y"
              title={`${t('edit.redo')}${redoTop ? `: ${actionLabel(redoTop.label)}` : ''} (Strg+Y)`}
            >
              <ToolIcon name="redo" />
            </button>
            <button
              type="button"
              className="btn"
              onClick={onTemplate}
              title={t('generator.heading')}
            >
              <ToolIcon name="template" /> {t('generator.button')}
            </button>
          </div>
          <div className="toolbar-group" role="group" aria-label={t('toolbar.tools')}>
            {TOOLS.map((id) => {
              const label = t(`tool.${id}` as MessageKey);
              const keys = keymap[`tool.${id}`];
              const hint = keys.map((k) => keyLabel(k, t)).join(', ');
              return (
                <button
                  key={id}
                  type="button"
                  className="btn btn-icon"
                  aria-pressed={tool === id}
                  aria-label={label}
                  aria-keyshortcuts={keys.length ? keys.join(' ') : undefined}
                  title={hint ? `${label} (${hint})` : label}
                  onClick={() => setTool(id)}
                >
                  <ToolIcon name={id} />
                </button>
              );
            })}
          </div>
          <div className="toolbar-group" role="group" aria-label={t('toolbar.view')}>
            <button
              type="button"
              className="btn btn-icon"
              aria-pressed={doc.grid.visible}
              aria-label={t('view.grid')}
              aria-keyshortcuts="G"
              title={`${t('view.grid')} (G)`}
              onClick={() => useMapStore.getState().updateGrid({ visible: !doc.grid.visible })}
            >
              <ToolIcon name="grid" />
            </button>
            <button
              type="button"
              className="btn btn-icon"
              aria-pressed={showTerrain}
              aria-label={t('layers.showTerrain')}
              aria-keyshortcuts="T"
              title={`${t('layers.showTerrain')} (T)`}
              onClick={() => useEditorStore.getState().setShowTerrain(!showTerrain)}
            >
              <ToolIcon name="terrain" />
            </button>
            <button
              type="button"
              className="btn"
              aria-pressed={diceOpen}
              aria-keyshortcuts="X"
              title={`${t('dice.heading')} (X)`}
              onClick={() => useEditorStore.getState().setDiceOpen(!diceOpen)}
            >
              {t('dice.button')}
            </button>
            <button
              type="button"
              className="btn"
              aria-label={t('view.zoomOut')}
              title={`${t('view.zoomOut')} (−)`}
              onClick={() => zoomBy(1 / ZOOM_STEP)}
            >
              −
            </button>
            <span className="zoom-value" aria-live="polite">
              {t('view.zoom', { percent: Math.round(zoom * 100) })}
            </span>
            <button
              type="button"
              className="btn"
              aria-label={t('view.zoomIn')}
              title={`${t('view.zoomIn')} (+)`}
              onClick={() => zoomBy(ZOOM_STEP)}
            >
              +
            </button>
            <button
              type="button"
              className="btn"
              title={`${t('view.fit')} (0)`}
              onClick={() => useViewStore.getState().fit(worldSize(doc.grid))}
            >
              {t('view.fit')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
