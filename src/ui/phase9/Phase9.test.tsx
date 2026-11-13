import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { strFromU8 } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App';
import { spawnTokens, type TokenTemplate } from '../../editor/tokens';
import { decodeCampaign } from '../../storage/campaignFile';
import { setFileAccess } from '../../storage/fileAccess';
import { createLocalStorageLibrary, savePc, normalizePc, setLibrary } from '../../storage/library';
import { useCampaignStore } from '../state/campaignStore';
import { useEditorStore } from '../state/editorStore';
import { useEncounterStore } from '../state/encounterStore';
import { useLibraryStore } from '../state/libraryStore';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useOverlayStore } from '../state/overlayStore';
import { useRecoveryStore } from '../state/recoveryStore';
import { useSettings } from '../state/settingsStore';
import { useViewStore } from '../state/viewStore';
import { createFakeFileAccess, type FakeFileAccess } from '../testing/fakeFileAccess';
import { MapRenderer } from '../testing/fakeMapRenderer';
import { shownHandout } from '../vision/playerChannel';

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

const hero: TokenTemplate = {
  name: 'Held',
  kind: 'pc',
  size: 'medium',
  team: 'player',
  hpMax: 20,
  ac: 15,
  speed: 30,
  reach: 5,
  initiativeBonus: 2,
  passivePerception: 12,
  darkvision: 0,
};
const LOADING = 'Grafik wird geladen …';
let fa: FakeFileAccess;

function reset() {
  useSettings.getState().reset();
  useMapStore.getState().closeMap();
  useViewStore.getState().reset();
  useEditorStore.getState().reset();
  useRecoveryStore.getState().setPending(null);
  useRecoveryStore.getState().setPendingCampaign(null);
  useNoticeStore.setState({ notices: [] });
  useOverlayStore.getState().reset();
  useCampaignStore.getState().close();
  useEncounterStore.getState().reset();
  useLibraryStore.setState({
    pcs: [],
    homebrew: [],
    effects: [],
    portraits: {},
    status: 'idle',
    error: null,
  });
  setLibrary(createLocalStorageLibrary(memoryStorage()));
  fa = createFakeFileAccess();
  setFileAccess(fa);
}

async function setup(cols = 16, rows = 12) {
  const user = userEvent.setup();
  render(<App />);
  act(() => {
    useMapStore.getState().newMap({ name: 'Gruft', cols, rows });
    const doc = useMapStore.getState().doc!;
    const r = spawnTokens(doc, hero, { x: 1, y: 1 }, 1).result;
    if (r.ok) useMapStore.getState().apply(r.patch, 'action.tokenAdd');
  });
  await screen.findByRole('application');
  await waitFor(() => expect(screen.queryByText(LOADING)).toBeNull());
  return user;
}

function enterAt(x: number, y: number) {
  act(() => useViewStore.getState().setCursorCell({ x, y }));
  screen.getByRole('application').focus();
}

