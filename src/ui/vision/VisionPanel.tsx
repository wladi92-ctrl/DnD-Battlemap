/**
 * Sicht, Licht und Nebel (rechte Seitenleiste): Nebel und dynamische Sicht schalten,
 * Grundhelligkeit, Optionen von Nebel- und Licht-Werkzeug, Lichtquellen bearbeiten,
 * „Als Spieler ansehen“ und Spieleransicht öffnen.
 */
import { useId } from 'react';
import { AMBIENTS, type Ambient } from '../../core/vision';
import {
  LIGHT_PRESETS,
  revealAll,
  setFogEnabled,
  setLighting,
  updateLights,
} from '../../editor/vision';
import { deleteItems } from '../../editor/wallOps';
import type { MessageKey } from '../../i18n';
import { HEX_COLOR, type MapLight } from '../../storage/mapDocument';
import { NumberField } from '../effects/EffectFields';
import { useEditorStore } from '../state/editorStore';
import { useMapStore } from '../state/mapStore';
import { useViewStore } from '../state/viewStore';
import { useT } from '../useT';
import { openPlayerView } from './playerChannel';

const run = (
  r: Parameters<ReturnType<typeof useMapStore.getState>['run']>[0],
  label: MessageKey,
  key?: string,
) => useMapStore.getState().run(r, label, key);

