import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { setFileAccess } from '../../storage/fileAccess';
import { decodeProject } from '../../storage/projectFile';
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

let fa: FakeFileAccess;
type User = ReturnType<typeof userEvent.setup>;

async function setup(): Promise<User> {
  const user = userEvent.setup();
  render(<App />);
  act(() => useMapStore.getState().newMap({ name: 'Test', cols: 20, rows: 15 }));
  await screen.findByRole('application');
  return user;
}

/** Fokusfeld setzen und Kartenansicht fokussieren (Tastaturbedienung). */
function focusCell(x: number, y: number) {
  act(() => useViewStore.getState().setCursorCell({ x, y }));
  screen.getByRole('application').focus();
}

async function chooseElement(user: User, search: string, name: string) {
  const box = screen.getByRole('searchbox', { name: 'Elemente suchen' });
  await user.clear(box);
  await user.type(box, search);
  await user.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
}

const floorAt = (x: number, y: number) => {
  const d = useMapStore.getState().doc!;
  return d.floor[y * d.grid.cols + x];
};

describe('Editor-Abläufe', () => {
  beforeEach(() => {
    useSettings.getState().reset();
    useMapStore.getState().closeMap();
    useViewStore.getState().reset();
    useEditorStore.getState().reset();
    useRecoveryStore.getState().setPending(null);
    useNoticeStore.setState({ notices: [] });
    fa = createFakeFileAccess();
    setFileAccess(fa);
  });

  it('Bibliothek: suchen, wählen, per Tastatur malen, rückgängig machen', async () => {
    const user = await setup();
    expect(screen.getByText(/^1\d\d Elemente$/)).toBeInTheDocument();
    await chooseElement(user, 'gras', 'Gras');
    expect(useViewStore.getState().tool).toBe('brush');
    focusCell(2, 3);
    await user.keyboard('{Enter}');
    expect(floorAt(2, 3)).toBe('floor.grass');
    await user.keyboard('{Control>}z{/Control}');
    expect(floorAt(2, 3)).toBe('');
    expect(screen.getByText('Rückgängig: Malen')).toBeInTheDocument();
    await user.keyboard('{Control>}y{/Control}');
    expect(floorAt(2, 3)).toBe('floor.grass');
  });

  it('Rechteck als Umriss per Tastatur zeichnet einen Raum aus Wänden', async () => {
    const user = await setup();
    await chooseElement(user, 'steinmauer', 'Steinmauer');
    await user.keyboard('u');
    await user.click(screen.getByLabelText('Nur Umriss'));
    focusCell(1, 1);
    await user.keyboard('{Enter}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowDown}{ArrowDown}{Enter}');
    const walls = useMapStore.getState().doc!.objects.filter((o) => o.element === 'wall.stone');
    expect(walls).toHaveLength(10); // 4×3-Umriss
    expect(useMapStore.getState().history.undo).toHaveLength(1);
  });

  it('gesperrte Ebene verhindert Malen mit Hinweis', async () => {
    const user = await setup();
    await chooseElement(user, 'gras', 'Gras');
    await user.click(screen.getByLabelText('Boden gesperrt'));
    focusCell(0, 0);
    await user.keyboard('{Enter}');
    expect(floorAt(0, 0)).toBe('');
    expect(await screen.findByText('Diese Ebene ist gesperrt.')).toBeInTheDocument();
  });

  it('Vorlage "Taverne" einfügen und mit einem Schritt rückgängig machen', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: /Vorlage/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Taverne'));
    await user.click(within(dialog).getByRole('button', { name: 'Einfügen' }));
    const objects = useMapStore.getState().doc!.objects;
    expect(objects.some((o) => o.element === 'furniture.bar_counter')).toBe(true);
    await user.keyboard('{Control>}z{/Control}');
    expect(useMapStore.getState().doc!.objects).toEqual([]);
  });

  it('Zufallsverlies mit Seed passt nicht auf zu kleine Karte', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: /Vorlage/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Zufälliges Verlies (Seed)'));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('größer als die Karte');
    expect(within(dialog).getByRole('button', { name: 'Einfügen' })).toBeDisabled();
  });

  it('GM-Notiz per Tastatur anlegen; Statusleiste zeigt sie an', async () => {
    const user = await setup();
    await user.keyboard('n');
    focusCell(4, 4);
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'GM-Notiz – Feld 5, 5' });
    await user.type(within(dialog).getByRole('textbox'), 'Falltür unter dem Teppich');
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(useMapStore.getState().doc!.notes).toMatchObject([
      { x: 4, y: 4, text: 'Falltür unter dem Teppich' },
    ]);
    expect(screen.getByText('Notiz: Falltür unter dem Teppich')).toBeInTheDocument();
  });

  it('Auswahl per Tastatur: wählen, verschieben, drehen, löschen', async () => {
    const user = await setup();
    await chooseElement(user, 'lange tafel', 'Lange Tafel');
    focusCell(2, 2);
    await user.keyboard('{Enter}');
    await user.keyboard('v');
    focusCell(2, 2);
    await user.keyboard('{Enter}');
    expect(useEditorStore.getState().selection.size).toBe(1);
    await user.keyboard('{ArrowRight}');
    expect(useMapStore.getState().doc!.objects[0]).toMatchObject({ x: 3, y: 2 });
    await user.keyboard('q');
    expect(useMapStore.getState().doc!.objects[0]!.rotation).toBe(90);
    await user.keyboard('{Delete}');
    expect(useMapStore.getState().doc!.objects).toEqual([]);
  });

  it('eigenes Element importieren, malen und mit Bild speichern', async () => {
    const user = await setup();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    fa.files.set('D:\\Bilder\\Brunnen.png', png);
    fa.nextDialogPath = 'D:\\Bilder\\Brunnen.png';
    await user.click(screen.getByRole('button', { name: 'Eigenes Element importieren …' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Datei wählen …' }));
    expect(await within(dialog).findByText('Brunnen.png')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Brunnen');
    await user.click(within(dialog).getByRole('button', { name: 'Importieren' }));

    const doc = useMapStore.getState().doc!;
    expect(doc.customElements).toHaveLength(1);
    const el = doc.customElements[0]!;
    expect(useEditorStore.getState().elementId).toBe(el.id);
    focusCell(1, 1);
    await user.keyboard('{Enter}');
    expect(useMapStore.getState().doc!.objects.map((o) => o.element)).toEqual([el.id]);

    fa.nextDialogPath = 'D:\\Karten\\eigene.dndmap';
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(fa.files.has('D:\\Karten\\eigene.dndmap')).toBe(true));
    const saved = decodeProject(fa.files.get('D:\\Karten\\eigene.dndmap')!);
    expect(saved.assets.get(el.asset)).toEqual(png);
    expect(saved.doc.customElements).toEqual(doc.customElements);
  });

  it('Import lehnt falsche Inhalte ab', async () => {
    const user = await setup();
    fa.files.set('D:\\fake.png', new Uint8Array([1, 2, 3, 4]));
    fa.nextDialogPath = 'D:\\fake.png';
    await user.click(screen.getByRole('button', { name: 'Eigenes Element importieren …' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Datei wählen …' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('passt nicht zur Endung');
    expect(within(dialog).getByRole('button', { name: 'Importieren' })).toBeDisabled();
  });
});
