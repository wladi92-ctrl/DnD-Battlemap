/** Beim Start gefundene Autosave-Datei, bis der Nutzer wiederherstellt oder verwirft. */
import { create } from 'zustand';
import type { ProjectContents } from '../../storage/projectFile';

interface RecoveryState {
  pending: ProjectContents | null;
  setPending: (contents: ProjectContents | null) => void;
}

export const useRecoveryStore = create<RecoveryState>((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
}));
