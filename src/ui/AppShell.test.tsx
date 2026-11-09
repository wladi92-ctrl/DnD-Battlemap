import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { setFileAccess } from '../storage/fileAccess';
import { createFakeFileAccess } from './testing/fakeFileAccess';
import { useMapStore } from './state/mapStore';
import { useSettings } from './state/settingsStore';

// Pixi braucht eine echte GPU/Canvas-Umgebung; in jsdom werden Renderer und Erkennung ersetzt.
vi.mock('../render/graphicsSupport', () => ({
  detectGraphicsSupport: () => Promise.resolve({ kind: 'webgl', version: 2 }),
}));
vi.mock('../render/MapRenderer', () => import('./testing/fakeMapRenderer'));

describe('AppShell', () => {
  beforeEach(() => {
    useSettings.getState().reset();
    useMapStore.getState().closeMap();
    setFileAccess(createFakeFileAccess());
  });

  it('startet auf Deutsch mit dem leeren Kartenbereich', async () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Keine Karte geöffnet' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Strg').length).toBeGreaterThan(0);
    expect(document.documentElement.lang).toBe('de');
  });

  it('wechselt Seiten per Maus und per Alt+Ziffer', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Einstellungen' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeInTheDocument();
    await user.keyboard('{Alt>}3{/Alt}');
    expect(screen.getByRole('heading', { level: 1, name: 'Über/Lizenzen' })).toBeInTheDocument();
    expect(await screen.findByTestId('graphics')).toHaveTextContent('WebGL 2');
    await user.keyboard('{Alt>}1{/Alt}');
    expect(screen.getByRole('heading', { level: 1, name: 'Keine Karte geöffnet' })).toBeVisible();
  });

  it('zeigt die SRD-5.1-Attribution und Drittanbieterlizenzen', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Über/Lizenzen' }));
    expect(screen.getByText(/by Wizards of the Coast LLC and available at/)).toBeInTheDocument();
    expect(
      screen.getByText(/Creative Commons Attribution 4\.0 International \(CC BY 4\.0\)/),
    ).toBeInTheDocument();
    expect(await screen.findByText(/\d+ Pakete/)).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), 'pixi.js');
    expect(screen.getByText('pixi.js')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), '-gibt-es-nicht');
    expect(screen.getByText('Keine Treffer.')).toBeInTheDocument();
  });

  it('übernimmt Einstellungen auf <html> und in den Store', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Einstellungen' }));
    await user.selectOptions(screen.getByLabelText('Farbschema'), 'contrast');
    expect(document.documentElement.dataset.theme).toBe('contrast');
    await user.selectOptions(screen.getByLabelText('Diagonalregel'), 'variant');
    await user.click(screen.getByLabelText(/zusätzlich in Metern/));
    await user.selectOptions(screen.getByLabelText('Automatische Sicherung'), '120');
    expect(useSettings.getState()).toMatchObject({
      diagonalRule: 'variant',
      showMeters: true,
      autosaveSeconds: 120,
    });
    act(() => useSettings.getState().setUiScale(1.5));
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1.5');
    await user.selectOptions(screen.getByLabelText('Sprache'), 'en');
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });
});
