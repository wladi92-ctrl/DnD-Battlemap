/** Kurze Meldungen (Fehler, Bestätigungen), angezeigt unten rechts. */
import { create } from 'zustand';

export interface Notice {
  id: number;
  kind: 'error' | 'info';
  text: string;
  details: string[];
}

interface NoticeState {
  notices: Notice[];
  push: (kind: Notice['kind'], text: string, details?: string[]) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;
const MAX_NOTICES = 5;

export const useNoticeStore = create<NoticeState>((set) => ({
  notices: [],
  push: (kind, text, details = []) => {
    const id = nextId++;
    set((s) => ({ notices: [...s.notices, { id, kind, text, details }].slice(-MAX_NOTICES) }));
    return id;
  },
  dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}));
