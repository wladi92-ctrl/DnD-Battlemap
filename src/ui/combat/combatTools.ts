/**
 * Kampfsteuerung der Oberfläche: Kampf beginnen/beenden, Initiative, Züge – jeweils mit
 * Hinweisen, Kampflog und optionaler Kamera-Nachführung. Unabhängig von React (testbar).
 */
import { ensureVisible } from '../../core/camera';
import { CELL_PX } from '../../core/grid';
import { SIZE_CELLS } from '../../data/srd/creatures';
import {
  actNow,
  currentEntry,
  delayTurn,
  endCombat,
  nextTurn,
  prevTurn,
  rollInitiative,
  startCombat,
  type TurnEvents,
} from '../../editor/combat';
import { affectedTokens, effectCells } from '../../editor/effects';
import type { OpResult } from '../../editor/ops';
import { translate, type MessageKey } from '../../i18n';
import type { LogKind, MapDocument } from '../../storage/mapDocument';
import { saveText } from '../map/effectTools';
import { useEditorStore } from '../state/editorStore';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useSettings } from '../state/settingsStore';
import { useViewStore } from '../state/viewStore';

/** Text in der eingestellten Sprache (für Log und Hinweise). */
export function tr(key: MessageKey, params?: Record<string, string | number>): string {
  return translate(useSettings.getState().locale, key, params);
}

export function log(kind: LogKind, text: string): void {
  useMapStore.getState().appendLog([{ kind, text }]);
}

const notice = (text: string): void => {
  useNoticeStore.getState().push('info', text);
};
const turnOptions = () => ({ skipDead: useSettings.getState().skipDead });

function run(result: OpResult, label: MessageKey): boolean {
  const reason = useMapStore.getState().run(result, label);
  if (reason === 'locked') notice(tr('notice.layerLocked'));
  return reason === null;
}

/** Kampf mit der Token-Auswahl (oder, ohne Auswahl, allen Tokens außer Toten) beginnen. */
export function beginCombat(): void {
  const { doc } = useMapStore.getState();
  if (!doc) return;
  const sel = useEditorStore.getState().selection;
  const picked = doc.tokens.filter((t) => sel.has(t.id)).map((t) => t.id);
  const ids = picked.length
    ? picked
    : doc.tokens.filter((t) => t.hp.current > 0 || t.kind === 'pc').map((t) => t.id);
  if (!ids.length) return notice(tr('notice.noCombatants'));
  if (run(startCombat(doc, ids), 'action.combat'))
    log('combat', tr('log.start', { count: ids.length }));
}

export function finishCombat(): void {
  const doc = useMapStore.getState().doc;
  if (!doc?.combat) return;
  const round = doc.combat.round;
  if (run(endCombat(doc), 'action.combat')) log('combat', tr('log.end', { round }));
}

export function rollAllInitiative(which: 'all' | 'missing' | 'npcs'): void {
  const doc = useMapStore.getState().doc;
  if (!doc) return;
  const { result, rolls } = rollInitiative(doc, which, useSettings.getState().tieRule);
  if (!rolls.length) return notice(tr('notice.nothingToRoll'));
  if (!run(result, 'action.initiative')) return;
  log(
    'roll',
    tr('log.initiative', {
      list: rolls
        .map((r) => `${r.name} ${r.total} (${r.roll}${r.bonus >= 0 ? '+' : ''}${r.bonus})`)
        .join(', '),
    }),
  );
}

/** Kamera auf das Token des aktuellen Zuges (falls „Kamera folgt“); Auswahl darauf setzen. */
export function focusCurrent(doc: MapDocument): void {
  const e = currentEntry(doc);
  if (e?.tokenId) focusToken(doc, e.tokenId, useSettings.getState().cameraFollow);
}

/** Token auswählen und (optional) ins Bild holen. */
export function focusToken(doc: MapDocument, tokenId: string, moveCamera = true): void {
  const t = doc.tokens.find((x) => x.id === tokenId);
  if (!t) return;
  useEditorStore.getState().setSelection([t.id]);
  if (!moveCamera) return;
  const view = useViewStore.getState();
  const n = Math.max(1, SIZE_CELLS[t.size]);
  // Mit Rand, damit das Token nicht am Bildschirmrand klebt.
  const pad = 3;
  view.setCamera(
    ensureVisible(view.camera, view.viewport, {
      x: (t.x - pad) * CELL_PX,
      y: (t.y - pad) * CELL_PX,
      width: (n + 2 * pad) * CELL_PX,
      height: (n + 2 * pad) * CELL_PX,
    }),
  );
}

/** Folgen eines Zugwechsels: Log, Hinweise (Rundenwechsel, abgelaufene Effekte, Zonen), Kamera. */
function afterTurn(ev: TurnEvents): void {
  const doc = useMapStore.getState().doc;
  if (!doc) return;
  if (ev.newRound !== null) log('turn', tr('log.round', { round: ev.newRound }));
  if (ev.expired.length) {
    const text = tr('notice.effectsExpired', { names: ev.expired.join(', ') });
    notice(text);
    log('effect', text);
  }
  const cur = ev.current;
  if (!cur) return;
  log('turn', tr('log.turn', { name: cur.name }));
  // Zonen mit Auslöser „Zugbeginn“, in denen der Aktive steht.
  const t = cur.tokenId ? doc.tokens.find((x) => x.id === cur.tokenId) : undefined;
  if (t) {
    const rule = useSettings.getState().coverageRule;
    for (const e of doc.effects) {
      if (e.trigger !== 'turnStart' && e.trigger !== 'both') continue;
      if (e.attachedTo === t.id) continue;
      if (!affectedTokens(doc, effectCells(doc, e, rule)).some((x) => x.id === t.id)) continue;
      const text = tr('notice.turnStartInEffect', {
        effect: e.name,
        names: t.name,
        save: saveText(e),
      });
      notice(text);
      log('effect', text);
    }
  }
  focusCurrent(doc);
}

export function advanceTurn(): void {
  const doc = useMapStore.getState().doc;
  if (!doc?.combat) return;
  const ev = nextTurn(doc, turnOptions());
  if (!ev.result.ok) return notice(tr('notice.nobodyCanAct'));
  if (run(ev.result, 'action.turn')) afterTurn(ev);
}

export function previousTurn(): void {
  const doc = useMapStore.getState().doc;
  if (!doc?.combat) return;
  if (run(prevTurn(doc, turnOptions()), 'action.turn')) {
    const after = useMapStore.getState().doc;
    if (after) {
      log('turn', tr('log.back', { name: currentEntry(after)?.name ?? '?' }));
      focusCurrent(after);
    }
  }
}

export function delayCurrent(): void {
  const doc = useMapStore.getState().doc;
  const cur = doc && currentEntry(doc);
  if (!doc || !cur) return;
  const ev = delayTurn(doc, turnOptions());
  if (!run(ev.result, 'action.turn')) return;
  log('turn', tr('log.delay', { name: cur.name }));
  afterTurn(ev);
}

export function actNowEntry(entryId: string): void {
  const doc = useMapStore.getState().doc;
  if (!doc) return;
  const name = doc.combat?.entries.find((e) => e.id === entryId)?.name ?? '?';
  if (!run(actNow(doc, entryId), 'action.turn')) return;
  log('turn', tr('log.actNow', { name }));
  const after = useMapStore.getState().doc;
  if (after) focusCurrent(after);
}
