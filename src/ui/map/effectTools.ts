/**
 * Effekt-Werkzeug: Vorlage wählen, Ursprung/Richtung setzen (Maus oder Tastatur), Vorschau,
 * bestätigen. Sofortige Effekte öffnen den Rettungswurf-Assistenten, dauerhafte landen als
 * Effekt auf der Karte (rückgängig machbar). Unabhängig von Pixi/React (testbar).
 */
import { aoeCells, DIRECTIONAL, snapAngle, snapOrigin, type AoePlacement } from '../../core/aoe';
import type { Cell, Point } from '../../core/grid';
import {
  addEffect,
  affectedTokens,
  effectCells,
  effectEnvironment,
  effectFromTemplate,
  effectStyle,
  placementOf,
  specOf,
  tickEffects,
  tokenFootprint,
  turnStartHits,
  type EffectTemplate,
} from '../../editor/effects';
import { mergePatches, type DocPatch } from '../../editor/patch';
import { newRound, tokensAt } from '../../editor/tokens';
import type { EffectVisual } from '../../render/effectLayer';
import type { MapDocument, Token } from '../../storage/mapDocument';
import { useEditorStore, type AoeTool } from '../state/editorStore';
import { useMapStore } from '../state/mapStore';
import { useSettings } from '../state/settingsStore';
import { useViewStore } from '../state/viewStore';
import type { Say } from './tokenTools';
import { translate, type MessageKey } from '../../i18n';

const rule = () => useSettings.getState().coverageRule;

/**
 * Standard-Einrastung: Kugeln/Zylinder auf Rasterkreuzungen, Kegel auf halbe Felder (Kanten,
 * Kreuzungen für diagonale Kegel), Linien und Würfel auf Kantenmitten – eine 100-ft-Linie trifft
 * so genau 20 Felder einer Reihe statt auf einer Rasterlinie zwei Reihen je zur Hälfte.
 */
export function defaultOriginSnap(t: EffectTemplate): AoeTool['originSnap'] {
  if (t.shape === 'line' || t.shape === 'cube') return 'edge';
  return DIRECTIONAL.includes(t.shape) ? 'half' : 'vertex';
}

/** Vorlage wählen und das Effekt-Werkzeug aktivieren. */
export function armEffect(template: EffectTemplate): void {
  const ed = useEditorStore.getState();
  ed.setAoe({
    template,
    originSnap:
      ed.aoe?.originSnap && ed.aoe.template.shape === template.shape
        ? ed.aoe.originSnap
        : defaultOriginSnap(template),
    angleStep: ed.aoe?.angleStep ?? (template.shape === 'cone' ? 45 : 15),
  });
  useViewStore.getState().setTool('effect');
}

export function updateAoeTemplate(changes: Partial<EffectTemplate>): void {
  const ed = useEditorStore.getState();
  if (ed.aoe) ed.setAoe({ ...ed.aoe, template: { ...ed.aoe.template, ...changes } });
}

export function cancelAoe(): boolean {
  const ed = useEditorStore.getState();
  const p = ed.aoePhase;
  if (p.origin || p.cells.length) {
    ed.setAoePhase({ origin: null, cells: [] });
    return true;
  }
  return false;
}

const isDirectional = (t: EffectTemplate) => DIRECTIONAL.includes(t.shape);

/** Token unter dem Zeiger (für Auren um eine Kreatur). */
function carrierAt(p: Point): Token | undefined {
  const doc = useMapStore.getState().doc;
  return doc ? tokensAt(doc, p)[0] : undefined;
}

/** Aktuelle Platzierung (Vorschau) aus Werkzeug und Zeigerposition. */
export function currentPlacement(): { placement: AoePlacement; carrier?: Token } | null {
  const ed = useEditorStore.getState();
  const tool = ed.aoe;
  if (!tool) return null;
  const p = ed.aoePhase;
  const t = tool.template;
  if (t.shape === 'free') {
    return {
      placement: {
        origin: p.cells[0] ? { x: p.cells[0].x + 0.5, y: p.cells[0].y + 0.5 } : { x: 0, y: 0 },
        angle: 0,
        cells: p.cells,
      },
    };
  }
  if (t.shape === 'emanation' && !p.origin && p.pointer) {
    const carrier = carrierAt(p.pointer);
    if (carrier) {
      const f = tokenFootprint(carrier);
      return {
        placement: { origin: { x: f.x + f.size / 2, y: f.y + f.size / 2 }, angle: 0, around: f },
        carrier,
      };
    }
  }
  // Kantenmitte: Ursprung roh merken und je nach Richtung auf die passende Kante einrasten.
  const edge = tool.originSnap === 'edge' && isDirectional(t);
  const origin = p.origin
    ? edge
      ? snapOrigin(p.origin, 'edge', p.angle)
      : p.origin
    : p.pointer
      ? snapOrigin(p.pointer, tool.originSnap, edge ? p.angle : undefined)
      : null;
  if (!origin) return null;
  if (t.shape === 'square') {
    return {
      placement: { origin: { x: Math.floor(origin.x), y: Math.floor(origin.y) }, angle: 0 },
    };
  }
  return { placement: { origin, angle: p.angle } };
}

