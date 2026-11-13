/**
 * Temporäres Overlay: Zeichnungen (Pfeil, Kreis, Freihand) und Pings. Bewusst flüchtig – nicht
 * Teil der Karte, nicht im Rückgängig-Verlauf, nicht gespeichert; die Spieleransicht zeigt es
 * live mit. Koordinaten in Feldern (gebrochen).
 */
import { create } from 'zustand';
import type { Point } from '../../core/grid';

export type DrawShape = 'arrow' | 'circle' | 'free';
export const DRAW_SHAPES: readonly DrawShape[] = ['arrow', 'circle', 'free'];
export const DRAW_COLORS = ['#d7263d', '#f2c14e', '#2e86de', '#1b998b', '#ffffff', '#111111'];

export interface Drawing {
  id: string;
  shape: DrawShape;
  points: Point[];
  color: string;
}

export interface Ping {
  id: string;
  x: number;
  y: number;
  color: string;
  /** Zeitpunkt (ms, performance.now bzw. Date.now). */
  at: number;
}

/** Dauer eines Pings. */
export const PING_MS = 3000;
/** Höchstzahl gleichzeitiger Zeichnungen (älteste fallen weg). */
export const DRAWINGS_MAX = 200;
/** Freihand: Mindestabstand zwischen gespeicherten Punkten (Felder). */
const FREE_STEP = 0.12;

interface OverlayState {
  drawings: Drawing[];
  draft: Drawing | null;
  pings: Ping[];
  shape: DrawShape;
  color: string;
  setShape: (shape: DrawShape) => void;
  setColor: (color: string) => void;
  /** Beginnt eine Zeichnung am Punkt. */
  begin: (p: Point) => void;
  /** Erweitert die laufende Zeichnung (Freihand: Punkt anhängen, sonst Endpunkt setzen). */
  extend: (p: Point) => void;
  /** Schließt die Zeichnung ab; zu kleine Zeichnungen werden verworfen. */
  commit: () => void;
  cancelDraft: () => void;
  clear: () => void;
  ping: (p: Point, now?: number) => void;
  prunePings: (now?: number) => void;
  /** Für die Spieleransicht: kompletten Zustand übernehmen. */
  replace: (drawings: Drawing[], pings: Ping[]) => void;
  reset: () => void;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const id = () => crypto.randomUUID();

export function isMeaningful(d: Drawing): boolean {
  const [a, b] = [d.points[0], d.points[d.points.length - 1]];
  if (!a || !b) return false;
  if (d.shape === 'free') return d.points.length >= 2 && d.points.some((p) => dist(p, a) > 0.2);
  return dist(a, b) > 0.2;
}

const initial = {
  drawings: [] as Drawing[],
  draft: null as Drawing | null,
  pings: [] as Ping[],
  shape: 'arrow' as DrawShape,
  color: DRAW_COLORS[0] ?? '#d7263d',
};

export const useOverlayStore = create<OverlayState>((set, get) => ({
  ...initial,
  setShape: (shape) => set({ shape }),
  setColor: (color) => set({ color }),
  begin: (p) => {
    const { shape, color } = get();
    set({ draft: { id: id(), shape, color, points: shape === 'free' ? [p] : [p, p] } });
  },
  extend: (p) => {
    const d = get().draft;
    if (!d) return;
    if (d.shape === 'free') {
      const last = d.points[d.points.length - 1];
      if (last && dist(last, p) < FREE_STEP) return;
      set({ draft: { ...d, points: [...d.points, p] } });
    } else {
      set({ draft: { ...d, points: [d.points[0] ?? p, p] } });
    }
  },
  commit: () => {
    const d = get().draft;
    if (!d) return;
    set((s) => ({
      draft: null,
      drawings: isMeaningful(d) ? [...s.drawings, d].slice(-DRAWINGS_MAX) : s.drawings,
    }));
  },
  cancelDraft: () => set({ draft: null }),
  clear: () => set({ drawings: [], draft: null }),
  ping: (p, now = Date.now()) => {
    set((s) => ({
      pings: [
        ...s.pings.filter((x) => now - x.at < PING_MS),
        { id: id(), x: p.x, y: p.y, color: get().color, at: now },
      ],
    }));
    // Abgelaufene Pings später entfernen (die Darstellung blendet sie ohnehin aus).
    setTimeout(() => get().prunePings(), PING_MS + 50);
  },
  prunePings: (now = Date.now()) => {
    const live = get().pings.filter((x) => now - x.at < PING_MS);
    if (live.length !== get().pings.length) set({ pings: live });
  },
  replace: (drawings, pings) => set({ drawings, pings }),
  reset: () => set({ ...initial }),
}));

/** Darstellungsdaten (Zeichnungen inkl. laufender, Pings mit Alter in ms). */
export function overlayVisuals(
  s: Pick<OverlayState, 'drawings' | 'draft' | 'pings'>,
  now = Date.now(),
) {
  return {
    items: s.draft ? [...s.drawings, s.draft] : s.drawings,
    pings: s.pings
      .map((p) => ({ x: p.x, y: p.y, color: p.color, age: now - p.at }))
      .filter((p) => p.age < PING_MS),
  };
}
