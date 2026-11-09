import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { spawnTokens, type TokenTemplate } from '../../editor/tokens';
import { setFileAccess } from '../../storage/fileAccess';
import { createLocalStorageLibrary, setLibrary } from '../../storage/library';
import { useEditorStore } from '../state/editorStore';
import { useLibraryStore } from '../state/libraryStore';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useRecoveryStore } from '../state/recoveryStore';
import { useSettings } from '../state/settingsStore';
import { useViewStore } from '../state/viewStore';
import { MapRenderer } from '../testing/fakeMapRenderer';
import { createFakeFileAccess } from '../testing/fakeFileAccess';

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

const goblin: TokenTemplate = {
  name: 'Goblin',
  kind: 'creature',
  source: 'goblin',
  size: 'small',
  team: 'enemy',
  hpMax: 7,
  ac: 15,
  speed: 30,
  reach: 5,
  initiativeBonus: 2,
  passivePerception: 9,
  darkvision: 60,
};

function reset() {
  useSettings.getState().reset();
  useMapStore.getState().closeMap();
  useViewStore.getState().reset();
  useEditorStore.getState().reset();
  useRecoveryStore.getState().setPending(null);
  useNoticeStore.setState({ notices: [] });
  useLibraryStore.setState({
    pcs: [],
    homebrew: [],
    effects: [],
    portraits: {},
    status: 'idle',
    error: null,
  });
  setLibrary(createLocalStorageLibrary(memoryStorage()));
  setFileAccess(createFakeFileAccess());
}

async function setup() {
  const user = userEvent.setup();
  render(<App />);
  act(() => {
    useMapStore.getState().newMap({ name: 'Kampf', cols: 30, rows: 20 });
    const doc = useMapStore.getState().doc!;
    const r = spawnTokens(doc, goblin, { x: 10, y: 10 }, 3).result;
    if (r.ok) useMapStore.getState().apply(r.patch, 'action.tokenAdd');
  });
  await screen.findByRole('application');
  return user;
}

function enterAt(x: number, y: number) {
  act(() => useViewStore.getState().setCursorCell({ x, y }));
  screen.getByRole('application').focus();
}

async function chooseEffect(
  user: ReturnType<typeof userEvent.setup>,
  search: string,
  name: RegExp,
) {
  await user.click(screen.getByRole('tab', { name: 'Effekte' }));
  await screen.findByText(/\d+ Effekte/);
  const box = screen.getByLabelText('Effekt suchen');
  await user.clear(box);
  await user.type(box, search);
  await user.click(screen.getByRole('option', { name }));
}

