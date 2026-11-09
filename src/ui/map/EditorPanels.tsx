/** Rechte Seitenleiste: Werkzeugoptionen/Auswahl, Ebenen, Gelände. */
import { useId } from 'react';
import type { DoorState, WallKind } from '../../core/walls';
import { resolveElement } from '../../data/elements';
import { effectiveTerrain } from '../../editor/footprint';
import { setLayerState, type AlignMode } from '../../editor/ops';
import type { MessageKey } from '../../i18n';
import {
  COVER_LEVELS,
  DAMAGE_TYPES,
  DOOR_STATES,
  ELEVATION_LIMIT,
  LAYER_IDS,
  layerState,
  WALL_KINDS,
  type CoverLevel,
  type DamageType,
  type TerrainProps,
} from '../../storage/mapDocument';
import { useEditorStore } from '../state/editorStore';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useSettings } from '../state/settingsStore';
import { useViewStore } from '../state/viewStore';
import { useT } from '../useT';
import {
  alignSelection,
  deleteSelection,
  duplicateSelection,
  flipSelection,
  rotateSelectionOrPlacement,
  toggleSelectedDoors,
  updateSelectedWalls,
  type Notify,
} from './editorTools';

function useNotify(): Notify {
  const t = useT();
  return (key) => useNoticeStore.getState().push('info', t(key));
}

