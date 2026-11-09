/** Platzbedarf platzierter Objekte und daraus abgeleitete Geländeeigenschaften. */
import type { Cell } from '../core/grid';
import { resolveElement } from '../data/elements';
import {
  cellKey,
  layerState,
  type MapDocument,
  type PlacedObject,
  type Rotation,
  type TerrainProps,
} from '../storage/mapDocument';

/** Größe auf der Karte (bei 90°/270° vertauscht). */
export function footprintSize(o: Pick<PlacedObject, 'w' | 'h' | 'rotation'>): {
  w: number;
  h: number;
} {
  return o.rotation === 90 || o.rotation === 270 ? { w: o.h, h: o.w } : { w: o.w, h: o.h };
}

/** Rechteck in Feldkoordinaten (kann bei freier Platzierung gebrochen sein). */
export function footprintRect(o: PlacedObject) {
  const { w, h } = footprintSize(o);
  return { x: o.x, y: o.y, w, h };
}

/** Felder, deren Mittelpunkt im Platzbedarf liegt. */
export function footprintCells(o: PlacedObject): Cell[] {
  const r = footprintRect(o);
  const out: Cell[] = [];
  for (let y = Math.ceil(r.y - 0.5); y + 0.5 < r.y + r.h; y++) {
    for (let x = Math.ceil(r.x - 0.5); x + 0.5 < r.x + r.w; x++) out.push({ x, y });
  }
  return out;
}

export function coversCell(o: PlacedObject, c: Cell): boolean {
  const r = footprintRect(o);
  const cx = c.x + 0.5;
  const cy = c.y + 0.5;
  return cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h;
}

/** Punkt (in Feldern, gebrochen) liegt im Platzbedarf. */
export function containsPoint(o: PlacedObject, px: number, py: number): boolean {
  const r = footprintRect(o);
  return px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;
}

export function rotateBy(r: Rotation, steps: number): Rotation {
  return ((((r + steps * 90) % 360) + 360) % 360) as Rotation;
}

const COVER_RANK = { half: 1, threeQuarters: 2, full: 3 } as const;

/** Kombiniert Eigenschaften: "stärkste" gewinnt (Deckung, Blockade), Schaden/Höhe zuletzt gesetzt. */
export function combineTerrain(a: TerrainProps, b: TerrainProps): TerrainProps {
  const out: TerrainProps = { ...a };
  if (b.difficult) out.difficult = true;
  if (b.blocksSight) out.blocksSight = true;
  if (b.blocksMovement) out.blocksMovement = true;
  if (b.cover && (!out.cover || COVER_RANK[b.cover] > COVER_RANK[out.cover])) out.cover = b.cover;
  if (b.damage) out.damage = b.damage;
  if (b.elevation !== undefined) out.elevation = b.elevation;
  return out;
}

/**
 * Wirksame Geländeeigenschaften eines Feldes: Vorgaben von Boden und Objekten
 * (nur sichtbare Ebenen) kombiniert mit explizit gemaltem Gelände. Gemaltes Gelände
 * ergänzt die Vorgaben; Höhe und Schadensart aus dem Gemalten haben Vorrang.
 */
export function effectiveTerrain(doc: MapDocument, c: Cell): TerrainProps {
  let out: TerrainProps = {};
  const i = c.y * doc.grid.cols + c.x;
  const floorId = doc.floor[i];
  if (floorId) out = combineTerrain(out, resolveElement(floorId, doc.customElements)?.props ?? {});
  for (const o of doc.objects) {
    if (!layerState(doc, o.layer).visible || !coversCell(o, c)) continue;
    out = combineTerrain(out, resolveElement(o.element, doc.customElements)?.props ?? {});
  }
  const explicit = doc.terrain[cellKey(c.x, c.y)];
  return explicit ? combineTerrain(out, explicit) : out;
}

/**
 * Wirksames Gelände aller Felder auf einmal (Index y·cols+x → Eigenschaften), nur Felder
 * mit mindestens einer Eigenschaft. Gleiches Ergebnis wie effectiveTerrain je Feld, aber
 * in einem Durchlauf über Boden und Objekte (für das Gelände-Overlay großer Karten).
 */
export function computeTerrainGrid(doc: MapDocument): Map<number, TerrainProps> {
  const { cols, rows } = doc.grid;
  const out = new Map<number, TerrainProps>();
  const add = (i: number, p: TerrainProps | undefined) => {
    if (!p || !Object.keys(p).length) return;
    out.set(i, combineTerrain(out.get(i) ?? {}, p));
  };
  const propsCache = new Map<string, TerrainProps | undefined>();
  const propsOf = (id: string) => {
    if (!propsCache.has(id)) propsCache.set(id, resolveElement(id, doc.customElements)?.props);
    return propsCache.get(id);
  };
  doc.floor.forEach((id, i) => id && add(i, propsOf(id)));
  for (const o of doc.objects) {
    if (!layerState(doc, o.layer).visible) continue;
    const p = propsOf(o.element);
    if (!p || !Object.keys(p).length) continue;
    for (const c of footprintCells(o)) {
      if (c.x >= 0 && c.y >= 0 && c.x < cols && c.y < rows) add(c.y * cols + c.x, p);
    }
  }
  for (const [key, p] of Object.entries(doc.terrain)) {
    const [x, y] = key.split(',').map(Number);
    if (x !== undefined && y !== undefined) add(y * cols + x, p);
  }
  return out;
}
