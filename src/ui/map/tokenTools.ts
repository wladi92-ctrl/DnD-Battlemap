/**
 * Token-Steuerung der Karte: Setzen, Ziehen mit Wegvorschau und Bewegungskosten,
 * Pfeiltasten, Bewegungsreichweite fürs Overlay. Unabhängig von Pixi/React (testbar).
 */
import type { Cell, Point } from '../../core/grid';
import {
  expandGroups,
  moveToken,
  shiftTokens,
  spawnTokens,
  tokenCells,
  tokenReach,
  tokensAt,
  type MoveOutcome,
} from '../../editor/tokens';
import type { OpResult } from '../../editor/ops';
import { effectsEntered } from '../../editor/effects';
import { saveText } from './effectTools';
import type { MessageKey } from '../../i18n';
import { dataUrlToBytes } from '../../storage/library';
import type { MapDocument, Token } from '../../storage/mapDocument';
import { useEditorStore } from '../state/editorStore';
import { useMapStore } from '../state/mapStore';
import { useSettings } from '../state/settingsStore';

export type Say = (key: MessageKey, params?: Record<string, string | number>) => void;

const REASONS: Record<string, MessageKey | null> = {
  locked: 'notice.layerLocked',
  outside: 'notice.noSpace',
  nothing: null,
  fillObjects: null,
};

function report(reason: string | null, say: Say) {
  const key = reason ? REASONS[reason] : null;
  if (key) say(key);
}

const rule = () => useSettings.getState().diagonalRule;

export function tokenAt(p: Point): Token | undefined {
  const doc = useMapStore.getState().doc;
  return doc ? tokensAt(doc, p)[0] : undefined;
}

/** Ausgewählte Tokens (in Dokumentreihenfolge). */
export function selectedTokens(doc: MapDocument | null = useMapStore.getState().doc): Token[] {
  const sel = useEditorStore.getState().selection;
  return doc ? doc.tokens.filter((t) => sel.has(t.id)) : [];
}

// ------------------------------------------------------------------ Setzen

/** Setzt die wartenden Tokens an `cell` (linke obere Ecke); bettet ein Bild ein. */
export function placeSpawnAt(cell: Cell, say: Say): boolean {
  const ed = useEditorStore.getState();
  const map = useMapStore.getState();
  const spawn = ed.spawn;
  const doc = map.doc;
  if (!spawn || !doc) return false;
  let template = spawn.template;
  if (spawn.imageData) {
    const img = dataUrlToBytes(spawn.imageData);
    if (img) {
      const path = `tokens/${crypto.randomUUID()}.${img.ext}`;
      map.addAsset(path, img.bytes);
      template = { ...template, image: path };
    }
  }
  const { result, ids } = spawnTokens(doc, template, cell, spawn.count);
  const reason = map.run(result, 'action.tokenAdd');
  report(reason, say);
  if (reason) return false;
  ed.setSpawn(null);
  ed.setSelection(ids);
  if (ids.length < spawn.count)
    say('notice.tokensPartial', { placed: ids.length, count: spawn.count });
  return true;
}

// ------------------------------------------------------------------ Ziehen

interface TokenDrag {
  ids: Set<string>;
  /** Bezugstoken (unter dem Zeiger) und Versatz Zeiger → linke obere Ecke. */
  lead: string;
  offset: Point;
  origin: Cell;
}

let drag: TokenDrag | null = null;

export function isTokenDragging(): boolean {
  return drag !== null;
}

/** Beginnt das Ziehen; mit Gruppenmitgliedern, wenn das Token zu einer Gruppe gehört. */
export function beginTokenDrag(token: Token, point: Point): void {
  const doc = useMapStore.getState().doc;
  if (!doc) return;
  const ed = useEditorStore.getState();
  const base = ed.selection.has(token.id) ? ed.selection : new Set([token.id]);
  const ids = new Set(expandGroups(doc, base));
  for (const id of [...ids]) if (!doc.tokens.some((t) => t.id === id)) ids.delete(id);
  drag = {
    ids,
    lead: token.id,
    offset: { x: point.x - token.x, y: point.y - token.y },
    origin: { x: token.x, y: token.y },
  };
  previewTo(point);
}

function targetCell(point: Point, doc: MapDocument, lead: Token): Cell {
  const d = drag as TokenDrag;
  const n = tokenCells(lead);
  return {
    x: Math.min(doc.grid.cols - n, Math.max(0, Math.round(point.x - d.offset.x))),
    y: Math.min(doc.grid.rows - n, Math.max(0, Math.round(point.y - d.offset.y))),
  };
}