/** Vorschau-Felder und betroffene Tokens der aktuellen Platzierung. */
export function previewResult(
  doc: MapDocument,
): { cells: Set<number>; tokens: Token[]; origin: Point } | null {
  const tool = useEditorStore.getState().aoe;
  const cur = currentPlacement();
  if (!tool || !cur) return null;
  const cells = aoeCells(specOf(tool.template), cur.placement, effectEnvironment(doc), {
    rule: rule(),
    wallMode: tool.template.wallMode,
  });
  return {
    cells,
    tokens: affectedTokens(doc, cells, cur.carrier?.id),
    origin: cur.placement.origin,
  };
}

/** Zeiger bewegt: Vorschau folgt; nach gesetztem Ursprung bestimmt der Zeiger die Richtung. */
export function aoePointerMove(point: Point, dragging = false): void {
  const ed = useEditorStore.getState();
  const tool = ed.aoe;
  if (!tool) return;
  const p = ed.aoePhase;
  if (tool.template.shape === 'free' && dragging) {
    const c = { x: Math.floor(point.x), y: Math.floor(point.y) };
    if (!p.cells.some((q) => q.x === c.x && q.y === c.y))
      ed.setAoePhase({ cells: [...p.cells, c], pointer: point });
    return;
  }
  if (p.origin && isDirectional(tool.template)) {
    const dx = point.x - p.origin.x;
    const dy = point.y - p.origin.y;
    if (Math.hypot(dx, dy) > 0.2) {
      const angle = snapAngle((Math.atan2(dy, dx) * 180) / Math.PI, tool.angleStep);
      if (angle !== p.angle) ed.setAoePhase({ angle, pointer: point });
      return;
    }
  }
  ed.setAoePhase({ pointer: point });
}

/** Klick (bzw. Eingabetaste): Ursprung setzen oder Effekt auslösen. */
export function aoePointerDown(point: Point, say: Say): void {
  const ed = useEditorStore.getState();
  const tool = ed.aoe;
  if (!tool) return say('notice.chooseEffect');
  const t = tool.template;
  const p = ed.aoePhase;
  if (t.shape === 'free') {
    const c = { x: Math.floor(point.x), y: Math.floor(point.y) };
    const exists = p.cells.some((q) => q.x === c.x && q.y === c.y);
    ed.setAoePhase({
      cells: exists ? p.cells.filter((q) => q.x !== c.x || q.y !== c.y) : [...p.cells, c],
      pointer: point,
    });
    return;
  }
  if (isDirectional(t) && !p.origin) {
    ed.setAoePhase({
      origin: tool.originSnap === 'edge' ? point : snapOrigin(point, tool.originSnap),
      pointer: point,
    });
    return;
  }
  ed.setAoePhase({ pointer: p.pointer ?? point });
  confirmAoe(say);
}

/** Drehen per Tastatur (Q / Umschalt+Q). */
export function rotateAoe(steps: number): void {
  const ed = useEditorStore.getState();
  if (!ed.aoe) return;
  const step = ed.aoe.angleStep || 15;
  ed.setAoePhase({ angle: snapAngle(ed.aoePhase.angle + steps * step, ed.aoe.angleStep) });
}

/** Effekt auslösen: dauerhaft auf die Karte legen und/oder den Assistenten öffnen. */
export function confirmAoe(say: Say): void {
  const ed = useEditorStore.getState();
  const map = useMapStore.getState();
  const doc = map.doc;
  const tool = ed.aoe;
  const cur = currentPlacement();
  if (!doc || !tool || !cur) return;
  const t = tool.template;
  if (t.shape === 'free' && !cur.placement.cells?.length) return say('notice.freeEmpty');
  const preview = previewResult(doc);
  if (!preview) return;
  let effectId: string | undefined;
  if (t.rounds !== 0) {
    const e = effectFromTemplate(t, cur.placement.origin, cur.placement.angle, {
      ...(cur.carrier ? { attachedTo: cur.carrier.id } : {}),
      ...(t.shape === 'free'
        ? { cells: (cur.placement.cells ?? []).map((c) => [c.x, c.y] as [number, number]) }
        : {}),
    });
    const reason = map.run(addEffect(doc, e), 'action.effectAdd');
    if (reason === 'locked') return say('notice.layerLocked');
    effectId = e.id;
    ed.setSelection([e.id]);
  }
  ed.setAoePhase({ origin: null, cells: [] });
  const tokenIds = preview.tokens.map((x) => x.id);
  say('notice.effectResult', { name: t.name, cells: preview.cells.size, targets: tokenIds.length });
  if ((t.save || t.damage) && tokenIds.length) {
    ed.openAssistant({
      name: t.name,
      template: t,
      cells: preview.cells.size,
      tokenIds,
      ...(effectId ? { effectId } : {}),
    });
  }
}

