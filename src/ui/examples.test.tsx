import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { decodeCampaign } from '../storage/campaignFile';
import { setFileAccess } from '../storage/fileAccess';
import { decodeProject } from '../storage/projectFile';
import { EXAMPLES, loadExample } from './examples';
import { useCampaignStore } from './state/campaignStore';
import { useMapStore } from './state/mapStore';
import { useRecoveryStore } from './state/recoveryStore';
import { useSettings } from './state/settingsStore';
import { createFakeFileAccess } from './testing/fakeFileAccess';

vi.mock('../render/graphicsSupport', () => ({
  detectGraphicsSupport: () => Promise.resolve({ kind: 'webgl', version: 2 }),
}));
vi.mock('../render/MapRenderer', () => import('./testing/fakeMapRenderer'));

globalThis.ResizeObserver ??= class {
  observe() {}
  disconnect() {}
  unobserve() {}
} as unknown as typeof ResizeObserver;

describe('Mitgelieferte Beispiele', () => {
  beforeEach(() => {
    useSettings.getState().reset();
    useMapStore.getState().closeMap();
    useCampaignStore.getState().close();
    useRecoveryStore.getState().setPending(null);
    useRecoveryStore.getState().setPendingCampaign(null);
    setFileAccess(createFakeFileAccess());
  });

  it('alle Beispiele sind gültig', async () => {
    const [taverne, gruft, kampagne, leistung] = await Promise.all(EXAMPLES.map(loadExample));
    expect(decodeProject(taverne!).doc.tokens.length).toBeGreaterThan(5);
    const g = decodeProject(gruft!).doc;
    expect(g).toMatchObject({
      fog: { enabled: true },
      lighting: { enabled: true, ambient: 'dark' },
    });
    expect(g.lights[0]?.attachedTo).toBeDefined();
    const c = decodeCampaign(kampagne!);
    expect(c.damaged).toEqual([]);
    expect(c.campaign.scenes).toHaveLength(3);
    expect(c.campaign.links).toHaveLength(3);
    expect(c.campaign.encounters).toHaveLength(1);
    expect(c.campaign.handouts).toHaveLength(1);
    const p = decodeProject(leistung!).doc;
    expect(p.grid).toMatchObject({ cols: 100, rows: 100 });
    expect(p.tokens).toHaveLength(150);
  });

  it('Startseite öffnet die Beispielkampagne', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Kampagne: Die Gruft unter der Taverne' }));
    await waitFor(() =>
      expect(useCampaignStore.getState().campaign?.name).toBe('Die Gruft unter der Taverne'),
    );
    expect(useMapStore.getState().doc?.name).toBe('Taverne zum Grünen Drachen');
    // ungespeichert geöffnet: Speichern fragt nach einem Namen
    expect(useCampaignStore.getState().filePath).toBeNull();
  });
});
