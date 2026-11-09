/**
 * Zustand des Karten-Editors (nicht gespeichert): Malquelle, Werkzeugoptionen,
 * aktive Ebene, Auswahl, Zwischenablage und Vorschau der Formwerkzeuge.
 */
import { create } from 'zustand';
import type { Cell, Point } from '../../core/grid';
import type { WallKind } from '../../core/walls';
import type { Creature } from '../../data/srd/creatures';
import type { TokenTemplate } from '../../editor/tokens';
import type { EffectTemplate } from '../../editor/effects';
import type { OriginSnap } from '../../core/aoe';
import type { LayerId, PlacedObject, Rotation, TerrainProps } from '../../storage/mapDocument';

export type PaintMode = 'element' | 'terrain';

export interface Marquee {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Wartendes Setzen von Tokens: der nächste Klick auf die Karte platziert sie. */
export interface PendingSpawn {
  template: TokenTemplate;
  count: number;
  /** Bild als Data-URL (Spielercharaktere/Homebrew), wird beim Setzen eingebettet. */
  imageData?: string;
}

/** Vorschau beim Ziehen eines Tokens. */
export interface MovePreview {
  tokenId: string;
  target: Cell;
  path: Cell[];
  /** Kosten in ft (null = kein regulärer Weg). */
  cost: number | null;
  over: boolean;
}

/** Effekt-Werkzeug: gewählte Vorlage und Einrast-Optionen. */
export interface AoeTool {
  template: EffectTemplate;
  originSnap: OriginSnap;
  /** Winkelschritt in Grad (0 = frei). */
  angleStep: number;
}

/** Laufende Platzierung: Ursprung (bei gerichteten Formen nach dem ersten Klick), Winkel, Zeiger. */
export interface AoePhase {
  origin: Point | null;
  angle: number;
  pointer: Point | null;
  /** Freie Fläche: gesammelte Felder. */
  cells: Cell[];
}

/** Ergebnis eines ausgelösten Effekts für den Rettungswurf-Assistenten. */
export interface AoeResult {
  name: string;
  template: EffectTemplate;
  cells: number;
  tokenIds: string[];
  /** Gesetzt, wenn der Effekt dauerhaft auf der Karte liegt. */
  effectId?: string;
}

export interface EditorState {
  paintMode: PaintMode;
  /** Gewähltes Element der Bibliothek (eingebaut oder eigenes). */
  elementId: string | null;
  /** Eigenschaften, die im Gelände-Modus gemalt werden. */
  terrainBrush: TerrainProps;
  rectFilled: boolean;
  /** Drehung für neu platzierte Objekte. */
  rotation: Rotation;
  /** Ebene für Radierer und Auswahl. */
  activeLayer: LayerId;
  snap: boolean;
  showTerrain: boolean;
  selection: ReadonlySet<string>;
  clipboard: PlacedObject[];
  /** Startfeld für Rechteck/Linie (Maus gedrückt oder per Eingabetaste gesetzt). */
  shapeAnchor: Cell | null;
  /** Felder der Formvorschau. */
  preview: Cell[];
  marquee: Marquee | null;
  /** Feld, dessen Notiz gerade bearbeitet wird. */
  noteCell: Cell | null;
  /** Art neu gezeichneter Kantenwände. */
  wallKind: WallKind;
  /** Bereits gesetzte Eckpunkte der aktuellen Wandkette (Feldkoordinaten). */
  wallChain: Point[];
  spawn: PendingSpawn | null;
  movePreview: MovePreview | null;
  /** Im Statblock-Dialog angezeigte Kreatur. */
  statblock: Creature | null;
  aoe: AoeTool | null;
  aoePhase: AoePhase;
  /** Offener Rettungswurf-Assistent. */
  assistant: AoeResult | null;
  /** Würfelfenster sichtbar. */
  diceOpen: boolean;
  /** Angriffsdialog für dieses Token (ID) offen. */
  attackerId: string | null;

