import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { setFileAccess } from '../../storage/fileAccess';
import { decodeProject } from '../../storage/projectFile';
import { useImportStore } from '../import/useImageImport';
import { useEditorStore } from '../state/editorStore';
import { useMapStore } from '../state/mapStore';
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

// jsdom kann keine Bilder dekodieren: Attrappe mit fester Größe 1000×800.
const closed: number[] = [];
globalThis.createImageBitmap = vi.fn(async () => ({
  width: 1000,
  height: 800,
  close: () => void closed.push(1),
})) as unknown as typeof createImageBitmap;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7]);

let fa: FakeFileAccess;
type User = ReturnType<typeof userEvent.setup>;

function reset() {
  useSettings.getState().reset();
  useMapStore.getState().closeMap();
  useViewStore.getState().reset();
  useEditorStore.getState().reset();
  useRecoveryStore.getState().setPending(null);
  useImportStore.getState().close();
  useNoticeStore.setState({ notices: [] });
  fa = createFakeFileAccess();
  setFileAccess(fa);
}

function focusCell(x: number, y: number) {
  act(() => useViewStore.getState().setCursorCell({ x, y }));
  screen.getByRole('application').focus();
}

async function calibrateDialog() {
  return screen.findByRole('dialog', { name: 'Neue Karte aus Bild – Raster kalibrieren' });
}

