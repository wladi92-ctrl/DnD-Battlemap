/** Raumvorlagen und zufällige Verliese einfügen – mit Vorschau. */
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { screenToWorld } from '../../core/camera';
import { CELL_PX } from '../../core/grid';
import { getBuiltinElement } from '../../data/elements';
import { footprintSize } from '../../editor/footprint';
import {
  buildTemplate,
  DUNGEON_MAX,
  DUNGEON_MIN,
  generateDungeon,
  placeStamp,
  TEMPLATE_IDS,
  type Stamp,
  type TemplateId,
} from '../../editor/generators';
import type { MessageKey } from '../../i18n';
import { Modal } from '../Modal';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useViewStore } from '../state/viewStore';
import { useT } from '../useT';

type Choice = TemplateId | 'random';

export function randomSeed(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return [...bytes]
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 6);
}

/** Zeichnet eine kleine Vorschau des Stempels (Farben der Elemente). */
function StampPreview({ stamp }: { stamp: Stamp }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const cell = Math.max(2, Math.floor(Math.min(320 / stamp.w, 220 / stamp.h)));
    canvas.width = stamp.w * cell;
    canvas.height = stamp.h * cell;
    ctx.fillStyle = '#1d1b19';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    stamp.floor.forEach((id, i) => {
      if (!id) return;
      ctx.fillStyle = getBuiltinElement(id)?.color ?? '#888';
      ctx.fillRect((i % stamp.w) * cell, Math.floor(i / stamp.w) * cell, cell, cell);
    });
    for (const o of stamp.objects) {
      const def = getBuiltinElement(o.element);
      if (!def) continue;
      const s = footprintSize({ w: def.w, h: def.h, rotation: o.rotation });
      ctx.fillStyle = def.color;
      const inset = def.category === 'walls' ? 0 : Math.max(1, cell * 0.15);
      ctx.fillRect(
        o.x * cell + inset,
        o.y * cell + inset,
        s.w * cell - 2 * inset,
        s.h * cell - 2 * inset,
      );
    }
  }, [stamp]);
  return <canvas ref={ref} className="stamp-preview" aria-hidden="true" />;
}

export function GeneratorDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const id = useId();
  const doc = useMapStore((s) => s.doc);
  const [choice, setChoice] = useState<Choice>('tavern');
  const [seed, setSeed] = useState(randomSeed);
  const [width, setWidth] = useState(String(Math.min(40, doc?.grid.cols ?? 40)));
  const [height, setHeight] = useState(String(Math.min(30, doc?.grid.rows ?? 30)));
  const [replace, setReplace] = useState(true);

  const stamp = useMemo(
    () =>
      choice === 'random'
        ? generateDungeon(seed, Number(width), Number(height))
        : buildTemplate(choice),
    [choice, seed, width, height],
  );

  // Standardposition: Vorlage um die Bildschirmmitte, auf die Karte begrenzt.
  const defaultPos = () => {
    if (!doc) return { x: 0, y: 0 };
    const v = useViewStore.getState();
    const c = screenToWorld(v.camera, { x: v.viewport.width / 2, y: v.viewport.height / 2 });
    const clamp = (val: number, size: number, max: number) =>
      Math.max(0, Math.min(max - size, Math.round(val - size / 2)));
    return {
      x: clamp(c.x / CELL_PX, stamp.w, doc.grid.cols),
      y: clamp(c.y / CELL_PX, stamp.h, doc.grid.rows),
    };
  };
  const [pos, setPos] = useState<{ x: string; y: string } | null>(null);
  const position = pos ? { x: Number(pos.x), y: Number(pos.y) } : defaultPos();

  if (!doc) return null;
  const fits = stamp.w <= doc.grid.cols && stamp.h <= doc.grid.rows;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const label = choice === 'random' ? 'action.dungeon' : 'action.template';
    const reason = useMapStore.getState().run(placeStamp(doc, stamp, position, replace), label);
    if (reason === 'outside') return useNoticeStore.getState().push('info', t('notice.outside'));
    if (reason === 'locked') return useNoticeStore.getState().push('info', t('notice.layerLocked'));
    onClose();
  };

  return (
    <Modal title={t('generator.heading')} onClose={onClose}>
      <form onSubmit={submit}>
        <fieldset className="panel-radios">
          <legend>{t('generator.choose')}</legend>
          {[...TEMPLATE_IDS, 'random' as const].map((c) => (
            <label key={c}>
              <input
                type="radio"
                name="template"
                checked={choice === c}
                onChange={() => setChoice(c)}
              />
              {t(`template.${c}` as MessageKey)}
            </label>
          ))}
        </fieldset>
        {choice === 'random' && (
          <>
            <div className="field">
              <label htmlFor={`${id}-seed`}>{t('generator.seed')}</label>
              <div className="field-inline">
                <input
                  id={`${id}-seed`}
                  type="text"
                  maxLength={40}
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                />
                <button type="button" className="btn" onClick={() => setSeed(randomSeed())}>
                  {t('generator.reroll')}
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor={`${id}-w`}>{t('generator.size')}</label>
              <div className="field-inline">
                <input
                  id={`${id}-w`}
                  type="number"
                  min={DUNGEON_MIN}
                  max={DUNGEON_MAX}
                  value={width}
                  aria-label={t('import.width')}
                  onChange={(e) => setWidth(e.target.value)}
                />
                ×
                <input
                  type="number"
                  min={DUNGEON_MIN}
                  max={DUNGEON_MAX}
                  value={height}
                  aria-label={t('import.height')}
                  onChange={(e) => setHeight(e.target.value)}
                />
              </div>
            </div>
          </>
        )}
        <StampPreview stamp={stamp} />
        <p className="small muted">{t('generator.stampSize', { w: stamp.w, h: stamp.h })}</p>
        {!fits && (
          <p className="form-error" role="alert">
            {t('generator.tooBig')}
          </p>
        )}
        <div className="field">
          <label htmlFor={`${id}-x`}>{t('generator.position')}</label>
          <div className="field-inline">
            <input
              id={`${id}-x`}
              type="number"
              min={1}
              value={position.x + 1}
              aria-label="X"
              onChange={(e) =>
                setPos({ x: String(Number(e.target.value) - 1), y: String(position.y) })
              }
            />
            <input
              type="number"
              min={1}
              value={position.y + 1}
              aria-label="Y"
              onChange={(e) =>
                setPos({ x: String(position.x), y: String(Number(e.target.value) - 1) })
              }
            />
          </div>
        </div>
        <label className="panel-check">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          {t('generator.replace')}
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!fits}>
            {t('generator.insert')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