describe('Phase 9 – Overlay, Tasten, Export', () => {
  beforeEach(reset);

  it('Zeichnen per Tastatur, Ping, Zeichnungen löschen; Overlay erreicht den Renderer', async () => {
    const user = await setup();
    enterAt(2, 2);
    await user.keyboard('z');
    expect(useViewStore.getState().tool).toBe('draw');
    await user.keyboard('{Enter}');
    enterAt(6, 2);
    await user.keyboard('{Enter}');
    expect(useOverlayStore.getState().drawings).toHaveLength(1);
    expect(MapRenderer.last?.drawings[0]).toMatchObject({ shape: 'arrow' });
    // Kreis über die Optionen
    await user.click(screen.getByLabelText('Kreis'));
    enterAt(8, 8);
    await user.keyboard('{Enter}');
    enterAt(9, 9);
    await user.keyboard('{Enter}');
    expect(useOverlayStore.getState().drawings.map((d) => d.shape)).toEqual(['arrow', 'circle']);
    await user.keyboard('p');
    expect(MapRenderer.last?.pings).toHaveLength(1);
    expect(MapRenderer.last?.pings[0]).toMatchObject({ x: 9.5, y: 9.5 });
    // Zeichnungen sind kein Undo-Schritt und nicht in der Karte
    expect(useMapStore.getState().history.undo.at(-1)?.label).toBe('action.tokenAdd');
    await user.keyboard('c');
    expect(useOverlayStore.getState().drawings).toEqual([]);
  });

  it('Taste neu belegen: Konflikt wird aufgelöst, Werkzeug folgt der neuen Taste', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Einstellungen' }));
    await user.click(screen.getByRole('button', { name: 'Taste für „Pinsel“ ändern' }));
    await user.keyboard('g'); // war „Raster“
    expect(useSettings.getState().keymap).toEqual({ 'tool.brush': ['g'], grid: [] });
    expect(screen.getByText(/„G“ war für „Raster ein\/aus“ belegt/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Karte' }));
    screen.getByRole('application').focus();
    await user.keyboard('g');
    expect(useViewStore.getState().tool).toBe('brush');
    expect(useMapStore.getState().doc!.grid.visible).toBe(true); // Raster nicht mehr auf G
    // Toolbar zeigt die neue Taste
    expect(screen.getByRole('button', { name: 'Pinsel' })).toHaveAttribute('title', 'Pinsel (G)');
  });

  it('Export: PNG und PDF (1 Feld = 1 Zoll, mehrseitig)', async () => {
    const user = await setup(30, 20);
    await user.keyboard('{Control>}e{/Control}');
    let dialog = screen.getByRole('dialog', { name: 'Karte exportieren' });
    expect(within(dialog).getByText('Bildgröße: 3000 × 2000 Pixel.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Exportieren' }));
    await waitFor(() => expect(fa.files.has('Gruft.png')).toBe(true));
    expect(MapRenderer.last?.exports.at(-1)).toMatchObject({
      rect: { x: 0, y: 0, w: 30, h: 20 },
      px: 100,
      grid: true,
      mime: 'image/png',
    });

    await user.click(screen.getByRole('button', { name: 'Exportieren …' }));
    dialog = screen.getByRole('dialog', { name: 'Karte exportieren' });
    await user.click(within(dialog).getByLabelText('PDF (Druck)'));
    await user.click(within(dialog).getByLabelText('Spieler-Version (wie die Spieleransicht)'));
    await user.click(within(dialog).getByLabelText('Raster mitzeichnen'));
    expect(within(dialog).getByText(/^9 Seiten \(3 × 3\)/)).toBeInTheDocument();
    MapRenderer.last!.exports = [];
    await user.click(within(dialog).getByRole('button', { name: 'Exportieren' }));
    await waitFor(() => expect(fa.files.has('Gruft.pdf')).toBe(true));
    const pdf = strFromU8(fa.files.get('Gruft.pdf')!, true);
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('/Count 9');
    expect(pdf).toContain('Kachel A1');
    const exp = MapRenderer.last!.exports;
    expect(exp).toHaveLength(9);
    expect(exp.every((e) => e.mime === 'image/jpeg' && !e.grid && e.px === 150)).toBe(true);
    // Spieler-Version ohne GM-Notizen, danach wieder die GM-Ansicht
    expect(exp[0]!.doc?.layers.find((l) => l.id === 'gm')?.visible).toBe(false);
    expect(MapRenderer.last!.doc?.layers.find((l) => l.id === 'gm')?.visible).toBe(true);
  });
});

