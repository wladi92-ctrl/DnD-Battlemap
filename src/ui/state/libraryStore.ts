/**
 * Bibliothek (Spielercharaktere, eigene Kreaturen, eigene Effekte und Kreaturenbilder) im Speicher; Quelle ist die SQLite-Datenbank
 * (Desktop) bzw. localStorage (Browser-Vorschau). Wird beim ersten Öffnen der Panels geladen.
 */
import { create } from 'zustand';
import {
  deleteEntry,
  listHomebrew,
  listHomebrewEffects,
  saveHomebrewEffect,
  listPcs,
  listPortraits,
  saveHomebrew,
  savePc,
  savePortrait,
  type HomebrewCreature,
  type PlayerCharacter,
} from '../../storage/library';
import type { EffectSource } from '../../data/srd/effects';

export interface LibraryState {
  pcs: PlayerCharacter[];
  homebrew: HomebrewCreature[];
  effects: EffectSource[];
  /** Eigene Bilder für SRD-Kreaturen (Kreatur-ID → Data-URL). */
  portraits: Record<string, string>;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  load: (force?: boolean) => Promise<void>;
  putPc: (pc: PlayerCharacter) => Promise<void>;
  removePc: (id: string) => Promise<void>;
  putHomebrew: (c: HomebrewCreature) => Promise<void>;
  removeHomebrew: (id: string) => Promise<void>;
  putEffect: (e: EffectSource) => Promise<EffectSource>;
  removeEffect: (id: string) => Promise<void>;
  putPortrait: (id: string, name: string, image: string) => Promise<void>;
  removePortrait: (id: string) => Promise<void>;
}

const byName = <T extends { name: string }>(list: T[]) =>
  [...list].sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const useLibraryStore = create<LibraryState>((set, get) => ({
  pcs: [],
  homebrew: [],
  effects: [],
  portraits: {},
  status: 'idle',
  error: null,
  load: async (force = false) => {
    if (!force && (get().status === 'loading' || get().status === 'ready')) return;
    set({ status: 'loading', error: null });
    try {
      const [pcs, homebrew, effects, portraitList] = await Promise.all([
        listPcs(),
        listHomebrew(),
        listHomebrewEffects(),
        listPortraits(),
      ]);
      const portraits = Object.fromEntries(portraitList.map((p) => [p.id, p.image]));
      set({ pcs, homebrew, effects, portraits, status: 'ready' });
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
  putEffect: async (e) => {
    const saved = await saveHomebrewEffect(e);
    set((s) => ({ effects: byName([...s.effects.filter((x) => x.id !== saved.id), saved]) }));
    return saved;
  },
  removeEffect: async (id) => {
    await deleteEntry('effect', id);
    set((s) => ({ effects: s.effects.filter((x) => x.id !== id) }));
  },
  putPortrait: async (id, name, image) => {
    const saved = await savePortrait({ id, name, image });
    set((s) => ({ portraits: { ...s.portraits, [id]: saved.image } }));
  },
  removePortrait: async (id) => {
    await deleteEntry('portrait', id);
    set((s) => {
      const { [id]: _removed, ...rest } = s.portraits;
      return { portraits: rest };
    });
  },
}));