// ------------------------------------------------------------------ Darstellung

/** Effekte der Karte und Vorschau als Darstellungsliste für den Renderer. */
export function effectVisuals(
  doc: MapDocument,
  selection: ReadonlySet<string>,
  label: (e: { name: string; rounds: number | null; concentration: boolean }) => string,
  withGhost: boolean,
): EffectVisual[] {
  const r = rule();
  const env = effectEnvironment(doc);
  const out: EffectVisual[] = doc.effects.map((e) => ({
    id: e.id,
    cells: effectCells(doc, e, r, env),
    color: e.color,
    pattern: effectStyle(e.damageType).pattern,
    origin: placementOf(doc, e).origin,
    label: label(e),
    selected: selection.has(e.id),
    ghost: false,
    hidden: e.hidden,
  }));
  const tool = useEditorStore.getState().aoe;
  if (withGhost && tool) {
    const prev = previewResult(doc);
    if (prev) {
      out.push({
        id: '__ghost__',
        cells: prev.cells,
        color: tool.template.color,
        pattern: effectStyle(tool.template.damageType).pattern,
        origin: prev.origin,
        label: '',
        selected: false,
        ghost: true,
        hidden: false,
      });
    }
  }
  return out;
}

/** Effekt, dessen Ursprungsmarke unter dem Punkt liegt (für das Auswahl-Werkzeug). */
export function effectAt(doc: MapDocument, p: Point): { id: string } | undefined {
  const st = doc.layers.find((l) => l.id === 'effects');
  if (!st?.visible || st.locked) return undefined;
  return [...doc.effects].reverse().find((e) => {
    const o = placementOf(doc, e).origin;
    return Math.hypot(o.x - p.x, o.y - p.y) <= 0.35;
  });
}

/** Ursprünge von Effekten in einem Rechteck (Rahmenauswahl). */
export function effectsInRect(
  doc: MapDocument,
  r: { x: number; y: number; w: number; h: number },
): string[] {
  const st = doc.layers.find((l) => l.id === 'effects');
  if (!st?.visible || st.locked) return [];
  return doc.effects
    .filter((e) => {
      const o = placementOf(doc, e).origin;
      return o.x >= r.x && o.x <= r.x + r.w && o.y >= r.y && o.y <= r.y + r.h;
    })
    .map((e) => e.id);
}

// ------------------------------------------------------------------ Rundenablauf

/**
 * Neue Runde (ein Undo-Schritt): Bewegung/Aktionen aller Tokens zurücksetzen, Effektdauer
 * herunterzählen, abgelaufene Effekte melden und Kreaturen in Zonen mit Zugbeginn-Auslöser nennen.
 */
export function startNewRound(say: Say): void {
  const map = useMapStore.getState();
  const doc = map.doc;
  if (!doc) return;
  const a = newRound(doc);
  const ticked = tickEffects(doc);
  const patches: DocPatch[] = [];
  for (const r of [a, ticked.result]) if (r.ok) patches.push(r.patch);
  if (patches.length) map.apply(patches.reduce(mergePatches), 'action.round');
  if (ticked.expired.length) say('notice.effectsExpired', { names: ticked.expired.join(', ') });
  const after = useMapStore.getState().doc;
  if (!after) return;
  for (const hit of turnStartHits(after, rule())) {
    say('notice.turnStartInEffect', {
      effect: hit.effect.name,
      names: hit.tokens.map((t) => t.name).join(', '),
      save: saveText(hit.effect),
    });
  }
}

/** "GES 15" bzw. "–" in der eingestellten Sprache. */
export function saveText(e: { save?: { ability: string; dc: number } | undefined }): string {
  if (!e.save) return '–';
  const locale = useSettings.getState().locale;
  return translate(locale, 'save.short', {
    ability: translate(locale, `ability.${e.save.ability}` as MessageKey),
    dc: e.save.dc,
  });
}

/** Felder einer freien Fläche aus dem Werkzeug (für Tests/Panel). */
export function freeCells(): Cell[] {
  return useEditorStore.getState().aoePhase.cells;
}
