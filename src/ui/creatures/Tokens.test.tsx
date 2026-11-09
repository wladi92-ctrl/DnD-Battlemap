import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { setFileAccess } from '../../storage/fileAccess';
import { createLocalStorageLibrary, setLibrary } from '../../storage/library';
import { decodeProject, encodeProject } from '../../storage/projectFile';
import { useEditorStore } from '../state/editorStore';
import { referencedAssets, useMapStore } from '../state/mapStore';
import { useLibraryStore } from '../state/libraryStore';
import { useNoticeStore } from '../state/noticeStore';
import { useRecoveryStore } from '../state/recoveryStore';
import { useSettings } from '../state/settingsStore';
import { useViewStore } from '../state/viewStore';
import { createFakeFileAccess, type FakeFileAccess } from '../testing/fakeFileAccess';

vi.mock('../../render/graphicsSupport', () => ({
  detectGraphicsSupport: () => Promise.resolve({ kind: 'webgl', version: 2 }),
}));
vi.mock('../../render/MapRenderer', () => import('../testing/fakeMapRenderer'));

globalThis.ResizeObserver ??= class {
  observe() {}
  disconnect() {}
  unobserve() {}
} as unknown as typeof ResizeObserver;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

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

let fa: FakeFileAccess;

function reset() {
  useSettings.getState().reset();
  useMapStore.getState().closeMap();
  useViewStore.getState().reset();
  useEditorStore.getState().reset();
  useRecoveryStore.getState().setPending(null);
  useNoticeStore.setState({ notices: [] });
  useLibraryStore.setState({ pcs: [], homebrew: [], status: 'idle', error: null });
  setLibrary(createLocalStorageLibrary(memoryStorage()));
  fa = createFakeFileAccess();
  setFileAccess(fa);
}

async function setup() {
  const user = userEvent.setup();
  render(<App />);
  act(() => useMapStore.getState().newMap({ name: 'Kampf', cols: 20, rows: 15 }));
  await screen.findByRole('application');
  return user;
}

function enterAt(x: number, y: number) {
  act(() => useViewStore.getState().setCursorCell({ x, y }));
  screen.getByRole('application').focus();
}

