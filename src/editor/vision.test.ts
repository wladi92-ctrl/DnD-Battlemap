import { describe, expect, it } from 'vitest';
import { decodeRuns, MASK_EXPLORED, MASK_HIDDEN, MASK_VISIBLE } from '../core/vision';
import { createMap, type MapDocument } from '../storage/mapDocument';
import { resizeGrid, type OpResult } from './ops';
import { applyPatch, invertPatch } from './patch';
import { spawnTokens, type TokenTemplate } from './tokens';
import {
  addLight,
  cellsInPolygon,
  computeVision,
  LIGHT_PRESETS,
  lightFromPreset,
  lightPosition,
  playerDocument,
  revealAll,
  revealCells,
  setFogEnabled,
  setLighting,
} from './vision';
import { addWalls, deleteItems, moveItems } from './wallOps';

const apply = (doc: MapDocument, r: OpResult): MapDocument => {
  if (!r.ok) throw new Error(r.reason);
  return applyPatch(doc, r.patch);
};
const base: TokenTemplate = {
  name: 'X',
  kind: 'creature',
  size: 'medium',
  team: 'enemy',
  hpMax: 10,
  ac: 12,
  speed: 30,
  reach: 5,
  initiativeBonus: 0,
  passivePerception: 10,
  darkvision: 0,
};
const torch = LIGHT_PRESETS.find((p) => p.id === 'torch')!;
const COLS = 30;
const idx = (x: number, y: number) => y * COLS + x;

function spawn(doc: MapDocument, t: Partial<TokenTemplate>, x: number, y: number) {
  const { result, ids } = spawnTokens(doc, { ...base, ...t }, { x, y }, 1);
  return { doc: apply(doc, result), id: ids[0] as string };
}

describe('Nebel', () => {
  it('aufdecken, verdecken, alles, Polygon – rückgängig machbar', () => {
    let doc = createMap({ name: 'N', cols: COLS, rows: 20 });
    doc = apply(doc, setFogEnabled(doc, true));
    const r = revealCells(
      doc,
      [
        { x: 2, y: 3 },
        { x: 3, y: 3 },
      ],
      true,
    );
    doc = apply(doc, r);
    expect(decodeRuns(doc.fog.revealed, 600)[idx(2, 3)]).toBe(1);
    if (!r.ok) throw new Error();
    expect(applyPatch(doc, invertPatch(r.patch)).fog.revealed).toEqual([]);
    doc = apply(doc, revealCells(doc, [{ x: 2, y: 3 }], false));
    expect(decodeRuns(doc.fog.revealed, 600)[idx(2, 3)]).toBe(0);
    expect(revealCells(doc, [{ x: 2, y: 3 }], false).ok).toBe(false);
    doc = apply(doc, revealAll(doc, true));
    expect(doc.fog.revealed).toEqual([0, 600]);
    const tri = cellsInPolygon(
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 0, y: 4 },
      ],
      COLS,
      20,
    );
    expect(tri).toHaveLength(6); // Feldmitten unterhalb der Diagonale: 3+2+1
  });

  it('Spielermaske ohne Sicht: nur aufgedeckte Felder; Verkleinern richtet die Maske neu aus', () => {
    let doc = createMap({ name: 'N', cols: COLS, rows: 20 });
    doc = apply(doc, setFogEnabled(doc, true));
    doc = apply(
      doc,
      revealCells(
        doc,
        [
          { x: 25, y: 15 },
          { x: 1, y: 1 },
        ],
        true,
      ),
    );
    const v = computeVision(doc);
    expect(v.mask[idx(25, 15)]).toBe(MASK_VISIBLE);
    expect(v.mask[idx(5, 5)]).toBe(MASK_HIDDEN);
    const small = apply(doc, resizeGrid(doc, 20, 20));
    const m = decodeRuns(small.fog.revealed, 400);
    expect(m[1 * 20 + 1]).toBe(1);
    expect(m.reduce((a, b) => a + b, 0)).toBe(1); // (25,15) liegt außerhalb
  });
});

