/** Dialog „Karte exportieren“ (PNG/PDF, Raster, GM/Spieler, Auflösung, Druckmaßstab). */
import { useId, useState } from 'react';
import { MM, PAPER, type Paper } from '../../core/pdf';
import { fitLayout, tiledLayout } from '../../core/printLayout';
import { Modal } from '../Modal';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useT } from '../useT';
import { DEFAULT_EXPORT, exportMap, maxPxPerCell, type ExportOptions } from './mapExport';

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const id = useId();
  const doc = useMapStore((s) => s.doc);
  const [o, setO] = useState<ExportOptions>(DEFAULT_EXPORT);
  const [busy, setBusy] = useState(false);
  if (!doc) return null;
  const { cols, rows } = doc.grid;
  const set = (patch: Partial<ExportOptions>) => setO((prev) => ({ ...prev, ...patch }));
  const maxPx = maxPxPerCell(cols, rows);
  const px = Math.min(o.pxPerCell, maxPx);
  const pages =
    o.pdfMode === 'scale'
      ? tiledLayout(cols, rows, PAPER[o.paper], 10 * MM)
      : fitLayout(cols, rows, PAPER[o.paper], 10 * MM);

  const run = async () => {
    setBusy(true);
    try {
      const saved = await exportMap(o, t);
      if (saved) {
        useNoticeStore.getState().push('info', t('export.done', { file: saved }));
        onClose();
      }
    } catch (e) {
      useNoticeStore.getState().push('error', t('export.error', { error: String(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('export.heading')} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <fieldset className="panel-fieldset">
          <legend>{t('export.format')}</legend>
          <div className="panel-radios">
            {(['png', 'pdf'] as const).map((f) => (
              <label key={f}>
                <input
                  type="radio"
                  name="export-format"
                  checked={o.format === f}
                  onChange={() => set({ format: f })}
                />
                {t(`export.format.${f}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="panel-fieldset">
          <legend>{t('export.content')}</legend>
          <div className="panel-radios">
            {(['gm', 'player'] as const).map((a) => (
              <label key={a}>
                <input
                  type="radio"
                  name="export-audience"
                  checked={o.audience === a}
                  onChange={() => set({ audience: a })}
                />
                {t(`export.audience.${a}`)}
              </label>
            ))}
          </div>
          <label className="panel-check">
            <input
              type="checkbox"
              checked={o.grid}
              onChange={(e) => set({ grid: e.target.checked })}
            />
            {t('export.grid')}
          </label>
        </fieldset>

        {o.format === 'png' ? (
          <div className="field">
            <label htmlFor={`${id}-px`}>{t('export.pxPerCell')}</label>
            <input
              id={`${id}-px`}
              type="number"
              min={8}
              max={maxPx}
              value={o.pxPerCell}
              onChange={(e) => set({ pxPerCell: Number(e.target.value) || 8 })}
            />
            <p className="small muted">
              {t('export.pngSize', { w: cols * px, h: rows * px })}
              {o.pxPerCell > maxPx ? ` ${t('export.pngLimited', { max: maxPx })}` : ''}
            </p>
          </div>
        ) : (
          <>
            <fieldset className="panel-fieldset">
              <legend>{t('export.scale')}</legend>
              <div className="panel-radios">
                {(['scale', 'fit'] as const).map((m) => (
                  <label key={m}>
                    <input
                      type="radio"
                      name="export-mode"
                      checked={o.pdfMode === m}
                      onChange={() => set({ pdfMode: m })}
                    />
                    {t(`export.mode.${m}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor={`${id}-paper`}>{t('export.paper')}</label>
              <select
                id={`${id}-paper`}
                value={o.paper}
                onChange={(e) => set({ paper: e.target.value as Paper })}
              >
                <option value="a4">A4</option>
                <option value="letter">US Letter</option>
              </select>
            </div>
            <p className="small muted">
              {o.pdfMode === 'scale'
                ? t('export.pagesScale', {
                    count: pages.pages.length,
                    across: pages.across,
                    down: pages.down,
                  })
                : t('export.pagesFit')}
            </p>
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? t('export.busy') : t('export.run')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
