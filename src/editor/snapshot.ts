/**
 * Schnappschüsse („Vorher/Nachher“, Spielstand): vollständige Kopie des Kartenzustands mit
 * Namen und Zeit. Wiederherstellen ist ein normaler, rückgängig machbarer Schritt; das
 * Kampflog bleibt dabei unberührt (es dokumentiert den tatsächlichen Verlauf).
 */
import type { MapDocument } from '../storage/mapDocument';
import type { OpResult } from './ops';
import type { DocPatch, WholeFields } from './patch';

export interface MapSnapshot {
  id: string;
  name: string;
  createdAt: string;
  doc: MapDocument;
}

export const SNAPSHOTS_MAX = 20;
export const SNAPSHOT_NAME_MAX = 80;

const RESTORED: readonly (keyof WholeFields)[] = [
  'name',
  'grid',
  'background',
  'layers',
  'floor',
  'objects',
  'terrain',
  'notes',
  'customElements',
  'walls',
  'tokens',
  'effects',
  'combat',
  'fog',
  'lighting',
  'lights',
  'explored',
];

export function createSnapshot(doc: MapDocument, name: string, now = new Date()): MapSnapshot {
  return {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, SNAPSHOT_NAME_MAX) || now.toLocaleString(),
    createdAt: now.toISOString(),
    // Kampflog nicht mitkopieren: es bleibt beim Wiederherstellen ohnehin erhalten.
    doc: { ...doc, combatLog: [] },
  };
}

/** Patch, der das Dokument auf den Stand des Schnappschusses bringt. */
export function restoreSnapshot(doc: MapDocument, snap: MapSnapshot): OpResult {
  const whole: Record<string, { b: unknown; a: unknown }> = {};
  for (const key of RESTORED) {
    const before = doc[key];
    const after = snap.doc[key];
    if (JSON.stringify(before) !== JSON.stringify(after)) whole[key] = { b: before, a: after };
  }
  if (!Object.keys(whole).length) return { ok: false, reason: 'nothing' };
  return { ok: true, patch: { whole } as DocPatch };
}