  selectElement: (id: string, layer: LayerId) => void;
  setPaintMode: (mode: PaintMode) => void;
  setTerrainBrush: (props: TerrainProps) => void;
  setRectFilled: (filled: boolean) => void;
  rotatePlacement: (steps: number) => void;
  setActiveLayer: (layer: LayerId) => void;
  setSnap: (snap: boolean) => void;
  setShowTerrain: (show: boolean) => void;
  setSelection: (ids: Iterable<string>) => void;
  setClipboard: (objects: PlacedObject[]) => void;
  setShapeAnchor: (cell: Cell | null) => void;
  setPreview: (cells: Cell[]) => void;
  setMarquee: (m: Marquee | null) => void;
  setNoteCell: (cell: Cell | null) => void;
  setWallKind: (kind: WallKind) => void;
  setWallChain: (chain: Point[]) => void;
  setSpawn: (spawn: PendingSpawn | null) => void;
  setMovePreview: (p: MovePreview | null) => void;
  showStatblock: (c: Creature | null) => void;
  setAoe: (aoe: AoeTool | null) => void;
  setAoePhase: (p: Partial<AoePhase>) => void;
  openAssistant: (r: AoeResult | null) => void;
  setDiceOpen: (open: boolean) => void;
  openAttack: (tokenId: string | null) => void;
  reset: () => void;
}

const initial = {
  paintMode: 'element' as PaintMode,
  elementId: null,
  terrainBrush: { difficult: true } as TerrainProps,
  rectFilled: true,
  rotation: 0 as Rotation,
  activeLayer: 'floor' as LayerId,
  snap: true,
  showTerrain: false,
  selection: new Set<string>() as ReadonlySet<string>,
  clipboard: [] as PlacedObject[],
  shapeAnchor: null,
  preview: [] as Cell[],
  marquee: null,
  noteCell: null,
  wallKind: 'wall' as WallKind,
  wallChain: [] as Point[],
  spawn: null as PendingSpawn | null,
  movePreview: null as MovePreview | null,
  statblock: null as Creature | null,
  aoe: null as AoeTool | null,
  aoePhase: { origin: null, angle: 0, pointer: null, cells: [] } as AoePhase,
  assistant: null as AoeResult | null,
  diceOpen: false,
  attackerId: null as string | null,
};

export const useEditorStore = create<EditorState>((set) => ({
  ...initial,
  selectElement: (elementId, activeLayer) =>
    set({ elementId, activeLayer, paintMode: 'element', selection: new Set() }),
  setPaintMode: (paintMode) => set({ paintMode }),
  setTerrainBrush: (terrainBrush) => set({ terrainBrush, paintMode: 'terrain' }),
  setRectFilled: (rectFilled) => set({ rectFilled }),
  rotatePlacement: (steps) =>
    set((s) => ({ rotation: ((((s.rotation + steps * 90) % 360) + 360) % 360) as Rotation })),
  setActiveLayer: (activeLayer) => set({ activeLayer, selection: new Set() }),
  setSnap: (snap) => set({ snap }),
  setShowTerrain: (showTerrain) => set({ showTerrain }),
  setSelection: (ids) => set({ selection: new Set(ids) }),
  setClipboard: (clipboard) => set({ clipboard }),
  setShapeAnchor: (shapeAnchor) => set({ shapeAnchor }),
  setPreview: (preview) => set({ preview }),
  setMarquee: (marquee) => set({ marquee }),
  setNoteCell: (noteCell) => set({ noteCell }),
  setWallKind: (wallKind) => set({ wallKind }),
  setWallChain: (wallChain) => set({ wallChain }),
  setSpawn: (spawn) => set({ spawn }),
  setMovePreview: (movePreview) => set({ movePreview }),
  showStatblock: (statblock) => set({ statblock }),
  setAoe: (aoe) => set({ aoe, aoePhase: { origin: null, angle: 0, pointer: null, cells: [] } }),
  setAoePhase: (p) => set((s) => ({ aoePhase: { ...s.aoePhase, ...p } })),
  openAssistant: (assistant) => set({ assistant }),
  setDiceOpen: (diceOpen) => set({ diceOpen }),
  openAttack: (attackerId) => set({ attackerId }),
  reset: () => set({ ...initial, selection: new Set(), clipboard: [], preview: [], wallChain: [] }),
}));
