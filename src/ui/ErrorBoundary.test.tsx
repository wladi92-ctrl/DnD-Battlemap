import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeProject } from '../storage/projectFile';
import { setFileAccess } from '../storage/fileAccess';
import { ErrorBoundary } from './ErrorBoundary';
import { useMapStore } from './state/mapStore';
import { useSettings } from './state/settingsStore';
import { createFakeFileAccess, type FakeFileAccess } from './testing/fakeFileAccess';

let fa: FakeFileAccess;
let failNext = true;

function Fragile() {
  const [n, setN] = useState(0);
  if (n === 1 && failNext) {
    throw new Error('Kaputt beim Zeichnen');
  }
  return (
    <button type="button" onClick={() => setN(1)}>
      Auslösen {n}
    </button>
  );
}

describe('Fehlerbehandlung', () => {
  beforeEach(() => {
    useSettings.getState().reset();
    useMapStore.getState().closeMap();
    fa = createFakeFileAccess();
    setFileAccess(fa);
    failNext = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('zeigt eine Fehlerseite, sichert ungespeicherte Änderungen und arbeitet weiter', async () => {
    const user = userEvent.setup();
    useMapStore.getState().newMap({ name: 'Ungesichert', cols: 10, rows: 10 });
    render(
      <ErrorBoundary>
        <Fragile />
      </ErrorBoundary>,
    );
    await user.click(screen.getByRole('button', { name: 'Auslösen 0' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Ein unerwarteter Fehler ist aufgetreten');
    await waitFor(() =>
      expect(screen.getByText(/in die Wiederherstellungsdatei gesichert/)).toBeInTheDocument(),
    );
    expect(decodeProject(fa.autosave!).doc.name).toBe('Ungesichert');
    expect(screen.getByText(/Kaputt beim Zeichnen/)).toBeInTheDocument();
    failNext = false;
    await user.click(screen.getByRole('button', { name: 'Weiterarbeiten' }));
    expect(screen.getByRole('button', { name: 'Auslösen 0' })).toBeInTheDocument();
  });
});
