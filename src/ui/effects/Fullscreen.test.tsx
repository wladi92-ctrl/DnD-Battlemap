import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { setFileAccess } from '../../storage/fileAccess';
import { createLocalStorageLibrary, setLibrary } from '../../storage/library';
import { useEditorStore } from '../state/editorStore';
import { useLibraryStore } from '../state/libraryStore';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useRecoveryStore } from '../state/recoveryStore';
import { useSettings } from '../state/settingsStore';
import { useViewStore } from '../state/viewStore';
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

describe('Vollbild und Schnellsuche', () => {
  beforeEach(() => {
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
  });

  it('F11: Vollbild ohne Seitenleisten; Strg+F aktiviert Feuerball Grad 5 im Vollbild', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => useMapStore.getState().newMap({ name: 'Gruft', cols: 20, rows: 15 }));
    await screen.findByRole('application');
    screen.getByRole('application').focus();

    await user.keyboard('{F11}');
    expect(useViewStore.getState().fullscreen).toBe(true);
    // Kopfzeile, Seitenleisten und Statusleiste sind weg, die Karte bleibt
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Kreaturen' })).toBeNull();
    expect(screen.queryByText(/20 × 15 Felder/)).toBeNull();
    const panel = screen.getByRole('complementary', { name: 'Vollbild-Steuerung' });

    // Schnellsuche
    await user.keyboard('{Control>}f{/Control}');
    const dialog = screen.getByRole('dialog', { name: 'Effekt suchen' });
    const input = within(dialog).getByRole('combobox', { name: 'Effekt suchen' });
    expect(input).toHaveFocus();
    await user.type(input, 'fireball 5');
    const first = await within(dialog).findAllByRole('option');
    expect(first[0]).toHaveTextContent('Fireball');
    expect(first[0]).toHaveTextContent('Grad 5');
    await user.keyboard('{Enter}');

    expect(screen.queryByRole('dialog', { name: 'Effekt suchen' })).toBeNull();
    expect(useViewStore.getState().tool).toBe('effect');
    expect(useEditorStore.getState().aoe?.template).toMatchObject({
      name: 'Fireball',
      damage: '10d6', // Grad 5: 8d6 + 2d6
    });
    expect(useViewStore.getState().fullscreen).toBe(true);
    await waitFor(() => expect(screen.getByRole('application')).toHaveFocus());
    // Effekt-Optionen stehen in der schwebenden Leiste
    expect(within(panel).getByText('Effekt platzieren')).toBeInTheDocument();

    // Escape schließt die Suche ohne Auswahl; Vollbild per Knopf beenden
    await user.keyboard('{Control>}f{/Control}');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Effekt suchen' })).toBeNull();
    expect(useViewStore.getState().fullscreen).toBe(true);
    await user.click(within(panel).getByRole('button', { name: 'Vollbild beenden (F11)' }));
    expect(useViewStore.getState().fullscreen).toBe(false);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('Schnellsuche auch ohne Vollbild über die Werkzeugleiste; deutsche Suchbegriffe', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => useMapStore.getState().newMap({ name: 'Wald', cols: 20, rows: 15 }));
    await screen.findByRole('application');
    await user.click(screen.getByRole('button', { name: 'Effekt suchen (Strg+F)' }));
    const dialog = screen.getByRole('dialog', { name: 'Effekt suchen' });
    await user.type(within(dialog).getByRole('combobox'), 'Kälte');
    const options = await within(dialog).findAllByRole('option');
    expect(options.length).toBeGreaterThan(1);
    await user.keyboard('{ArrowDown}');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    await user.click(options[0]!);
    expect(useEditorStore.getState().aoe?.template.damageType).toBe('cold');
  });
});
