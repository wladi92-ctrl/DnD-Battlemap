/**
 * Optionen des Zeichenwerkzeugs: Form, Farbe, Ping, alles löschen. Zeichnungen sind temporär
 * (nicht gespeichert, kein Rückgängig) und erscheinen auch in der Spieleransicht.
 */
import type { MessageKey } from '../../i18n';
import { keyLabel, buildKeymap } from '../keymap';
import { DRAW_COLORS, DRAW_SHAPES, useOverlayStore } from '../state/overlayStore';
import { useSettings } from '../state/settingsStore';
import { useViewStore } from '../state/viewStore';
import { useT } from '../useT';
import { clearDrawings, pingAtPointer } from './drawTools';

export function DrawPanel() {
  const t = useT();
  const tool = useViewStore((s) => s.tool);
  const shape = useOverlayStore((s) => s.shape);
  const color = useOverlayStore((s) => s.color);
  const count = useOverlayStore((s) => s.drawings.length);
  const keymap = buildKeymap(useSettings((s) => s.keymap));
  if (tool !== 'draw') return null;
  const keys = (id: 'ping' | 'clearDrawings') => keymap[id].map((k) => keyLabel(k, t)).join(', ');
  return (
    <details className="panel-section" open>
      <summary>{t('tool.draw')}</summary>
      <div className="panel-radios" role="radiogroup" aria-label={t('draw.shape')}>
        {DRAW_SHAPES.map((s) => (
          <label key={s}>
            <input
              type="radio"
              name="draw-shape"
              checked={shape === s}
              onChange={() => useOverlayStore.getState().setShape(s)}
            />
            {t(`draw.shape.${s}` as MessageKey)}
          </label>
        ))}
      </div>
      <div className="draw-colors" role="radiogroup" aria-label={t('draw.color')}>
        {DRAW_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c}
            aria-label={t(`draw.color.${c.slice(1)}` as MessageKey)}
            className={color === c ? 'swatch selected' : 'swatch'}
            style={{ background: c }}
            onClick={() => useOverlayStore.getState().setColor(c)}
          />
        ))}
      </div>
      <p className="small muted">{t('draw.note')}</p>
      <div className="button-grid">
        <button type="button" className="btn" title={keys('ping')} onClick={pingAtPointer}>
          {t('draw.ping')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!count}
          title={keys('clearDrawings')}
          onClick={clearDrawings}
        >
          {t('draw.clear', { count })}
        </button>
      </div>
    </details>
  );
}
