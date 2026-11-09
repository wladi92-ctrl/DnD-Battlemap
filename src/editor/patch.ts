/**
 * Änderungen am Kartendokument als umkehrbare Patches (Command-Pattern für Undo/Redo).
 *
 * - Kleine Felder (Name, Raster, Objekte, Notizen …) werden komplett vorher/nachher gespeichert.
 * - Bodenkacheln und Gelände ändern sich zellweise und werden als Einzeländerungen gespeichert,
 *   damit 500 Undo-Schritte auch bei 200×200-Karten wenig Speicher brauchen.
 */
import type { MapDocument, TerrainProps } from '../storage/mapDocument';

/** Felder, die als Ganzes ersetzt werden. */
export type WholeFields = Pick<
  MapDocument,
  | 'name'
  | 'grid'
  | 'background'
  | 'layers'
  | 'floor'
  | 'objects'
  | 'terrain'
  | 'notes'
  | 'customElements'
  | 'walls'
  | 'tokens'
  | 'effects'
  | 'combat'
>;

export type FloorChange = [index: number, before: string, after: string];
export type TerrainChange = [key: string, before: TerrainProps | null, after: TerrainProps | null];

export interface DocPatch {
  whole?: { [K in keyof WholeFields]?: { b: WholeFields[K]; a: WholeFields[K] } };
  floor?: FloorChange[];
  terrain?: TerrainChange[];
}

type Dir = 'a' | 'b';

export function isEmptyPatch(p: DocPatch): boolean {
  return (
    Object.keys(p.whole ?? {}).length === 0 && !(p.floor?.length ?? 0) && !(p.terrain?.length ?? 0)
  );
}

/** Wendet den Patch in Richtung "a" (redo) oder "b" (undo) an. Liefert ein neues Dokument. */
export function applyPatch(doc: MapDocument, patch: DocPatch, dir: Dir = 'a'): MapDocument {
  let next: MapDocument = { ...doc };
  if (patch.whole) {
    for (const [key, change] of Object.entries(patch.whole)) {
      if (change) next = { ...next, [key]: change[dir] };
    }
  }
  if (patch.floor?.length) {
    const floor = next.floor.slice();
    const list = dir === 'a' ? patch.floor : [...patch.floor].reverse();
    for (const [i, b, a] of list) floor[i] = dir === 'a' ? a : b;
    next.floor = floor;
  }
  if (patch.terrain?.length) {
    const terrain = new Map(Object.entries(next.terrain));
    const list = dir === 'a' ? patch.terrain : [...patch.terrain].reverse();
    for (const [key, b, a] of list) {
      const value = dir === 'a' ? a : b;
      if (value) terrain.set(key, value);
      else terrain.delete(key);
    }
    next.terrain = Object.fromEntries(terrain);
  }
  return next;
}

type WholePatch = NonNullable<DocPatch['whole']>;

export function invertPatch(p: DocPatch): DocPatch {
  const out: DocPatch = {};
  if (p.whole) {
    out.whole = Object.fromEntries(
      Object.entries(p.whole).map(([k, v]) => [k, v && { b: v.a, a: v.b }]),
    ) as WholePatch;
  }
  if (p.floor) out.floor = [...p.floor].reverse().map(([i, b, a]) => [i, a, b]);
  if (p.terrain) out.terrain = [...p.terrain].reverse().map(([k, b, a]) => [k, a, b]);
  return out;
}

/**
 * Fasst zwei aufeinanderfolgende Patches zu einem zusammen (z. B. Pinselstrich,
 * Schieberegler). Für jede Zelle bleibt der erste Vorher- und der letzte Nachher-Wert.
 */
export function mergePatches(first: DocPatch, second: DocPatch): DocPatch {
  const out: DocPatch = {};
  const whole = { ...first.whole } as Record<string, { b: unknown; a: unknown }>;
  for (const [k, v] of Object.entries(second.whole ?? {})) {
    if (!v) continue;
    const prev = whole[k];
    whole[k] = prev ? { b: prev.b, a: v.a } : v;
  }
  if (Object.keys(whole).length) out.whole = whole as WholePatch;

  if (first.floor || second.floor) {
    const map = new Map<number, FloorChange>();
    for (const ch of [...(first.floor ?? []), ...(second.floor ?? [])]) {
      const prev = map.get(ch[0]);
      map.set(ch[0], prev ? [ch[0], prev[1], ch[2]] : ch);
    }
    out.floor = [...map.values()].filter(([, b, a]) => b !== a);
  }
  if (first.terrain || second.terrain) {
    const map = new Map<string, TerrainChange>();
    for (const ch of [...(first.terrain ?? []), ...(second.terrain ?? [])]) {
      const prev = map.get(ch[0]);
      map.set(ch[0], prev ? [ch[0], prev[1], ch[2]] : ch);
    }
    out.terrain = [...map.values()];
  }
  return out;
}

/** Hilfsfunktion: Patch für das Ersetzen eines ganzen Feldes. */
export function replaceField<K extends keyof WholeFields>(
  doc: MapDocument,
  key: K,
  value: WholeFields[K],
): DocPatch {
  return { whole: { [key]: { b: doc[key], a: value } } as WholePatch };
}
