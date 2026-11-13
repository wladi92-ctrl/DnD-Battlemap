import { AppShell } from './ui/AppShell';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { PlayerApp } from './ui/player/PlayerApp';
import { useApplySettings } from './ui/useApplySettings';
import { useAppLifecycle } from './ui/useAppLifecycle';

/** Spieleransicht läuft im selben Bundle, erkennbar am Fragment „#player“. */
export const isPlayerWindow = () => typeof location !== 'undefined' && location.hash === '#player';

export function App() {
  return isPlayerWindow() ? (
    <ErrorBoundary saveOnError={false}>
      <PlayerApp />
    </ErrorBoundary>
  ) : (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

function MainApp() {
  useApplySettings();
  useAppLifecycle();
  return <AppShell />;
}
