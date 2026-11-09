import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { decodeRuns, MASK_EXPLORED, MASK_HIDDEN, MASK_VISIBLE } from '../../core/vision';
import { spawnTokens, type TokenTemplate } from '../../editor/tokens';
import { effectFromTemplate, type EffectTemplate } from '../../editor/effects';

const cloud: EffectTemplate = {
  name: 'Wolke',
  shape: 'sphere',
  size: 10,
  color: '#888888',
  wallMode: 'line',
  rounds: 10,
  concentration: false,
  trigger: 'none',
};
import { setFileAccess } from '../../storage/fileAccess';
import { createLocalStorageLibrary, setLibrary } from '../../storage/library';
import { PlayerApp, realSizeZoom } from '../player/PlayerApp';
import { useEditorStore } from '../state/editorStore';
import { useLibraryStore } from '../state/libraryStore';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useRecoveryStore } from '../state/recoveryStore';
import { useSettings } from '../state/settingsStore';
import { useViewStore } from '../state/viewStore';
import { createFakeFileAccess } from '../testing/fakeFileAccess';
import { MapRenderer } from '../testing/fakeMapRenderer';
import {
  PLAYER_CHANNEL,
  playerState,
  startPlayerBroadcast,
  type PlayerMessage,
} from './playerChannel';

vi.mock('../../render/graphicsSupport', () => ({
  detectGraphicsSupport: () => Promise.resolve({ kind: 'webgl', version: 2 }),
}));
vi.mock('../../render/MapRenderer', () => import('../testing/fakeMapRenderer'));

globalThis.ResizeObserver ??= class {
  observe() {}
  disconnect() {}
  unobserve() {}
} as unknown as typeof ResizeObserver;

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

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
const LOADING = 'Grafik wird geladen …';
const COLS = 20;
const idx = (x: number, y: number) => y * COLS + x;

function reset() {
  useSettings.getState().reset();
  useMapStore.getState().closeMap();
  useViewStore.getState().reset();
  useEditorStore.getState().reset();
  useRecoveryStore.getState().setPending(null);
  useNoticeStore.setState({ notices: [] });
  useLibraryStore.setState({ pcs: [], homebrew: [], effects: [], status: 'idle', error: null });
  setLibrary(createLocalStorageLibrary(memoryStorage()));
  setFileAccess(createFakeFileAccess());
  location.hash = '';
}

function addToken(t: Partial<TokenTemplate>, x: number, y: number) {
  const doc = useMapStore.getState().doc!;
  const r = spawnTokens(doc, { ...base, ...t }, { x, y }, 1).result;
  if (r.ok) useMapStore.getState().apply(r.patch, 'action.tokenAdd');
}

async function setup() {
  const user = userEvent.setup();
  render(<App />);
  act(() => {
    useMapStore.getState().newMap({ name: 'Gruft', cols: COLS, rows: 20 });
    addToken({ name: 'Held', team: 'player', kind: 'pc' }, 3, 10);
    addToken({ name: 'Ork' }, 6, 10);
    addToken({ name: 'Assassine' }, 16, 10);
  });
  await screen.findByRole('application');
  await waitFor(() => expect(screen.queryByText(LOADING)).toBeNull());
  return user;
}

function enterAt(x: number, y: number) {
  act(() => useViewStore.getState().setCursorCell({ x, y }));
  screen.getByRole('application').focus();
}