describe('Bildimport', () => {
  beforeEach(reset);

  it('Bild wählen, Feldgröße setzen, Karte erstellen und mit Bild speichern', async () => {
    const user = userEvent.setup();
    fa.files.set('D:\\Karten\\Gruft.png', PNG);
    fa.nextDialogPath = 'D:\\Karten\\Gruft.png';
    render(<App />);
    await user.click(screen.getAllByRole('button', { name: 'Bild importieren …' })[0]!);
    const dialog = await calibrateDialog();
    expect(within(dialog).getByText(/1000 × 800 px/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Gruft');

    const cell = within(dialog).getByLabelText('Feldgröße (Pixel)');
    await user.clear(cell);
    await user.type(cell, '50');
    expect(within(dialog).getByText(/^20 × 16 Felder/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Karte erstellen' }));

    const { doc, assets } = useMapStore.getState();
    expect(doc?.name).toBe('Gruft');
    expect(doc?.grid).toMatchObject({ cols: 20, rows: 16 });
    const img = doc!.background.image!;
    expect(img).toMatchObject({ width: 1000, height: 800, cellPx: 50, rotation: 0 });
    expect(assets.get(img.asset)).toEqual(PNG);
    expect(useImportStore.getState().session).toBeNull();

    fa.nextDialogPath = 'D:\\Karten\\gruft.dndmap';
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(fa.files.has('D:\\Karten\\gruft.dndmap')).toBe(true));
    const saved = decodeProject(fa.files.get('D:\\Karten\\gruft.dndmap')!);
    expect(saved.doc.background.image).toEqual(img);
    expect(saved.assets.get(img.asset)).toEqual(PNG);
  });

  it('Feld ÷ 2 / × 2 und „Felder über die Bildbreite“ für 1:1-Import', async () => {
    const user = userEvent.setup();
    fa.files.set('D:\\Karten\\Herrenhaus.png', PNG);
    fa.nextDialogPath = 'D:\\Karten\\Herrenhaus.png';
    render(<App />);
    await user.click(screen.getAllByRole('button', { name: 'Bild importieren …' })[0]!);
    const dialog = await calibrateDialog();
    const cell = within(dialog).getByLabelText('Feldgröße (Pixel)');
    await user.clear(cell);
    await user.type(cell, '100');
    expect(within(dialog).getByText(/^10 × 10 Felder/)).toBeInTheDocument(); // Mindestgröße
    // Ein Programmfeld deckte 2×2 Bildfelder ab → halbieren
    await user.click(within(dialog).getByRole('button', { name: 'Feld ÷ 2' }));
    expect(cell).toHaveValue(50);
    expect(within(dialog).getByText(/^20 × 16 Felder/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Feld × 2' }));
    expect(cell).toHaveValue(100);
    // Bekannte Felderzahl: 1000 px / 66 Felder = 15,1515 px → genau 66 Spalten
    const across = within(dialog).getByLabelText('Felder über die Bildbreite');
    await user.clear(across);
    await user.type(across, '66');
    expect(cell).toHaveValue(15.1515);
    expect(within(dialog).getByText(/^66 × 52 Felder/)).toBeInTheDocument();
  });

  it('Drehen vertauscht die Bildmaße, Abbrechen schließt ohne Karte', async () => {
    const user = userEvent.setup();
    fa.files.set('D:\\a.png', PNG);
    fa.nextDialogPath = 'D:\\a.png';
    render(<App />);
    await user.click(screen.getAllByRole('button', { name: 'Bild importieren …' })[0]!);
    const dialog = await calibrateDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Rechts drehen' }));
    expect(within(dialog).getByText('Drehung: 90°')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Breite')).toHaveValue(800);
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    expect(useMapStore.getState().doc).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('falscher Dateiinhalt wird mit Hinweis abgelehnt', async () => {
    const user = userEvent.setup();
    fa.files.set('D:\\falsch.jpg', PNG);
    fa.nextDialogPath = 'D:\\falsch.jpg';
    render(<App />);
    await user.click(screen.getAllByRole('button', { name: 'Bild importieren …' })[0]!);
    expect(await screen.findByRole('alert')).toHaveTextContent('passt nicht zur Endung');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Drag & Drop eines Bildes öffnet die Kalibrierung', async () => {
    render(<App />);
    const workspace = document.querySelector('.workspace')!;
    const file = new File([PNG], 'Höhle.png', { type: 'image/png' });
    fireEvent.drop(workspace, { dataTransfer: { files: [file], types: ['Files'] } });
    const dialog = await calibrateDialog();
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Höhle');
  });
});

describe('Kantenwände', () => {
  beforeEach(reset);

  async function setup(): Promise<User> {
    const user = userEvent.setup();
    render(<App />);
    act(() => useMapStore.getState().newMap({ name: 'W', cols: 20, rows: 15 }));
    await screen.findByRole('application');
    return user;
  }

  it('Wandkette per Tastatur zeichnen, Segment rückgängig machen', async () => {
    const user = await setup();
    await user.keyboard('w');
    focusCell(1, 1);
    await user.keyboard('{Enter}');
    focusCell(5, 1);
    await user.keyboard('{Enter}');
    focusCell(5, 4);
    await user.keyboard('{Enter}{Escape}');
    const walls = useMapStore.getState().doc!.walls;
    expect(walls.map((w) => [w.x1, w.y1, w.x2, w.y2, w.kind])).toEqual([
      [1, 1, 5, 1, 'wall'],
      [5, 1, 5, 4, 'wall'],
    ]);
    expect(useEditorStore.getState().wallChain).toEqual([]);
    await user.keyboard('{Control>}z{/Control}');
    expect(useMapStore.getState().doc!.walls).toHaveLength(1);
  });

  it('Türen zeichnen, auswählen, Art ändern und mit D öffnen', async () => {
    const user = await setup();
    await user.keyboard('w');
    await user.click(screen.getByLabelText('Tür'));
    focusCell(2, 2);
    await user.keyboard('{Enter}');
    focusCell(3, 2);
    await user.keyboard('{Enter}{Escape}');
    expect(useMapStore.getState().doc!.walls[0]).toMatchObject({ kind: 'door', state: 'closed' });

    await user.keyboard('{Control>}a{/Control}');
    expect(useViewStore.getState().tool).toBe('select');
    expect(screen.getByText('1 Wandsegment(e) ausgewählt')).toBeInTheDocument();
    await user.keyboard('d');
    expect(useMapStore.getState().doc!.walls[0]!.state).toBe('open');
    await user.selectOptions(screen.getByLabelText('Zustand'), 'locked');
    expect(useMapStore.getState().doc!.walls[0]!.state).toBe('locked');
    await user.selectOptions(screen.getByLabelText('Art'), 'window');
    expect(useMapStore.getState().doc!.walls[0]).not.toHaveProperty('state');
    screen.getByRole('application').focus();
    await user.keyboard('{Delete}');
    expect(useMapStore.getState().doc!.walls).toEqual([]);
  });
});
