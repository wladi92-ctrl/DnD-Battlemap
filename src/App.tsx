import { AppShell } from './ui/AppShell';
import { PlayerApp } from './ui/player/PlayerApp';
import { useApplySettings } from './ui/useApplySettings';
import { useAppLifecycle } from './ui/useAppLifecycle';

/** Spieleransicht läuft im selben Bundle, erkennbar am Fragment „#player“. */
export const isPlayerWindow = () => typeof location !== 'undefined' && location.hash === '#player';

export function App() {
  return isPlayerWindow() ? <PlayerApp /> : <MainApp />;
}

function MainApp() {
  useApplySettings();
  useAppLifecycle();
  return <AppShell />;
}
