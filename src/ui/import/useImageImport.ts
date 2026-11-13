/**
 * Ablauf "Bild importieren": Datei wählen oder fallen lassen → prüfen/dekodieren →
 * Kalibrierungsdialog → neue Karte bzw. Hintergrund der aktuellen Karte.
 */
import { create } from 'zustand';
import type { MessageKey } from '../../i18n';
import { setBackgroundImage } from '../../editor/wallOps';
import { getFileAccess, MAP_IMAGE_EXTENSIONS } from '../../storage/fileAccess';
import { createMap, type BackgroundImage } from '../../storage/mapDocument';
import { calibratedMapSize } from '../../editor/calibration';
import { useMapStore } from '../state/mapStore';
import { useCampaignStore } from '../state/campaignStore';
import { useNoticeStore } from '../state/noticeStore';
import { imageErrorKey, loadMapImage, type ImageSourceFile } from './imageTools';

export type ImportMode = 'newMap' | 'background' | 'recalibrate';

interface ImportState {
  /** Offener Kalibrierungsdialog. */
  session: { source: ImageSourceFile; mode: ImportMode; initial: BackgroundImage | null } | null;
  open: (source: ImageSourceFile, mode: ImportMode, initial?: BackgroundImage | null) => void;
  close: () => void;
}

export const useImportStore = create<ImportState>((set, get) => ({
  session: null,
  open: (source, mode, initial = null) => {
    get().session?.source.bitmap.close();
    set({ session: { source, mode, initial } });
  },
  close: () => {
    get().session?.source.bitmap.close();
    set({ session: null });
  },
}));

type T = (key: MessageKey, params?: Record<string, string | number>) => string;

function notifyError(t: T, e: unknown) {
  useNoticeStore.getState().push('error', t(imageErrorKey(e)));
}

/** Datei prüfen und Kalibrierung öffnen. */
export async function beginImageImport(
  t: T,
  file: { name: string; bytes: Uint8Array },
  mode: ImportMode,
) {
  try {
    const source = await loadMapImage(file.name, file.bytes);
    useImportStore.getState().open(source, mode);
  } catch (e) {
    notifyError(t, e);
  }
}

/** Bilddatei über den Dialog wählen. */
export async function pickImageImport(t: T, mode: ImportMode) {
  try {
    const file = await getFileAccess().openFile(
      t('imageImport.pickTitle'),
      t('imageImport.filterName'),
      MAP_IMAGE_EXTENSIONS,
    );
    if (file) await beginImageImport(t, file, mode);
  } catch (e) {
    notifyError(t, e);
  }
}

/** Kalibrierung des vorhandenen Hintergrundbilds erneut öffnen. */
export async function recalibrateBackground(t: T) {
  const { doc, assets } = useMapStore.getState();
  const img = doc?.background.image;
  const bytes = img && assets.get(img.asset);
  if (!img || !bytes) return;
  try {
    const source = await loadMapImage(img.asset, bytes);
    useImportStore.getState().open(source, 'recalibrate', img);
  } catch (e) {
    notifyError(t, e);
  }
}

export interface ApplyOptions {
  name: string;
  feetPerCell: number;
  fitGrid: boolean;
}

/** Ergebnis der Kalibrierung übernehmen. */
export function applyCalibration(image: BackgroundImage, opts: ApplyOptions) {
  const session = useImportStore.getState().session;
  if (!session) return;
  const store = useMapStore.getState();
  if (session.mode === 'newMap') {
    const size = calibratedMapSize(image);
    const mapOpts = {
      name: opts.name,
      cols: size.cols,
      rows: size.rows,
      feetPerCell: opts.feetPerCell,
      backgroundImage: image,
    };
    const campaign = useCampaignStore.getState();
    if (campaign.campaign) {
      // In einer Kampagne wird das Bild zu einer neuen Szene.
      const id = campaign.addSceneFromMap(
        createMap(mapOpts),
        new Map([[image.asset, session.source.bytes]]),
      );
      if (id) useCampaignStore.getState().switchScene(id);
    } else {
      store.newMap(mapOpts);
      useMapStore.getState().addAsset(image.asset, session.source.bytes);
    }
  } else if (store.doc) {
    if (session.mode === 'background') store.addAsset(image.asset, session.source.bytes);
    const doc = useMapStore.getState().doc;
    if (doc)
      useMapStore
        .getState()
        .run(setBackgroundImage(doc, image, opts.fitGrid), 'action.backgroundImage');
  }
  useImportStore.getState().close();
}
