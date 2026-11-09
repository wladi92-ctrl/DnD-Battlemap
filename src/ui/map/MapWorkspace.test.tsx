import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { setFileAccess } from '../../storage/fileAccess';
import { createMap } from '../../storage/mapDocument';
import { decodeProject, encodeProject } from '../../storage/projectFile';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useRecoveryStore } from '../state/recoveryStore';
import { useSettings } from '../state/settingsStore';
import { useViewStore } from '../state/viewStore';
import { createFakeFileAccess, type FakeFileAccess } from '../testing/fakeFileAccess';
import { MapRenderer as FakeRenderer } from '../testing/fakeMapRenderer';

vi.mock('../../render/graphicsSupport', () => ({
  detectGraphicsSupport: () => Promise.resolve({ kind: 'webgl', version: 2 }),
}));
vi.mock('../../render/MapRenderer', () => import('../testing/fakeMapRenderer'));

// jsdom kennt keinen ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  disconnect() {}
  unobserve() {}
} as unknown as typeof ResizeObserver;

let fa: FakeFileAccess;

async function createViaDialog(user: ReturnType<typeof userEvent.setup>, name = 'Verlies') {
  await user.click(screen.getAllByRole('button', { name: 'Neue Karte' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Neue Karte' });
  const nameInput = screen.getByLabelText('Name');
  await user.clear(nameInput);
  await user.type(nameInput, name);
  const cols = screen.getByLabelText('Spalten');
  await user.clear(cols);
  await user.type(cols, '40');
  await user.click(screen.getByRole('button', { name: 'Erstellen' }));
  expect(dialog).not.toBeInTheDocument();
}

describe('Karten-Arbeitsbereich', () => {
  beforeEach(() => {
    useSettings.getState().reset();
    useMapStore.getState().closeMap();
    useViewStore.getState().reset();
    useRecoveryStore.getState().setPending(null);
    useNoticeStore.setState({ notices: [] });
    fa = createFakeFileAccess();
    setFileAccess(fa);
  });

  it('neue Karte anlegen, speichern, schließen und identisch wieder öffnen', async () => {
    const user = userEvent.setup();
    render(<App />);
    await createViaDialog(user);

    const doc = useMapStore.getState().doc!;
    expect(doc).toMatchObject({ name: 'Verlies', grid: { cols: 40, rows: 20, feetPerCell: 5 } });
    expect(screen.getByText(/40 × 20 Felder \(200 ft × 100 ft\)/)).toBeInTheDocument();
    await waitFor(() => expect(FakeRenderer.last?.map).toMatchObject({ cols: 40, rows: 20 }));

    // Raster per Taste G ausblenden → Dokument geändert
    await user.keyboard('g');
    expect(useMapStore.getState().doc!.grid.visible).toBe(false);

    // Speichern (Strg+S) → "Speichern unter"-Dialog liefert Pfad
    fa.nextDialogPath = 'D:\\Karten\\verlies.dndmap';
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(useMapStore.getState().dirty).toBe(false));
    expect(useMapStore.getState().filePath).toBe('D:\\Karten\\verlies.dndmap');
    const saved = useMapStore.getState().doc!;
    expect(decodeProject(fa.files.get('D:\\Karten\\verlies.dndmap')!).doc).toEqual(saved);

    // Schließen und wieder öffnen → identisch
    act(() => useMapStore.getState().closeMap());
    await user.keyboard('{Control>}o{/Control}');
    await waitFor(() => expect(useMapStore.getState().doc).toEqual(saved));
    expect(useMapStore.getState().dirty).toBe(false);
    expect(screen.getByText('Geöffnet: verlies.dndmap')).toBeInTheDocument();
  });

  it('erneutes Speichern schreibt ohne Dialog an denselben Pfad', async () => {
    const user = userEvent.setup();
    render(<App />);
    await createViaDialog(user);
    fa.nextDialogPath = 'D:\\a.dndmap';
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(useMapStore.getState().dirty).toBe(false));
    act(() => useMapStore.getState().updateGrid({ cols: 50 }));
    fa.nextDialogPath = null; // ein Dialog würde jetzt abbrechen
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(useMapStore.getState().dirty).toBe(false));
    expect(decodeProject(fa.files.get('D:\\a.dndmap')!).doc.grid.cols).toBe(50);
  });

  it('fragt bei ungespeicherten Änderungen nach und bricht bei Nein ab', async () => {
    const user = userEvent.setup();
    render(<App />);
    await createViaDialog(user, 'Erste');
    fa.confirmAnswer = false;
    await user.click(screen.getByRole('button', { name: 'Neue Karte' }));
    expect(fa.confirmCalls).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useMapStore.getState().doc!.name).toBe('Erste');
  });

  it('meldet beschädigte Dateien verständlich', async () => {
    const user = userEvent.setup();
    fa.files.set('D:\\kaputt.dndmap', new Uint8Array([1, 2, 3]));
    fa.nextDialogPath = 'D:\\kaputt.dndmap';
    render(<App />);
    await user.click(screen.getAllByRole('button', { name: 'Öffnen …' })[0]!);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Datei ist keine gültige Karte (.dndmap).',
    );
    expect(useMapStore.getState().doc).toBeNull();
  });

  it('bietet nach Absturz die Wiederherstellung an', async () => {
    const user = userEvent.setup();
    const lost = createMap({ name: 'Ungesichert', cols: 12, rows: 12 });
    fa.autosave = encodeProject(lost, new Map(), {
      savedAt: '2026-11-09T09:30:00.000Z',
      filePath: 'D:\\alt.dndmap',
    });
    render(<App />);
    expect(await screen.findByText('Nicht gespeicherte Karte gefunden')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Wiederherstellen' }));
    expect(useMapStore.getState()).toMatchObject({
      doc: lost,
      dirty: true,
      filePath: 'D:\\alt.dndmap',
    });
  });

  it('Lineal misst per Tastatur nach der eingestellten Diagonalregel', async () => {
    const user = userEvent.setup();
    useSettings.getState().setDiagonalRule('variant');
    render(<App />);
    await createViaDialog(user);
    act(() => useViewStore.getState().setCursorCell({ x: 0, y: 0 }));
    await user.keyboard('r');
    const canvas = screen.getByRole('application');
    canvas.focus();
    await user.keyboard('{Enter}{ArrowRight}{ArrowDown}{ArrowRight}{ArrowDown}');
    // 2 Diagonalen nach 5/10/5 = 15 ft
    expect(screen.getByText('15 ft')).toHaveClass('ruler-label');
    expect(screen.getByText('Lineal: 15 ft')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(useViewStore.getState().ruler.active).toBe(false);
    await user.keyboard('{Escape}');
    expect(useViewStore.getState().ruler.points).toEqual([]);
  });
});