describe('Dynamische Sicht', () => {
  it('Spielercharakter mit Fackel sieht hellen Bereich; Erkundetes bleibt nach dem Bewegen', () => {
    let doc = createMap({ name: 'S', cols: COLS, rows: 20 });
    doc = apply(doc, setLighting(doc, { enabled: true, ambient: 'dark' }));
    const hero = spawn(doc, { name: 'Held', team: 'player', kind: 'pc' }, 5, 10);
    doc = hero.doc;
    const ork = spawn(doc, { name: 'Ork' }, 8, 10);
    doc = ork.doc;
    const far = spawn(doc, { name: 'Späher' }, 25, 10);
    doc = far.doc;
    doc = apply(doc, addLight(doc, lightFromPreset(torch, 'Fackel', 0, 0, hero.id)));
    expect(lightPosition(doc, doc.lights[0]!)).toEqual({ x: 5.5, y: 10.5 });
    let v = computeVision(doc);
    expect(v.mask[idx(9, 10)]).toBe(MASK_VISIBLE); // 20 ft hell
    expect(v.mask[idx(25, 10)]).toBe(MASK_HIDDEN); // dunkel, weit weg
    expect(v.explored).not.toBeNull();
    // Spieleransicht: Ork sichtbar, Späher im Dunkeln nicht
    const pdoc = playerDocument(doc, v.mask);
    expect(pdoc.tokens.map((t) => t.name).sort()).toEqual(['Held', 'Ork']);
    // Erkundet übernehmen, dann wegbewegen → vorher Gesehenes bleibt erkundet
    doc = { ...doc, explored: v.explored! };
    doc = apply(doc, moveItems(doc, new Set([hero.id]), 15, 0));
    v = computeVision(doc);
    expect(v.mask[idx(1, 10)]).toBe(MASK_EXPLORED);
    expect(v.mask[idx(20, 10)]).toBe(MASK_VISIBLE);
  });

  it('Wand verdeckt; Dunkelsicht; bewusstlose Charaktere sehen nichts', () => {
    let doc = createMap({ name: 'S', cols: COLS, rows: 20 });
    doc = apply(doc, setLighting(doc, { enabled: true, ambient: 'bright' }));
    doc = apply(doc, addWalls(doc, [{ x1: 10, y1: 0, x2: 10, y2: 20, kind: 'wall' }]));
    const elf = spawn(doc, { name: 'Elfe', team: 'player', kind: 'pc', darkvision: 60 }, 5, 5);
    doc = elf.doc;
    let v = computeVision(doc);
    expect(v.mask[idx(9, 5)]).toBe(MASK_VISIBLE);
    expect(v.mask[idx(11, 5)]).toBe(MASK_HIDDEN);
    doc = { ...doc, explored: v.explored! }; // übernimmt die Oberfläche still
    doc = apply(doc, setLighting(doc, { ambient: 'dark' }));
    v = computeVision(doc);
    expect(v.mask[idx(5, 15)]).toBe(MASK_VISIBLE); // 50 ft Dunkelsicht
    expect(v.mask[idx(5, 19)]).toBe(MASK_EXPLORED); // 70 ft: zuvor bei Tageslicht gesehen
    const knocked = {
      ...doc,
      tokens: doc.tokens.map((t) => ({ ...t, conditions: ['unconscious'] })),
    };
    expect(computeVision(knocked).mask[idx(5, 6)]).not.toBe(MASK_VISIBLE);
  });

  it('Spieleransicht: keine GM-Notizen, verborgene Tokens/Effekte, Geheimtüren als Wand', () => {
    let doc = createMap({ name: 'S', cols: COLS, rows: 20 });
    doc = apply(doc, addWalls(doc, [{ x1: 3, y1: 3, x2: 3, y2: 4, kind: 'secret' }]));
    const hidden = spawn(doc, { name: 'Assassine' }, 2, 2);
    doc = {
      ...hidden.doc,
      tokens: hidden.doc.tokens.map((t) => ({ ...t, hidden: true })),
      notes: [{ id: 'n', x: 1, y: 1, text: 'Falle' }],
    };
    const pdoc = playerDocument(doc, computeVision(doc).mask);
    expect(pdoc.tokens).toEqual([]);
    expect(pdoc.notes).toEqual([]);
    expect(pdoc.walls[0]).toMatchObject({ kind: 'wall' });
    expect(pdoc.walls[0]).not.toHaveProperty('state');
    expect(pdoc.layers.find((l) => l.id === 'gm')?.visible).toBe(false);
  });

  it('Lichtquellen verschieben und löschen über die gemeinsame Auswahl', () => {
    let doc = createMap({ name: 'L', cols: COLS, rows: 20 });
    doc = apply(doc, addLight(doc, lightFromPreset(torch, 'Fackel', 4.5, 4.5)));
    const id = doc.lights[0]!.id;
    doc = apply(doc, moveItems(doc, new Set([id]), 2, 1));
    expect(doc.lights[0]).toMatchObject({ x: 6.5, y: 5.5 });
    doc = apply(doc, deleteItems(doc, new Set([id])));
    expect(doc.lights).toEqual([]);
  });
});