describe('Nebel, Licht und Sicht (GM)', () => {
  beforeEach(reset);

  it('Nebel einschalten, mit dem Pinsel (3×3) aufdecken, alles verdecken', async () => {
    const user = await setup();
    await user.click(screen.getByLabelText('Nebel des Krieges (manuell aufdecken)'));
    expect(useMapStore.getState().doc!.fog.enabled).toBe(true);
    expect(MapRenderer.last?.fog.mask?.[idx(3, 10)]).toBe(MASK_HIDDEN);
    await user.keyboard('o');
    await user.click(screen.getByLabelText('3×3'));
    enterAt(5, 5);
    await user.keyboard('{Enter}');
    const revealed = decodeRuns(useMapStore.getState().doc!.fog.revealed, COLS * 20);
    expect(revealed.reduce((a, b) => a + b, 0)).toBe(9);
    expect(MapRenderer.last?.fog).toMatchObject({ mode: 'gm' });
    expect(MapRenderer.last?.fog.mask?.[idx(4, 4)]).toBe(MASK_VISIBLE);
    await user.click(screen.getByRole('button', { name: 'Alles verdecken' }));
    expect(useMapStore.getState().doc!.fog.revealed).toEqual([]);
    await user.keyboard('{Control>}z{/Control}');
    expect(decodeRuns(useMapStore.getState().doc!.fog.revealed, COLS * 20)[idx(5, 5)]).toBe(1);
  });

  it('Fackel an den Helden heften, Sicht im Dunkeln, „Als Spieler ansehen“', async () => {
    const user = await setup();
    await user.click(screen.getByLabelText('Dynamische Sicht und Licht'));
    await user.selectOptions(screen.getByLabelText('Grundhelligkeit'), 'dark');
    enterAt(3, 10); // Feld des Helden (Fokus auf die Karte, nicht im Auswahlfeld)
    await user.keyboard('i');
    expect(useViewStore.getState().tool).toBe('light');
    await user.keyboard('{Enter}');
    const light = useMapStore.getState().doc!.lights[0]!;
    expect(light).toMatchObject({ name: 'Fackel (Held)', bright: 20, dim: 40 });
    expect(light.attachedTo).toBeDefined();
    expect(MapRenderer.last?.lights).toHaveLength(1);
    const mask = MapRenderer.last!.fog.mask!;
    expect(mask[idx(6, 10)]).toBe(MASK_VISIBLE); // Ork im Fackelschein
    // Assassine im Dunkeln: nicht sichtbar (nur „erkundet“, weil kurz zuvor Tageslicht herrschte)
    expect(mask[idx(16, 10)]).toBe(MASK_EXPLORED);
    // Erkundetes wird still übernommen
    await waitFor(() => expect(useMapStore.getState().doc!.explored.length).toBeGreaterThan(0));

    await user.click(screen.getByRole('button', { name: 'Als Spieler ansehen' }));
    expect(MapRenderer.last?.fog.mode).toBe('player');
    expect(MapRenderer.last?.doc?.tokens.map((t) => t.name).sort()).toEqual(['Held', 'Ork']);
    expect(MapRenderer.last?.lights).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'GM-Ansicht' }));
    expect(MapRenderer.last?.doc?.tokens).toHaveLength(3);
  });
});

describe('Spieleransicht', () => {
  beforeEach(reset);

  it('reale Größe: 55″ bei 1920×1080 → 1 Feld ≈ 40 CSS-Pixel', () => {
    const z = realSizeZoom({ diagonal: 55, correction: 100 }, { width: 1920, height: 1080 }, 1);
    expect(z * 64).toBeCloseTo(40.05, 1);
    // HiDPI: gleiche physische Größe, halbe CSS-Pixel-Zahl pro Zoll
    const hi = realSizeZoom({ diagonal: 27, correction: 100 }, { width: 1920, height: 1080 }, 2);
    expect(hi * 64).toBeCloseTo(81.6, 0);
  });

  it('GM sendet über den Kanal nur Erlaubtes; die Spieleransicht zeigt es an', async () => {
    act(() => {
      useMapStore.getState().newMap({ name: 'Gruft', cols: COLS, rows: 20 });
      addToken({ name: 'Held', team: 'player', kind: 'pc' }, 3, 10);
      addToken({ name: 'Geist' }, 8, 10);
    });
    act(() => {
      const d = useMapStore.getState().doc!;
      useMapStore.setState({
        doc: {
          ...d,
          tokens: d.tokens.map((t) => (t.name === 'Geist' ? { ...t, hidden: true } : t)),
          notes: [{ id: 'n', x: 1, y: 1, text: 'geheim' }],
          effects: [
            effectFromTemplate({ ...cloud, name: 'Nebelwolke' }, { x: 5, y: 5 }, 0),
            { ...effectFromTemplate({ ...cloud, name: 'Falle' }, { x: 9, y: 9 }, 0), hidden: true },
          ],
        },
      });
    });
    const st = playerState(useMapStore.getState().doc!);
    expect(st.mask).toBeNull();
    expect(st.doc.tokens.map((t) => t.name)).toEqual(['Held']);
    expect(st.doc.notes).toEqual([]);

    const stop = startPlayerBroadcast();
    render(<PlayerApp />);
    await waitFor(() => expect(MapRenderer.last?.doc?.name).toBe('Gruft'), { timeout: 3000 });
    expect(MapRenderer.last?.doc?.tokens.map((t) => t.name)).toEqual(['Held']);
    expect(MapRenderer.last?.fog).toEqual({ mask: null, mode: 'player' });
    // Effekte kommen in der Spieleransicht an (verborgene nicht)
    expect(MapRenderer.last?.effects.map((e) => e.label)).toEqual(['Nebelwolke · 10 Rd.']);
    expect(screen.queryByText(/Warte auf die Karte/)).toBeNull();
    stop();
  });

  it('wartet ohne Karte und meldet sich beim GM-Fenster an', async () => {
    const seen: string[] = [];
    const gm = new BroadcastChannel(PLAYER_CHANNEL);
    gm.onmessage = (e: MessageEvent<PlayerMessage>) => seen.push(e.data.type);
    render(<PlayerApp />);
    expect(screen.getByText(/Warte auf die Karte/)).toBeInTheDocument();
    await waitFor(() => expect(seen).toContain('hello'));
    expect(
      within(screen.getByRole('toolbar', { name: 'Ansicht' })).getByRole('button', {
        name: 'Reale Größe …',
      }),
    ).toBeInTheDocument();
    gm.close();
  });
});