describe('Flächeneffekte', () => {
  beforeEach(reset);

  it('Feuerball per Tastatur auslösen, Rettungswürfe eintragen, Schaden anwenden', async () => {
    const user = await setup();
    await chooseEffect(user, 'fireball', /^Fireball/);
    const group = screen.getByRole('group', { name: 'Fireball' });
    await user.selectOptions(within(group).getByLabelText('Zauberplatz'), '3');
    const dc = within(group).getByLabelText('SG des Zaubernden');
    await user.clear(dc);
    await user.type(dc, '14');
    await user.click(within(group).getByRole('button', { name: 'Platzieren' }));
    expect(useViewStore.getState().tool).toBe('effect');
    expect(useEditorStore.getState().aoe?.template).toMatchObject({
      name: 'Fireball',
      damage: '8d6',
      wallMode: 'spread',
      save: { dc: 14 },
    });

    // Rasterkreuzung (11,11) = linke obere Ecke des Fokusfeldes
    enterAt(11, 11);
    await user.keyboard('{Enter}');
    const dlg = await screen.findByRole('dialog', { name: 'Rettungswürfe: Fireball' });
    expect(within(dlg).getByText('52 Felder / 3 Ziele betroffen')).toBeInTheDocument();
    // Sofortiger Effekt: nichts bleibt auf der Karte
    expect(useMapStore.getState().doc!.effects).toEqual([]);

    const total = within(dlg).getByLabelText('Schaden gesamt');
    await user.clear(total);
    await user.type(total, '20');
    const results = await within(dlg).findAllByLabelText(/^Rettungswurf von/);
    await user.type(results[0]!, '18'); // Erfolg → 10
    await user.type(results[1]!, '5'); // Fehlschlag → 20
    await user.type(results[2]!, '14'); // genau SG → Erfolg
    expect(within(dlg).getAllByText('Erfolg')).toHaveLength(2);
    await user.click(within(dlg).getByRole('button', { name: 'Schaden anwenden' }));
    const hp = useMapStore.getState().doc!.tokens.map((t) => t.hp.current);
    expect(hp).toEqual([0, 0, 0]); // 7 TP: 10 bzw. 20 Schaden
    // Ein Undo-Schritt
    screen.getByRole('application').focus();
    await user.keyboard('{Control>}z{/Control}');
    expect(useMapStore.getState().doc!.tokens.every((t) => t.hp.current === 7)).toBe(true);
  });

  it('Brennende Hände: Ursprung setzen, mit Q drehen, auslösen; Vorschau wird gerendert', async () => {
    const user = await setup();
    await chooseEffect(user, 'burning', /^Burning Hands/);
    await user.click(screen.getByRole('button', { name: 'Platzieren' }));
    enterAt(9, 10);
    await user.keyboard('{Enter}');
    expect(useEditorStore.getState().aoePhase.origin).toEqual({ x: 9.5, y: 10.5 });
    // Rendererliste enthält die Vorschau
    expect(MapRenderer.last?.effects.some((e) => e.ghost)).toBe(true);
    await user.keyboard('q'); // 45°
    await user.keyboard('{Shift>}q{/Shift}'); // zurück auf 0°
    expect(useEditorStore.getState().aoePhase.angle).toBe(0);
    await user.keyboard('{Enter}');
    const dlg = await screen.findByRole('dialog', { name: /Brennende|Burning Hands/ });
    expect(within(dlg).getByText(/Felder \/ \d+ Ziele betroffen/)).toBeInTheDocument();
    await user.click(within(dlg).getByRole('button', { name: 'Abbrechen' }));
  });

  it('Dauerhafte Wolke: bleibt auf der Karte, zählt Runden herunter, meldet Ziele zu Rundenbeginn', async () => {
    const user = await setup();
    await chooseEffect(user, 'cloudkill', /^Cloudkill/);
    await user.click(screen.getByRole('button', { name: 'Platzieren' }));
    enterAt(10, 10);
    await user.keyboard('{Enter}');
    // Assistent schließen, Effekt bleibt
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Abbrechen' }),
    );
    const effect = useMapStore.getState().doc!.effects[0]!;
    expect(effect).toMatchObject({
      name: 'Cloudkill',
      rounds: 100,
      concentration: true,
      trigger: 'both',
      wallMode: 'spread',
    });
    expect(screen.getByText('Effekte auf der Karte (1)')).toBeInTheDocument();
    expect(MapRenderer.last?.effects.find((e) => e.id === effect.id)?.cells.size).toBe(52);

    // Neue Runde über das Token-Panel (ohne Auswahl)
    act(() => useEditorStore.getState().setSelection([]));
    await user.keyboard('{Escape}');
    act(() => useViewStore.getState().setTool('select'));
    await user.click(screen.getAllByRole('button', { name: 'Neue Runde (alle zurücksetzen)' })[0]!);
    expect(useMapStore.getState().doc!.effects[0]!.rounds).toBe(99);
    await waitFor(() =>
      expect(
        useNoticeStore
          .getState()
          .notices.some((n) => n.text.startsWith('Rundenbeginn in Cloudkill')),
      ).toBe(true),
    );
  });

  it('Eigenen Effekt anlegen und verwenden', async () => {
    const user = await setup();
    await user.click(screen.getByRole('tab', { name: 'Effekte' }));
    await screen.findByText(/\d+ Effekte/);
    await user.click(screen.getByRole('button', { name: 'Eigenen Effekt anlegen …' }));
    const dlg = screen.getByRole('dialog', { name: 'Eigener Effekt' });
    await user.type(within(dlg).getByLabelText('Name'), 'Säurenebel');
    await user.selectOptions(within(dlg).getByLabelText('Form'), 'cube');
    await user.selectOptions(within(dlg).getByLabelText('Schadensart'), 'acid');
    await user.type(within(dlg).getByLabelText('Schaden (Würfel)'), '3d6');
    await user.tab();
    await user.click(within(dlg).getByRole('button', { name: 'Speichern' }));
    const saved = useLibraryStore.getState().effects[0]!;
    expect(saved).toMatchObject({
      name: 'Säurenebel',
      kind: 'custom',
      shape: 'cube',
      damage: { type: 'acid', dice: { base: '3d6' } },
    });
    expect(screen.getByRole('option', { name: /Säurenebel/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

describe('Werkzeugwechsel', () => {
  beforeEach(reset);

  it('verwirft einen gesetzten Ursprung beim Wechsel des Werkzeugs', async () => {
    const user = await setup();
    await chooseEffect(user, 'lightning', /^Lightning Bolt/);
    await user.click(screen.getByRole('button', { name: 'Platzieren' }));
    enterAt(5, 5);
    await user.keyboard('{Enter}');
    expect(useEditorStore.getState().aoePhase.origin).not.toBeNull();
    await user.keyboard('w');
    await user.keyboard('a');
    expect(useViewStore.getState().tool).toBe('effect');
    expect(useEditorStore.getState().aoePhase.origin).toBeNull();
    expect(useEditorStore.getState().aoe?.template.name).toBe('Lightning Bolt');
  });
});
