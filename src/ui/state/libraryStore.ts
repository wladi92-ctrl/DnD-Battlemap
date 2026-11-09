/**
 * Bibliothek (Spielercharaktere, eigene Kreaturen) im Speicher; Quelle ist die SQLite-Datenbank
 * (Desktop) bzw. localStorage (Browser-Vorschau). Wird beim ersten Öffnen der Panels geladen.
 */
import { create } from 'zustand';
import {
  deleteEntry,
  listHomebrew,
  listPcs,
  saveHomebrew,
  savePc,
  type HomebrewCreature,
  type PlayerCharacter,
} from '../../storage/library';

export interface LibraryState {
  pcs: PlayerCharacter[];
  homebrew: HomebrewCreature[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  load: (force?: boolean) => Promise<void>;
  putPc: (pc: PlayerCharacter) => Promise<void>;
  removePc: (id: string) => Promise<void>;
  putHomebrew: (c: HomebrewCreature) => Promise<void>;
  removeHomebrew: (id: string) => Promise<void>;
}

const byName = <T extends { name: string }>(list: T[]) =>
  [...list].sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const useLibraryStore = create<LibraryState>((set, get) => ({
  pcs: [],
  homebrew: [],
  status: 'idle',
  error: null,
  load: async (force = false) => {
    if (!force && (get().status === 'loading' || get().status === 'ready')) return;
    set({ status: 'loading', error: null });
    try {
      const [pcs, homebrew] = await Promise.all([listPcs(), listHomebrew()]);
      set({ pcs, homebrew, status: 'ready' });
    } catch (e) {
      set({ status: 'error', error: message(e) });
    }
  },
  putPc: async (pc) => {
    const saved = await savePc(pc);
    set((s) => ({ pcs: byName([...s.pcs.filter((p) => p.id !== saved.id), saved]) }));
  },
  removePc: async (id) => {
    await deleteEntry('pc', id);
    set((s) => ({ pcs: s.pcs.filter((p) => p.id !== id) }));
  },
  putHomebrew: async (c) => {
    const saved = await saveHomebrew(c);
    set((s) => ({ homebrew: byName([...s.homebrew.filter((h) => h.id !== saved.id), saved]) }));
  },
  removeHomebrew: async (id) => {
    await deleteEntry('creature', id);
    set((s) => ({ homebrew: s.homebrew.filter((h) => h.id !== id) }));
  },
}));