describe('Phase 9 – Begegnung, Schnappschuss, Kampagne, Bibliothek', () => {
  beforeEach(reset);

  it('Begegnung planen: Gruppe, Goblins, Schwierigkeit, setzen, Markdown', async () => {
    await savePc(normalizePc('pc1', 'Mira', { level: 1 }));
    const user = await setup();
    await user.click(screen.getByRole('tab', { name: 'Kreaturen' }));
    await screen.findByText('334 Kreaturen');
    await user.click(screen.getByRole('button', { name: 'Begegnung planen …' }));
    const dialog = screen.getByRole('dialog', { name: 'Begegnung planen' });
    await user.click(await within(dialog).findByLabelText('Mira (Stufe 1)'));
    await user.type(within(dialog).getByLabelText('Kreatur suchen und hinzufügen'), 'goblin');
    await user.click(within(dialog).getByRole('button', { name: '+ Goblin' }));
    const count = within(dialog).getByLabelText('Anzahl Goblin');
    await user.tripleClick(count);
    await user.keyboard('3');
    // 3 Goblins = 150 XP; eine Figur (< 3) → Stufe höher: ×2,5 = 375 ≥ tödlich (100)
    expect(within(dialog).getByText('Schwierigkeit: tödlich')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/150 XP gesamt · angepasst 375 XP \(× 2.5\)/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/Dungeon Master's Guide \(2014\)/)).toBeInTheDocument();

    fa.nextDialogPath = 'D:\\Begegnung.md';
    await user.click(within(dialog).getByRole('button', { name: 'Als Markdown …' }));
    await waitFor(() => expect(fa.files.has('D:\\Begegnung.md')).toBe(true));
    const md = strFromU8(fa.files.get('D:\\Begegnung.md')!);
    expect(md).toContain('| 3 | Goblin | 1/4 | 150 |');
    expect(md).toContain('**Schwierigkeit: tödlich**');
    expect(md).toContain('### Goblin');

    enterAt(5, 5);
    await user.click(within(dialog).getByRole('button', { name: 'Auf Karte setzen' }));
    const names = useMapStore.getState().doc!.tokens.map((t) => t.name);
    expect(names).toEqual(['Held', 'Goblin 1', 'Goblin 2', 'Goblin 3']);
    expect(screen.queryByRole('dialog', { name: 'Begegnung planen' })).toBeNull();
    screen.getByRole('application').focus();
    await user.keyboard('{Control>}z{/Control}');
    expect(useMapStore.getState().doc!.tokens).toHaveLength(1); // ein Rückgängig-Schritt
  });

  it('Schnappschuss: sichern, verändern, wiederherstellen, rückgängig', async () => {
    const user = await setup();
    await user.click(screen.getByText(/^Schnappschüsse/));
    await user.type(screen.getByLabelText('Name des Schnappschusses'), 'Vorher');
    await user.click(screen.getByRole('button', { name: 'Schnappschuss' }));
    expect(useMapStore.getState().snapshots.map((s) => s.name)).toEqual(['Vorher']);
    act(() => {
      const doc = useMapStore.getState().doc!;
      const r = spawnTokens(doc, { ...hero, name: 'Ork', team: 'enemy' }, { x: 5, y: 5 }, 2).result;
      if (r.ok) useMapStore.getState().apply(r.patch, 'action.tokenAdd');
    });
    expect(useMapStore.getState().doc!.tokens).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Wiederherstellen' }));
    await waitFor(() => expect(useMapStore.getState().doc!.tokens).toHaveLength(1));
    screen.getByRole('application').focus();
    await user.keyboard('{Control>}z{/Control}');
    expect(useMapStore.getState().doc!.tokens).toHaveLength(3);
  });

  it('Kampagne: beginnen, Szene, Verknüpfung, Handout, speichern', async () => {
    const user = await setup();
    await user.click(screen.getByRole('tab', { name: 'Kampagne' }));
    await user.type(screen.getByLabelText('Name der Kampagne'), 'Die Gruft');
    await user.click(screen.getByRole('button', { name: 'Kampagne beginnen' }));
    expect(useCampaignStore.getState().campaign?.scenes).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Neue Szene' }));
    expect(useMapStore.getState().doc!.name).toBe('Szene 2');
    // zurück zur Gruft und eine Verknüpfung zur Szene 2 anlegen
    await user.click(screen.getByRole('button', { name: 'Gruft' }));
    expect(useMapStore.getState().doc!.name).toBe('Gruft');
    act(() => useViewStore.getState().setCursorCell({ x: 3, y: 4 }));
    await user.type(screen.getByLabelText('Beschriftung (optional)'), 'Treppe');
    await user.click(screen.getByRole('button', { name: 'Am Fokusfeld verknüpfen' }));
    expect(screen.getByText('(4, 5) → Szene 2 – Treppe')).toBeInTheDocument();
    expect(MapRenderer.last?.overlay?.links).toEqual([{ x: 3, y: 4 }]);

    // Handout anlegen und den Spielern zeigen
    await user.type(screen.getByLabelText('Titel'), 'Brief');
    await user.type(screen.getByLabelText('Text'), 'Kommt allein.');
    await user.click(screen.getByRole('button', { name: 'Text-Handout anlegen' }));
    await user.click(screen.getByRole('button', { name: 'Spielern zeigen' }));
    expect(shownHandout()).toMatchObject({ title: 'Brief', text: 'Kommt allein.', image: null });

    await user.click(screen.getByRole('button', { name: 'Folgen' }));
    expect(useMapStore.getState().doc!.name).toBe('Szene 2');

    fa.nextDialogPath = 'D:\\gruft.dndcampaign';
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(fa.files.has('D:\\gruft.dndcampaign')).toBe(true));
    expect(useCampaignStore.getState().dirty).toBe(false);
    const saved = decodeCampaign(fa.files.get('D:\\gruft.dndcampaign')!);
    expect(saved.campaign.name).toBe('Die Gruft');
    expect(saved.campaign.scenes.map((s) => s.name)).toEqual(['Gruft', 'Szene 2']);
    expect(saved.campaign.current).toBe(saved.campaign.scenes[1]!.id);
    expect(saved.campaign.links).toHaveLength(1);
    expect(saved.campaign.handouts[0]!.title).toBe('Brief');
    expect(saved.scenes.get(saved.campaign.scenes[0]!.id)!.doc.tokens[0]!.name).toBe('Held');

    // Wieder öffnen (nach Schließen der Kampagne): aktive Szene ist Szene 2
    act(() => {
      useCampaignStore.getState().close();
      useMapStore.getState().closeMap();
    });
    fa.nextDialogPath = 'D:\\gruft.dndcampaign';
    await user.click((await screen.findAllByRole('button', { name: 'Öffnen …' }))[0]!);
    await waitFor(() => expect(useCampaignStore.getState().campaign?.name).toBe('Die Gruft'));
    expect(useMapStore.getState().doc!.name).toBe('Szene 2');
  });

  it('Bibliothek exportieren und wieder importieren (mit Rückfrage bei Überschreiben)', async () => {
    await savePc(normalizePc('pc1', 'Mira', { level: 4 }));
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Einstellungen' }));
    fa.nextDialogPath = 'D:\\bib.json';
    await user.click(screen.getByRole('button', { name: 'Bibliothek exportieren …' }));
    await waitFor(() => expect(fa.files.has('D:\\bib.json')).toBe(true));
    expect(JSON.parse(strFromU8(fa.files.get('D:\\bib.json')!)).entries).toHaveLength(1);

    fa.confirmAnswer = true;
    await user.click(screen.getByRole('button', { name: 'Bibliothek importieren …' }));
    await waitFor(() => expect(screen.getByText('1 Einträge importiert.')).toBeInTheDocument());
    expect(fa.confirmCalls.at(-1)).toMatch(/1 Einträge gibt es schon/);
    expect(useLibraryStore.getState().pcs.map((p) => p.name)).toEqual(['Mira']);
  });
});