describe('Kreaturen und Tokens', () => {
  beforeEach(reset);

  it('SRD-Kreatur suchen, Statblock zeigen, drei Goblins setzen und bekämpfen', async () => {
    const user = await setup();
    await user.click(screen.getByRole('tab', { name: 'Kreaturen' }));
    await screen.findByText('334 Kreaturen');
    // Umgebungsfilter ist sichtbar als "nicht im SRD" markiert.
    expect(screen.getByLabelText('Umgebung')).toBeDisabled();
    await user.type(screen.getByLabelText('Kreatur suchen'), 'goblin');
    expect(screen.getByText('2 Kreaturen')).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /^Goblin/ }));

    const actions = screen.getByRole('group', { name: 'Goblin' });
    await user.click(within(actions).getByRole('button', { name: 'Werte anzeigen' }));
    const sb = screen.getByRole('dialog', { name: 'Goblin' });
    expect(within(sb).getByText(/Nimble Escape/)).toBeInTheDocument();
    expect(within(sb).getByText('Rüstungsklasse')).toBeInTheDocument();
    await user.click(within(sb).getByRole('button', { name: 'Schließen' }));

    const amount = within(actions).getByLabelText('Anzahl');
    await user.clear(amount);
    await user.type(amount, '3');
    await user.click(within(actions).getByRole('button', { name: 'Auf Karte setzen' }));
    expect(screen.getByText(/Klicke auf ein Feld, um 3× „Goblin“ zu setzen/)).toBeInTheDocument();
    enterAt(4, 4);
    await user.keyboard('{Enter}');

    const doc = useMapStore.getState().doc!;
    expect(doc.tokens.map((t) => t.name)).toEqual(['Goblin 1', 'Goblin 2', 'Goblin 3']);
    expect(doc.tokens[0]).toMatchObject({ x: 4, y: 4, team: 'enemy', hp: { current: 7, max: 7 } });
    expect(useEditorStore.getState().spawn).toBeNull();
    expect(screen.getByText('3 Tokens ausgewählt')).toBeInTheDocument();

    // Schaden auf alle ausgewählten: Kreaturen sterben bei 0 TP.
    await user.type(screen.getByLabelText('Wert'), '7');
    await user.click(screen.getByRole('button', { name: 'Schaden' }));
    expect(useMapStore.getState().doc!.tokens.every((t) => t.hp.current === 0)).toBe(true);

    // Zustand für alle, dann rückgängig
    await user.click(screen.getByRole('checkbox', { name: 'Liegend' }));
    expect(useMapStore.getState().doc!.tokens.every((t) => t.conditions.includes('prone'))).toBe(
      true,
    );
    screen.getByRole('application').focus();
    await user.keyboard('{Control>}z{/Control}{Control>}z{/Control}');
    expect(
      useMapStore.getState().doc!.tokens.every((t) => t.hp.current === 7 && !t.conditions.length),
    ).toBe(true);
  });

  it('Spielercharakter anlegen, setzen, per Pfeiltaste bewegen und mit Bild speichern', async () => {
    fa.files.set('D:\\Bilder\\mira.png', PNG);
    fa.nextDialogPath = 'D:\\Bilder\\mira.png';
    const user = await setup();
    await user.click(screen.getByRole('tab', { name: 'Charaktere' }));
    await screen.findByText('Noch keine Charaktere gespeichert.');
    await user.click(screen.getByRole('button', { name: 'Neuer Charakter …' }));
    const dlg = screen.getByRole('dialog', { name: 'Neuer Spielercharakter' });
    await user.type(within(dlg).getByLabelText('Name'), 'Mira');
    await user.type(within(dlg).getByLabelText('Klasse'), 'Schurkin');
    const hp = within(dlg).getByLabelText('Trefferpunkte (Maximum)');
    await user.clear(hp);
    await user.type(hp, '24');
    await user.tab();
    await user.click(within(dlg).getByRole('button', { name: 'Bild wählen …' }));
    await waitFor(() =>
      expect(within(dlg).getByRole('button', { name: 'Bild entfernen' })).toBeInTheDocument(),
    );
    await user.click(within(dlg).getByRole('button', { name: 'Speichern' }));

    expect(useLibraryStore.getState().pcs[0]).toMatchObject({
      name: 'Mira',
      className: 'Schurkin',
      hpMax: 24,
    });
    await user.click(screen.getByRole('option', { name: /Mira/ }));
    await user.click(screen.getByRole('button', { name: 'Auf Karte setzen' }));
    enterAt(2, 2);
    await user.keyboard('{Enter}');
    const token = useMapStore.getState().doc!.tokens[0]!;
    expect(token).toMatchObject({
      name: 'Mira',
      kind: 'pc',
      team: 'player',
      hp: { max: 24 },
      pc: { level: 1 },
    });
    expect(token.image).toMatch(/^tokens\/.+\.png$/);

    // Ein Feld nach rechts: 5 ft Bewegung verbraucht.
    await user.keyboard('{ArrowRight}');
    expect(useMapStore.getState().doc!.tokens[0]).toMatchObject({ x: 3, y: 2, movementUsed: 5 });
    expect(screen.getByText('Bewegung: 5 von 30 ft verbraucht')).toBeInTheDocument();

    // Das Bild wird mit der Karte gespeichert.
    const { doc, assets } = useMapStore.getState();
    const saved = decodeProject(encodeProject(doc!, referencedAssets(doc!, assets)));
    expect(saved.assets.get(token.image!)).toEqual(PNG);
    expect(saved.doc.tokens[0]!.image).toBe(token.image);
  });

  it('Eigene Kreatur anlegen und in der Liste finden', async () => {
    const user = await setup();
    await user.click(screen.getByRole('tab', { name: 'Kreaturen' }));
    await screen.findByText('334 Kreaturen');
    await user.click(screen.getByRole('button', { name: 'Eigene Kreatur anlegen …' }));
    const dlg = screen.getByRole('dialog', { name: 'Eigene Kreatur' });
    await user.type(within(dlg).getByLabelText('Name'), 'Moorschrat');
    await user.selectOptions(within(dlg).getByLabelText('Herausforderungsgrad'), '2');
    await user.type(
      within(dlg).getByLabelText(/^Aktionen/),
      'Klaue: Nahkampf, +4, 1W6+2 Hiebschaden',
    );
    await user.click(within(dlg).getByRole('button', { name: 'Speichern' }));
    await screen.findByText('335 Kreaturen');
    const hb = useLibraryStore.getState().homebrew[0]!;
    expect(hb).toMatchObject({ name: 'Moorschrat', cr: 2, xp: 450, prof: 2 });
    expect(hb.actions).toEqual([{ name: 'Klaue', desc: 'Nahkampf, +4, 1W6+2 Hiebschaden' }]);
    expect(screen.getByRole('option', { name: /Moorschrat/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
