/** Beim Start gefundene Autosave-Datei (Karte oder Kampagne), bis wiederhergestellt/verworfen. */
import { create } from 'zustand';
import type { CampaignContents } from '../../storage/campaignFile';
import type { ProjectContents } from '../../storage/projectFile';

interface RecoveryState {
  pending: ProjectContents | null;
  pendingCampaign: CampaignContents | null;
  setPending: (contents: ProjectContents | null) => void;
  setPendingCampaign: (contents: CampaignContents | null) => void;
}

export const useRecoveryStore = create<RecoveryState>((set) => ({
  pending: null,
  pendingCampaign: null,
  setPending: (pending) => set({ pending }),
  setPendingCampaign: (pendingCampaign) => set({ pendingCampaign }),
}));
