import { worldSize } from '../../core/grid';
import { useMapStore } from '../state/mapStore';
import { useViewStore, type Tool } from '../state/viewStore';
import { useT } from '../useT';

interface Props {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
}

export const ZOOM_STEP = 1.25;

export function Toolbar({ onNew, onOpen, onSave, onSaveAs }: Props) {
  const t = useT();
  const tool = useViewStore((s) => s.tool);
  const zoom = useViewStore((s) => s.camera.zoom);
  const doc = useMapStore((s) => s.doc);

  const zoomBy = (factor: number) => {
    if (!doc) return;
    const v = useViewStore.getState();
    v.zoomAt({ x: v.viewport.width / 2, y: v.viewport.height / 2 }, factor, worldSize(doc.grid));
  };

  const tools: { id: Tool; label: string; key: string }[] = [
    { id: 'pan', label: t('tool.pan'), key: 'H' },
    { id: 'ruler', label: t('tool.ruler'), key: 'R' },
  ];

  return (
    <div className="toolbar" role="toolbar" aria-label={t('toolbar.label')}>
      <div className="toolbar-group" role="group" aria-label={t('toolbar.file')}>
        <button type="button" className="btn" onClick={onNew} aria-keyshortcuts="Control+N">
          {t('file.new')}
        </button>
        <button type="button" className="btn" onClick={onOpen} aria-keyshortcuts="Control+O">
          {t('file.open')}
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
      </div>
      {doc && (
        <>
          <div className="toolbar-group" role="group" aria-label={t('toolbar.tools')}>
            {tools.map((tl) => (
              <button
                key={tl.id}
                type="button"
                className="btn"
                aria-pressed={tool === tl.id}
                aria-keyshortcuts={tl.key}
                title={`${tl.label} (${tl.key})`}
                onClick={() => useViewStore.getState().setTool(tl.id)}
              >
                {tl.label}
              </button>
            ))}
          </div>
          <div className="toolbar-group" role="group" aria-label={t('toolbar.view')}>
            <button
              type="button"
              className="btn"
              aria-pressed={doc.grid.visible}
              aria-keyshortcuts="G"
              title={`${t('view.grid')} (G)`}
              onClick={() => useMapStore.getState().updateGrid({ visible: !doc.grid.visible })}
            >
              {t('view.grid')}
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
