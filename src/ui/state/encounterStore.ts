/** Begegnungsplaner: geöffneter Entwurf (bleibt beim Schließen erhalten). */
import { create } from 'zustand';
import { newEncounter, type Encounter } from '../../editor/encounter';

interface EncounterState {
  open: boolean;
  draft: Encounter;
  show: (e?: Encounter) => void;
  close: () => void;
  update: (fn: (e: Encounter) => Encounter) => void;
  reset: () => void;
}

export const useEncounterStore = create<EncounterState>((set) => ({
  open: false,
  draft: newEncounter('Begegnung'),
  show: (e) => set((s) => ({ open: true, draft: e ?? s.draft })),
  close: () => set({ open: false }),
  update: (fn) => set((s) => ({ draft: fn(s.draft) })),
  reset: () => set({ open: false, draft: newEncounter('Begegnung') }),
}));
