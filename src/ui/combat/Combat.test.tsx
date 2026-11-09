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
import { createFakeFileAccess, type FakeFileAccess } from '../testing/fakeFileAccess';
import { useDiceStore } from './DiceRoller';

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
  hpMax: 20,
  ac: 13,
  speed: 30,
  reach: 5,
  initiativeBonus: 0,
  passivePerception: 10,
  darkvision: 0,
};

let fa: FakeFileAccess;
const LOADING = 'Grafik wird geladen …';

function reset() {
  useSettings.getState().reset();
  useMapStore.getState().closeMap();
  useViewStore.getState().reset();
  useEditorStore.getState().reset();
  useRecoveryStore.getState().setPending(null);
  useNoticeStore.setState({ notices: [] });
  useLibraryStore.setState({ pcs: [], homebrew: [], effects: [], status: 'idle', error: null });
  useDiceStore.getState().clear();
  setLibrary(createLocalStorageLibrary(memoryStorage()));
  fa = createFakeFileAccess();
  setFileAccess(fa);
}

async function setup() {
  const user = userEvent.setup();
  render(<App />);
  act(() => {
    useMapStore.getState().newMap({ name: 'Arena', cols: 20, rows: 20 });
    for (const [name, bonus, team, kind, x] of [
      ['Held', 3, 'player', 'pc', 2],
      ['Ork', 1, 'enemy', 'creature', 6],
      ['Goblin', 2, 'enemy', 'creature', 10],
    ] as const) {
      const doc = useMapStore.getState().doc!;
      const r = spawnTokens(
        doc,
        { ...base, name, initiativeBonus: bonus, team, kind },
        { x, y: 5 },
        1,
      ).result;
      if (r.ok) useMapStore.getState().apply(r.patch, 'action.tokenAdd');
    }
  });
  await screen.findByRole('application');
  // Renderer fertig (setzt beim Laden der Karte die Auswahl zurück).
  await waitFor(() => expect(screen.queryByText(LOADING)).toBeNull());
  return user;
}

const panel = () =>
  screen
    .getByText(/^Kampf( – Runde d+)?$/, { selector: 'summary' })
    .closest('details') as HTMLElement;
const names = () =>
  within(screen.getByRole('list', { name: 'Initiative-Reihenfolge' }))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('.init-label')?.firstChild?.textContent);
const logTexts = () => useMapStore.getState().doc!.combatLog.map((e) => e.text);