export function VisionPanel() {
  const t = useT();
  const id = useId();
  const doc = useMapStore((s) => s.doc);
  const tool = useViewStore((s) => s.tool);
  const preview = useEditorStore((s) => s.playerPreview);
  const selection = useEditorStore((s) => s.selection);
  if (!doc) return null;
  const selectedLights = doc.lights.filter((l) => selection.has(l.id));
  const single = selectedLights.length === 1 ? selectedLights[0] : undefined;

  return (
    <details
      className="panel-section"
      open={tool === 'fog' || tool === 'light' || doc.fog.enabled || doc.lighting.enabled}
    >
      <summary>{t('vision.heading')}</summary>
      <label className="panel-check">
        <input
          type="checkbox"
          checked={doc.fog.enabled}
          onChange={(e) => run(setFogEnabled(doc, e.target.checked), 'action.fog')}
        />
        {t('vision.fogEnabled')}
      </label>
      <label className="panel-check">
        <input
          type="checkbox"
          checked={doc.lighting.enabled}
          onChange={(e) => run(setLighting(doc, { enabled: e.target.checked }), 'action.lighting')}
        />
        {t('vision.dynamic')}
      </label>
      <div className="panel-field">
        <label htmlFor={`${id}-amb`}>{t('vision.ambient')}</label>
        <select
          id={`${id}-amb`}
          value={doc.lighting.ambient}
          onChange={(e) =>
            run(setLighting(doc, { ambient: e.target.value as Ambient }), 'action.lighting')
          }
        >
          {AMBIENTS.map((a) => (
            <option key={a} value={a}>
              {t(`ambient.${a}` as MessageKey)}
            </option>
          ))}
        </select>
      </div>
      <p className="small muted">{t('vision.viewersHint')}</p>

      {tool === 'fog' && <FogOptions />}
      {tool === 'light' && <LightOptions />}

      <div className="button-grid">
        <button
          type="button"
          className="btn"
          disabled={!doc.explored.length}
          onClick={() => useMapStore.getState().setExplored([])}
        >
          {t('vision.resetExplored')}
        </button>
        <button
          type="button"
          className="btn"
          aria-pressed={preview}
          onClick={() => useEditorStore.getState().setPlayerPreview(!preview)}
        >
          {preview ? t('vision.previewOff') : t('vision.previewOn')}
        </button>
      </div>
      <button type="button" className="btn btn-primary" onClick={() => void openPlayerView()}>
        {t('player.open')}
      </button>

      {doc.lights.length > 0 && (
        <fieldset className="panel-fieldset">
          <legend>{t('light.listHeading', { count: doc.lights.length })}</legend>
          <ul className="effect-list">
            {doc.lights.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className={selection.has(l.id) ? 'effect-row selected' : 'effect-row'}
                  aria-pressed={selection.has(l.id)}
                  onClick={() => useEditorStore.getState().setSelection([l.id])}
                >
                  <span
                    className="aoe-swatch"
                    style={{ background: l.darkness ? '#111' : l.color }}
                    aria-hidden="true"
                  />
                  <span>{l.name}</span>
                  <span className="muted small">
                    {l.darkness
                      ? t('light.darknessShort', { r: l.dim })
                      : t('light.radii', { bright: l.bright, dim: l.dim })}
                    {l.enabled ? '' : ` · ${t('light.off')}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {single && <LightEditor light={single} />}
          {selectedLights.length > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                run(deleteItems(doc, new Set(selectedLights.map((l) => l.id))), 'action.delete');
                useEditorStore.getState().setSelection([]);
              }}
            >
              {t('token.delete')}
            </button>
          )}
        </fieldset>
      )}
    </details>
  );
}

function FogOptions() {
  const t = useT();
  const doc = useMapStore((s) => s.doc);
  const fog = useEditorStore((s) => s.fogTool);
  const set = useEditorStore.getState().setFogTool;
  if (!doc) return null;
  return (
    <fieldset className="panel-fieldset">
      <legend>{t('tool.fog')}</legend>
      <div className="panel-radios">
        {(['reveal', 'hide'] as const).map((m) => (
          <label key={m}>
            <input
              type="radio"
              name="fog-mode"
              checked={fog.mode === m}
              onChange={() => set({ mode: m })}
            />
            {t(`fog.mode.${m}` as MessageKey)}
          </label>
        ))}
      </div>
      <div className="panel-radios">
        {(['brush', 'rect', 'polygon'] as const).map((sh) => (
          <label key={sh}>
            <input
              type="radio"
              name="fog-shape"
              checked={fog.shape === sh}
              onChange={() => set({ shape: sh })}
            />
            {t(`fog.shape.${sh}` as MessageKey)}
          </label>
        ))}
      </div>
      {fog.shape === 'brush' && (
        <div className="panel-radios">
          {[1, 3, 5].map((n) => (
            <label key={n}>
              <input
                type="radio"
                name="fog-size"
                checked={fog.size === n}
                onChange={() => set({ size: n })}
              />
              {t('fog.size', { n })}
            </label>
          ))}
        </div>
      )}
      <p className="small muted">{t(`fog.hint.${fog.shape}` as MessageKey)}</p>
      {!doc.fog.enabled && <p className="small error-text">{t('fog.disabledHint')}</p>}
      <div className="button-grid">
        <button
          type="button"
          className="btn"
          onClick={() => run(revealAll(doc, true), 'action.fog')}
        >
          {t('fog.revealAll')}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => run(revealAll(doc, false), 'action.fog')}
        >
          {t('fog.hideAll')}
        </button>
      </div>
    </fieldset>
  );
}

function LightOptions() {
  const t = useT();
  const id = useId();
  const preset = useEditorStore((s) => s.lightPreset);
  return (
    <fieldset className="panel-fieldset">
      <legend>{t('tool.light')}</legend>
      <div className="panel-field">
        <label htmlFor={`${id}-p`}>{t('light.preset')}</label>
        <select
          id={`${id}-p`}
          value={preset}
          onChange={(e) => useEditorStore.getState().setLightPreset(e.target.value)}
        >
          {LIGHT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {t(`light.preset.${p.id}` as MessageKey)} (
              {p.darkness
                ? t('light.darknessShort', { r: p.dim })
                : t('light.radii', { bright: p.bright, dim: p.dim })}
              )
            </option>
          ))}
        </select>
      </div>
      <p className="small muted">{t('light.hint')}</p>
    </fieldset>
  );
}

function LightEditor({ light }: { light: MapLight }) {
  const t = useT();
  const id = useId();
  const doc = useMapStore((s) => s.doc);
  if (!doc) return null;
  const update = (fn: (l: MapLight) => MapLight, key?: string) =>
    run(updateLights(doc, new Set([light.id]), fn), 'action.light', key);
  const carrier = light.attachedTo ? doc.tokens.find((x) => x.id === light.attachedTo) : undefined;
  return (
    <div className="effect-edit">
      <div className="panel-field">
        <label htmlFor={`${id}-n`}>{t('effect.name')}</label>
        <input
          id={`${id}-n`}
          value={light.name}
          maxLength={120}
          onChange={(e) =>
            e.target.value.trim() &&
            update((l) => ({ ...l, name: e.target.value }), `light:${light.id}:name`)
          }
        />
      </div>
      {!light.darkness && (
        <div className="panel-row">
          <NumberField
            id={`${id}-b`}
            label={t('light.bright')}
            value={light.bright}
            min={0}
            max={1000}
            onChange={(bright) => update((l) => ({ ...l, bright, dim: Math.max(l.dim, bright) }))}
          />
          <NumberField
            id={`${id}-d`}
            label={t('light.dim')}
            value={light.dim}
            min={0}
            max={1000}
            onChange={(dim) => update((l) => ({ ...l, dim: Math.max(dim, l.bright) }))}
          />
        </div>
      )}
      {light.darkness && (
        <NumberField
          id={`${id}-r`}
          label={t('light.darknessRadius')}
          value={light.dim}
          min={5}
          max={1000}
          onChange={(dim) => update((l) => ({ ...l, dim, bright: 0 }))}
        />
      )}
      {!light.darkness && (
        <div className="panel-field">
          <label htmlFor={`${id}-c`}>{t('token.color')}</label>
          <input
            id={`${id}-c`}
            type="color"
            value={light.color}
            onChange={(e) =>
              HEX_COLOR.test(e.target.value) &&
              update(
                (l) => ({ ...l, color: e.target.value.toLowerCase() }),
                `light:${light.id}:color`,
              )
            }
          />
        </div>
      )}
      <label className="panel-check">
        <input
          type="checkbox"
          checked={light.enabled}
          onChange={(e) => update((l) => ({ ...l, enabled: e.target.checked }))}
        />
        {t('light.enabled')}
      </label>
      {carrier && (
        <p className="small muted">
          {t('light.carriedBy', { name: carrier.name })}{' '}
          <button
            type="button"
            className="btn btn-small"
            onClick={() =>
              update((l) => {
                const { attachedTo: _a, ...rest } = l;
                return { ...rest, x: carrier.x + 0.5, y: carrier.y + 0.5 };
              })
            }
          >
            {t('light.drop')}
          </button>
        </p>
      )}
    </div>
  );
}