function previewTo(point: Point) {
  const doc = useMapStore.getState().doc;
  const ed = useEditorStore.getState();
  if (!drag || !doc) return;
  const lead = doc.tokens.find((t) => t.id === drag?.lead);
  if (!lead) return;
  const target = targetCell(point, doc, lead);
  const prev = ed.movePreview;
  if (prev && prev.target.x === target.x && prev.target.y === target.y) return;
  if (drag.ids.size > 1) {
    ed.setMovePreview({
      tokenId: lead.id,
      target,
      path: [drag.origin, target],
      cost: null,
      over: false,
    });
    return;
  }
  const out = moveToken(doc, lead.id, target, rule());
  const remaining = Math.max(0, lead.speed - lead.movementUsed);
  ed.setMovePreview({
    tokenId: lead.id,
    target,
    path: out.path ?? [drag.origin, target],
    cost: out.cost,
    over: out.cost === null || out.cost > remaining,
  });
}

export function tokenDragMove(point: Point): void {
  previewTo(point);
}

/** Ziehen beenden: ein Undo-Schritt; Hinweise zu Gelegenheitsangriffen und Bewegungsrate. */
export function endTokenDrag(say: Say): void {
  const d = drag;
  drag = null;
  const ed = useEditorStore.getState();
  const preview = ed.movePreview;
  ed.setMovePreview(null);
  const doc = useMapStore.getState().doc;
  if (!d || !preview || !doc) return;
  const lead = doc.tokens.find((t) => t.id === d.lead);
  if (!lead || (preview.target.x === lead.x && preview.target.y === lead.y)) return;
  if (d.ids.size > 1) {
    report(
      useMapStore
        .getState()
        .run(
          shiftTokens(doc, d.ids, preview.target.x - lead.x, preview.target.y - lead.y),
          'action.tokenMove',
        ),
      say,
    );
    return;
  }
  applyMove(doc, lead, moveToken(doc, lead.id, preview.target, rule()), say);
}

export function cancelTokenDrag(): void {
  drag = null;
  useEditorStore.getState().setMovePreview(null);
}

function applyMove(doc: MapDocument, token: Token, out: MoveOutcome, say: Say) {
  const reason = useMapStore.getState().run(out.result, 'action.tokenMove', undefined);
  report(reason, say);
  if (reason) return;
  announceEnteredEffects(doc, token.id, say);
  if (out.opportunity.length) {
    const names = out.opportunity.map((id) => doc.tokens.find((t) => t.id === id)?.name ?? '?');
    say('notice.opportunity', { names: names.join(', ') });
  }
  if (out.cost === null) say('notice.noPath');
  else if (token.movementUsed + out.cost > token.speed)
    say('notice.overBudget', { cost: token.movementUsed + out.cost, speed: token.speed });
}

/**
 * Pfeiltasten mit ausgewählten Tokens: ein einzelnes Token geht ein Feld (mit Kosten und
 * Gelegenheitsangriffs-Hinweis), mehrere werden gemeinsam verschoben. false = keine Tokens.
 */
export function stepSelectedTokens(dx: number, dy: number, say: Say): boolean {
  const doc = useMapStore.getState().doc;
  const sel = useEditorStore.getState().selection;
  if (!doc) return false;
  const tokens = doc.tokens.filter((t) => sel.has(t.id));
  if (!tokens.length || tokens.length !== sel.size) return false;
  const [single] = tokens;
  if (tokens.length === 1 && single) {
    applyMove(
      doc,
      single,
      moveToken(doc, single.id, { x: single.x + dx, y: single.y + dy }, rule()),
      say,
    );
  } else {
    report(useMapStore.getState().run(shiftTokens(doc, sel, dx, dy), 'action.tokenMove'), say);
  }
  return true;
}

/** Hinweis, wenn ein Token einen dauerhaften Effekt mit Auslöser „Betreten“ neu betritt. */
export function announceEnteredEffects(before: MapDocument, tokenId: string, say: Say): void {
  const after = useMapStore.getState().doc;
  if (!after) return;
  const name = after.tokens.find((t) => t.id === tokenId)?.name ?? '?';
  for (const e of effectsEntered(before, after, tokenId, useSettings.getState().coverageRule)) {
    say('notice.enteredEffect', {
      name,
      effect: e.name,
      save: saveText(e),
    });
  }
}

/** Änderung an ausgewählten Tokens als ein Undo-Schritt (mit Zusammenfassung bei Eingaben). */
export function runOnTokens(
  result: OpResult,
  label: MessageKey,
  say: Say,
  mergeKey?: string,
): void {
  report(useMapStore.getState().run(result, label, mergeKey), say);
}

// ------------------------------------------------------------------ Overlay

let reachCache: { doc: MapDocument; id: string; rule: string; cells: Cell[] } | null = null;

/** Erreichbare Positionen des einzigen ausgewählten Tokens (Restbewegung). */
export function moveRangeFor(doc: MapDocument, token: Token): Cell[] {
  const r = rule();
  if (reachCache && reachCache.doc === doc && reachCache.id === token.id && reachCache.rule === r)
    return reachCache.cells;
  const reach = tokenReach(doc, token, r);
  const cols = doc.grid.cols;
  const cells = [...reach.canEnd]
    .filter((i) => reach.cost.has(i))
    .map((i) => ({ x: i % cols, y: Math.floor(i / cols) }));
  reachCache = { doc, id: token.id, rule: r, cells };
  return cells;
}
