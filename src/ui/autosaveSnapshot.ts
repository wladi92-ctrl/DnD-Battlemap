/**
 * Was gesichert wird: die geöffnete Karte – oder bei einer Kampagne die ganze Kampagne.
 * Gemeinsam genutzt vom periodischen Autosave und der Notsicherung bei einem Absturz.
 */
import type { AutosaveSnapshot } from '../storage/autosave';
import { encodeCampaign } from '../storage/campaignFile';
import { getFileAccess } from '../storage/fileAccess';
import { encodeProject } from '../storage/projectFile';
import { useCampaignStore } from './state/campaignStore';
import { referencedAssets, useMapStore } from './state/mapStore';

export function currentAutosaveSnapshot(): AutosaveSnapshot | null {
  const s = useMapStore.getState();
  if (!s.doc) return null;
  const c = useCampaignStore.getState();
  if (c.campaign) {
    return {
      doc: s.doc,
      filePath: c.filePath,
      dirty: s.dirty || c.dirty,
      revision: s.revision + c.revision * 1_000_000,
      encode: (recovery) => {
        const contents = useCampaignStore.getState().collect();
        if (!contents) throw new Error('Kampagne nicht verfügbar');
        return encodeCampaign(contents, recovery);
      },
    };
  }
  return {
    doc: s.doc,
    filePath: s.filePath,
    dirty: s.dirty,
    revision: s.revision,
    assets: referencedAssets(s.doc, s.assets, s.snapshots),
    snapshots: s.snapshots,
  };
}

/**
 * Notsicherung (z. B. nach einem Fehler in der Oberfläche): ungespeicherte Änderungen sofort in
 * die Wiederherstellungsdatei schreiben. Fehler hier werden geschluckt – es gibt nichts mehr,
 * was man dem Nutzer sinnvoll anbieten könnte.
 */
export async function emergencySave(): Promise<boolean> {
  try {
    const snap = currentAutosaveSnapshot();
    if (!snap || !snap.dirty) return false;
    const recovery = { savedAt: new Date().toISOString(), filePath: snap.filePath };
    const bytes = snap.encode
      ? snap.encode(recovery)
      : encodeProject(snap.doc, snap.assets ?? new Map(), recovery, snap.snapshots ?? []);
    await getFileAccess().autosaveWrite(bytes);
    return true;
  } catch {
    return false;
  }
}