describe('Kampf', () => {
  beforeEach(reset);

  it('Kampf beginnen, Initiative eintragen, Züge und Runden, Verzögern, Kampflog exportieren', async () => {
    const user = await setup();
    await user.click(
      within(panel()).getByRole('button', { name: 'Kampf mit allen Tokens beginnen' }),
    );
    expect(useMapStore.getState().doc!.combat).toMatchObject({ started: false, round: 1 });
    for (const [name, value] of [
      ['Held', '15'],
      ['Ork', '19'],
      ['Goblin', '8'],
    ] as const) {
      const input = screen.getByLabelText(`Initiative von ${name}`);
      await user.type(input, value);
      await user.keyboard('{Enter}');
    }
    expect(names()).toEqual(['Ork', 'Held', 'Goblin']);

    await user.click(screen.getByRole('button', { name: 'Runde 1 beginnen ▶' }));
    expect(useEditorStore.getState().selection).toEqual(
      new Set([useMapStore.getState().doc!.tokens[1]!.id]),
    );
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Ork');

    // Weiter per Tastatur (Bild↓)
    screen.getByRole('application').focus();
    await user.keyboard('{PageDown}');
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Held');
    // Held verzögert → Goblin
    await user.click(screen.getByRole('button', { name: 'Verzögern' }));
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Goblin');
    // Held handelt jetzt (vor dem Goblin)
    await user.click(screen.getByRole('button', { name: 'Jetzt handeln' }));
    expect(names()).toEqual(['Ork', 'Held', 'Goblin']);
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Held');
    await user.click(screen.getByRole('button', { name: 'Nächster Zug ▶' }));
    await user.click(screen.getByRole('button', { name: 'Nächster Zug ▶' }));
    expect(useMapStore.getState().doc!.combat!.round).toBe(2);
    expect(screen.getByText('Kampf – Runde 2', { selector: 'summary' })).toBeInTheDocument();
    expect(logTexts()).toEqual(
      expect.arrayContaining([
        'Kampf beginnt (3 Teilnehmer).',
        'Ork ist am Zug.',
        'Held verzögert.',
        'Held handelt jetzt.',
        'Runde 2 beginnt.',
      ]),
    );
    // Rückgängig nimmt den Zugwechsel zurück, das Log bleibt
    const logLen = logTexts().length;
    await user.keyboard('{Control>}z{/Control}');
    expect(useMapStore.getState().doc!.combat!.round).toBe(1);
    expect(logTexts()).toHaveLength(logLen);

    // Export als Markdown
    fa.nextDialogPath = 'D:\\Logs\\arena.md';
    await user.click(screen.getByText(/^Kampflog \(/));
    await user.click(screen.getByRole('button', { name: 'Als Markdown exportieren …' }));
    const md = new TextDecoder().decode(fa.files.get('D:\\Logs\\arena.md'));
    expect(md).toContain('# Kampflog – Arena');
    expect(md).toContain('| Zug | Ork ist am Zug. |');
  });

  it('Angriff: Ziel vorausgewählt, würfeln, Schaden anpassen und anwenden', async () => {
    const user = await setup();
    const [held, ork] = useMapStore.getState().doc!.tokens;
    act(() => useEditorStore.getState().setSelection([ork!.id]));
    act(() => useEditorStore.getState().openAttack(held!.id));
    const dlg = await screen.findByRole('dialog', { name: 'Angriff: Held' });
    // Eigener Angriff (Held hat keinen Statblock)
    const bonus = within(dlg).getByLabelText('Trefferbonus');
    await user.clear(bonus);
    await user.type(bonus, '30');
    expect(within(dlg).getByRole('checkbox', { name: /Ork/ })).toBeChecked();
    await user.click(within(dlg).getByRole('button', { name: 'Angreifen (würfeln)' }));
    const dmg = within(dlg).getByLabelText('Schaden für Ork');
    const hit = within(dlg).queryByText('Verfehlt') === null; // natürliche 1 verfehlt immer
    if (hit) {
      await user.clear(dmg);
      await user.type(dmg, '7');
      await user.click(within(dlg).getByRole('button', { name: 'Schaden anwenden' }));
      expect(useMapStore.getState().doc!.tokens[1]!.hp.current).toBe(13);
      expect(
        logTexts().some(
          (x) => x.startsWith('Held trifft Ork') || x.startsWith('Held trifft Ork kritisch'),
        ),
      ).toBe(true);
      expect(logTexts()).toContain('Schaden angewendet: Ork 7');
    } else {
      expect(logTexts().some((x) => x.startsWith('Held verfehlt Ork'))).toBe(true);
      await user.click(within(dlg).getByRole('button', { name: 'Abbrechen' }));
    }
  });

  it('Würfelroller: Schnellwurf, Ausdruck, Vorteil, Verlauf und Kampflog', async () => {
    const user = await setup();
    screen.getByRole('application').focus();
    await user.keyboard('x');
    const roller = screen.getByRole('region', { name: 'Würfel' });
    await user.click(within(roller).getByRole('button', { name: 'W6' }));
    const input = within(roller).getByLabelText('Würfelausdruck (z. B. 2d6+3)');
    await user.clear(input);
    await user.type(input, '2W6+3{Enter}');
    await user.click(within(roller).getByLabelText('Vorteil'));
    await user.clear(input);
    await user.type(input, '1d20+5{Enter}');
    const h = useDiceStore.getState().history;
    expect(h).toHaveLength(3);
    expect(h[0]!.label).toBe('1d20+5 (Vorteil)');
    expect(h[0]!.total).toBeGreaterThanOrEqual(6);
    expect(h[1]!.label).toBe('2d6+3');
    expect(h[1]!.total).toBeGreaterThanOrEqual(5);
    expect(h[2]!.total).toBeGreaterThanOrEqual(1);
    expect(logTexts()).toHaveLength(3);
    await user.clear(input);
    await user.type(input, 'quatsch{Enter}');
    expect(within(roller).getByText(/Ungültiger Würfelausdruck/)).toBeInTheDocument();
  });
});
