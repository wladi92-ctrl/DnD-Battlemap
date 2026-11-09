import { AppShell } from './ui/AppShell';
import { useApplySettings } from './ui/useApplySettings';
import { useAppLifecycle } from './ui/useAppLifecycle';

export function App() {
  useApplySettings();
  useAppLifecycle();
  return <AppShell />;
}