export function ToolOptionsPanel() {
  const t = useT();
  const notify = useNotify();
  const tool = useViewStore((s) => s.tool);
  const ed = useEditorStore();
  const doc = useMapStore((s) => s.doc);
  const locale = useSettings((s) => s.locale);
  if (!doc) return null;

  const element = ed.elementId
    ? resolveElement(ed.elementId, doc.customElements, locale)
    : undefined;
  const painting = ['brush', 'rect', 'line', 'fill'].includes(tool);
  const aligns: { mode: AlignMode; key: MessageKey }[] = [
    { mode: 'left', key: 'align.left' },
    { mode: 'centerX', key: 'align.centerX' },
    { mode: 'right', key: 'align.right' },
    { mode: 'top', key: 'align.top' },
    { mode: 'centerY', key: 'align.centerY' },
    { mode: 'bottom', key: 'align.bottom' },
  ];

  return (
    <details className="panel-section" open>
      <summary>{t(`tool.${tool}` as MessageKey)}</summary>
      {painting && (
        <>
          <p>
            {t('options.source')}:{' '}
            <strong>
              {ed.paintMode === 'terrain'
                ? t('terrain.heading')
                : (element?.name ?? t('options.noElement'))}
            </strong>
          </p>
          {ed.paintMode === 'element' &&
            element &&
            element.layer !== 'floor' &&
            tool !== 'fill' && (
              <div className="field-inline">
                <span>{t('options.rotation', { deg: ed.rotation })}</span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => rotateSelectionOrPlacement(-1, notify)}
                  aria-label={t('selection.rotateLeft')}
                >
                  ⟲
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => rotateSelectionOrPlacement(1, notify)}
                  aria-label={t('selection.rotateRight')}
                >
                  ⟳
                </button>
              </div>
            )}
          {tool === 'rect' && (
            <fieldset className="panel-radios">
              <legend>{t('options.rectMode')}</legend>
              <label>
                <input
                  type="radio"
                  name="rectmode"
                  checked={ed.rectFilled}
                  onChange={() => ed.setRectFilled(true)}
                />
                {t('options.filled')}
              </label>
              <label>
                <input
                  type="radio"
                  name="rectmode"
                  checked={!ed.rectFilled}
                  onChange={() => ed.setRectFilled(false)}
                />
                {t('options.outline')}
              </label>
            </fieldset>
          )}
        </>
      )}
      {tool === 'erase' && (
        <p>
          {t('options.eraseTarget')}:{' '}
          <strong>
            {ed.paintMode === 'terrain'
              ? t('terrain.heading')
              : t(`layer.${ed.activeLayer}` as MessageKey)}
          </strong>
        </p>
      )}
      {tool === 'select' && (
        <>
          <p aria-live="polite">
            {t('selection.count', {
              count: doc.objects.filter((o) => ed.selection.has(o.id)).length,
            })}
          </p>
          <div className="button-grid">
            <button
              type="button"
              className="btn"
              disabled={!ed.selection.size}
              onClick={() => rotateSelectionOrPlacement(-1, notify)}
            >
              ⟲ {t('selection.rotateLeft')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!ed.selection.size}
              onClick={() => rotateSelectionOrPlacement(1, notify)}
            >
              ⟳ {t('selection.rotateRight')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!ed.selection.size}
              onClick={() => flipSelection('x', notify)}
            >
              ⇋ {t('selection.flipX')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!ed.selection.size}
              onClick={() => flipSelection('y', notify)}
            >
              ⇵ {t('selection.flipY')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!ed.selection.size}
              onClick={() => duplicateSelection(notify)}
            >
              {t('selection.duplicate')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!ed.selection.size}
              onClick={() => deleteSelection(notify)}
            >
              {t('selection.delete')}
            </button>
          </div>
          {ed.selection.size > 1 && (
            <>
              <p className="small muted">{t('align.heading')}</p>
              <div className="button-grid three">
                {aligns.map((a) => (
                  <button
                    key={a.mode}
                    type="button"
                    className="btn"
                    onClick={() => alignSelection(a.mode, notify)}
                  >
                    {t(a.key)}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {tool === 'note' && <p className="small muted">{t('hint.note')}</p>}
      {tool === 'wall' && (
        <fieldset className="panel-radios">
          <legend>{t('wall.kind')}</legend>
          {WALL_KINDS.map((k) => (
            <label key={k}>
              <input
                type="radio"
                name="wallkind"
                checked={ed.wallKind === k}
                onChange={() => ed.setWallKind(k)}
              />
              {t(`wall.kind.${k}` as MessageKey)}
            </label>
          ))}
        </fieldset>
      )}
      {tool === 'select' && <SelectedWalls notify={notify} />}
      <label className="panel-check">
        <input type="checkbox" checked={ed.snap} onChange={(e) => ed.setSnap(e.target.checked)} />
        {t('options.snap')}
      </label>
    </details>
  );
}

/** Art und Türzustand der ausgewählten Kantenwände ändern. */
function SelectedWalls({ notify }: { notify: Notify }) {
  const t = useT();
  const id = useId();
  const doc = useMapStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const walls = doc?.walls.filter((w) => selection.has(w.id)) ?? [];
  if (!walls.length) return null;
  const kinds = new Set(walls.map((w) => w.kind));
  const kind = kinds.size === 1 ? walls[0]?.kind : '';
  const doors = walls.filter((w) => w.kind === 'door' || w.kind === 'secret');
  const states = new Set(doors.map((w) => w.state));
  const state = states.size === 1 ? (doors[0]?.state ?? '') : '';
  return (
    <div className="terrain-readout">
      <p className="small">{t('selection.walls', { count: walls.length })}</p>
      <div className="panel-field">
        <label htmlFor={`${id}-k`}>{t('wall.kind')}</label>
        <select
          id={`${id}-k`}
          value={kind}
          onChange={(e) => updateSelectedWalls({ kind: e.target.value as WallKind }, notify)}
        >
          {kind === '' && <option value="">–</option>}
          {WALL_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`wall.kind.${k}` as MessageKey)}
            </option>
          ))}
        </select>
      </div>
      {doors.length > 0 && (
        <>
          <div className="panel-field">
            <label htmlFor={`${id}-s`}>{t('wall.state')}</label>
            <select
              id={`${id}-s`}
              value={state}
              onChange={(e) => updateSelectedWalls({ state: e.target.value as DoorState }, notify)}
            >
              {state === '' && <option value="">–</option>}
              {DOOR_STATES.map((s) => (
                <option key={s} value={s}>
                  {t(`wall.state.${s}` as MessageKey)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => toggleSelectedDoors(notify)}
            aria-keyshortcuts="D"
          >
            {t('wall.toggleDoor')} (D)
          </button>
        </>
      )}
    </div>
  );
}

export function LayersPanel() {
  const t = useT();
  const doc = useMapStore((s) => s.doc);
  const activeLayer = useEditorStore((s) => s.activeLayer);
  const showTerrain = useEditorStore((s) => s.showTerrain);
  if (!doc) return null;
  const set = (id: (typeof LAYER_IDS)[number], changes: { visible?: boolean; locked?: boolean }) =>
    useMapStore.getState().run(setLayerState(doc, id, changes), 'action.layer');

  return (
    <details className="panel-section" open>
      <summary>{t('layers.heading')}</summary>
      <table className="layer-table">
        <thead>
          <tr>
            <th scope="col">{t('layers.active')}</th>
            <th scope="col">{t('layers.name')}</th>
            <th scope="col">{t('layers.visible')}</th>
            <th scope="col">{t('layers.locked')}</th>
          </tr>
        </thead>
        <tbody>
          {[...LAYER_IDS].reverse().map((id) => {
            const st = layerState(doc, id);
            const name = t(`layer.${id}` as MessageKey);
            return (
              <tr key={id} className={activeLayer === id ? 'active' : undefined}>
                <td>
                  <input
                    type="radio"
                    name="active-layer"
                    aria-label={t('layers.makeActive', { name })}
                    checked={activeLayer === id}
                    onChange={() => useEditorStore.getState().setActiveLayer(id)}
                  />
                </td>
                <td>{name}</td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={t('layers.visibleOf', { name })}
                    checked={st.visible}
                    onChange={(e) => set(id, { visible: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={t('layers.lockedOf', { name })}
                    checked={st.locked}
                    onChange={(e) => set(id, { locked: e.target.checked })}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <label className="panel-check">
        <input
          type="checkbox"
          checked={showTerrain}
          onChange={(e) => useEditorStore.getState().setShowTerrain(e.target.checked)}
        />
        {t('layers.showTerrain')}
      </label>
    </details>
  );
}

export function TerrainPanel() {
  const t = useT();
  const id = useId();
  const doc = useMapStore((s) => s.doc);
  const brush = useEditorStore((s) => s.terrainBrush);
  const paintMode = useEditorStore((s) => s.paintMode);
  const hover = useViewStore((s) => s.hoverCell ?? s.cursorCell);
  if (!doc) return null;

  const update = (changes: Partial<Record<keyof TerrainProps, unknown>>) => {
    // Leere Werte (aus, "keine", 0 ft) entfernen die Eigenschaft.
    const empty = (v: unknown) => v === undefined || v === false || v === '' || v === 0;
    const merged = { ...brush, ...changes } as Record<string, unknown>;
    const next = Object.fromEntries(Object.entries(merged).filter(([, v]) => !empty(v)));
    useEditorStore.getState().setTerrainBrush(next as TerrainProps);
  };
  const props = hover ? effectiveTerrain(doc, hover) : null;

  return (
    <details className="panel-section" open>
      <summary>{t('terrain.heading')}</summary>
      <label className="panel-check">
        <input
          type="checkbox"
          checked={paintMode === 'terrain'}
          onChange={(e) =>
            useEditorStore.getState().setPaintMode(e.target.checked ? 'terrain' : 'element')
          }
        />
        {t('terrain.paintMode')}
      </label>
      <p className="small muted">{t('terrain.hint')}</p>
      <label className="panel-check">
        <input
          type="checkbox"
          checked={Boolean(brush.difficult)}
          onChange={(e) => update({ difficult: e.target.checked })}
        />
        {t('terrain.difficult')}
      </label>
      <label className="panel-check">
        <input
          type="checkbox"
          checked={Boolean(brush.blocksMovement)}
          onChange={(e) => update({ blocksMovement: e.target.checked })}
        />
        {t('terrain.blocksMovement')}
      </label>
      <label className="panel-check">
        <input
          type="checkbox"
          checked={Boolean(brush.blocksSight)}
          onChange={(e) => update({ blocksSight: e.target.checked })}
        />
        {t('terrain.blocksSight')}
      </label>
      <div className="panel-field">
        <label htmlFor={`${id}-cover`}>{t('terrain.cover')}</label>
        <select
          id={`${id}-cover`}
          value={brush.cover ?? ''}
          onChange={(e) => update({ cover: e.target.value as CoverLevel | '' })}
        >
          <option value="">{t('terrain.none')}</option>
          {COVER_LEVELS.map((c) => (
            <option key={c} value={c}>
              {t(`cover.${c}` as MessageKey)}
            </option>
          ))}
        </select>
      </div>
      <div className="panel-field">
        <label htmlFor={`${id}-dmg`}>{t('terrain.damage')}</label>
        <select
          id={`${id}-dmg`}
          value={brush.damage ?? ''}
          onChange={(e) => update({ damage: e.target.value as DamageType | '' })}
        >
          <option value="">{t('terrain.none')}</option>
          {DAMAGE_TYPES.map((d) => (
            <option key={d} value={d}>
              {t(`damage.${d}` as MessageKey)}
            </option>
          ))}
        </select>
      </div>
      <div className="panel-field">
        <label htmlFor={`${id}-elev`}>{t('terrain.elevation')}</label>
        <input
          id={`${id}-elev`}
          type="number"
          step={5}
          min={-ELEVATION_LIMIT}
          max={ELEVATION_LIMIT}
          value={brush.elevation ?? 0}
          onChange={(e) =>
            update({
              elevation: Math.max(
                -ELEVATION_LIMIT,
                Math.min(ELEVATION_LIMIT, Number(e.target.value) || 0),
              ),
            })
          }
        />
      </div>
      {hover && props && (
        <div className="terrain-readout" aria-live="polite">
          <p className="small">
            <strong>{t('terrain.atCell', { x: hover.x + 1, y: hover.y + 1 })}</strong>
          </p>
          <p className="small">{describeTerrain(props, t) || t('terrain.none')}</p>
        </div>
      )}
    </details>
  );
}

export function describeTerrain(p: TerrainProps, t: ReturnType<typeof useT>): string {
  const parts: string[] = [];
  if (p.difficult) parts.push(t('terrain.difficult'));
  if (p.blocksMovement) parts.push(t('terrain.blocksMovement'));
  if (p.blocksSight) parts.push(t('terrain.blocksSight'));
  if (p.cover) parts.push(`${t('terrain.cover')}: ${t(`cover.${p.cover}` as MessageKey)}`);
  if (p.damage) parts.push(`${t('terrain.damage')}: ${t(`damage.${p.damage}` as MessageKey)}`);
  if (p.elevation) parts.push(`${t('terrain.elevation')}: ${p.elevation} ft`);
  return parts.join(' · ');
}
