/**
 * Geöffnete Kampagne: Szenen (Karten), Verknüpfungen, Notizen, Begegnungen und Handouts.
 * Die aktive Szene liegt wie jede Karte im mapStore (alle Werkzeuge arbeiten unverändert);
 * die übrigen Szenen hält dieser Store. Beim Szenenwechsel wird die aktive Karte hier
 * abgelegt und die Zielkarte in den mapStore geladen (Rückgängig gilt je Besuch einer Szene).
 */
import { create } from 'zustand';
import type { Encounter } from '../../editor/encounter';
import {
  createCampaign,
  ENCOUNTERS_MAX,
  HANDOUTS_MAX,
  LINKS_MAX,
  SCENES_MAX,
  type Campaign,
  type CampaignContents,
  type Handout,
  type SceneData,
  type SceneLink,
} from '../../storage/campaignFile';
import { createMap, type MapDocument, type NewMapOptions } from '../../storage/mapDocument';
import { referencedAssets, useMapStore, type FileRef } from './mapStore';

interface CampaignState {
  campaign: Campaign | null;
  /** Nicht aktive Szenen (die aktive liegt im mapStore). */
  scenes: Map<string, SceneData>;
  handoutImages: Map<string, Uint8Array>;
  filePath: string | null;
  fileName: string | null;
  /** Änderungen an Kampagnendaten oder abgelegten Szenen seit dem Speichern. */
  dirty: boolean;
  revision: number;
  /** Handout, das gerade in der Spieleransicht gezeigt wird. */
  shownHandout: string | null;

  /** Neue Kampagne; die geöffnete Karte (falls vorhanden) wird erste Szene. */
  start: (name: string) => void;
  load: (contents: CampaignContents, file: FileRef, dirty?: boolean) => void;
  close: () => void;
  /** Gesamtstand inkl. aktiver Szene (zum Speichern). */
  collect: () => Omit<CampaignContents, 'recovery' | 'damaged'> | null;
  markSaved: (file: FileRef) => void;

  addScene: (opts: NewMapOptions) => string | null;
  addSceneFromMap: (doc: MapDocument, assets: ReadonlyMap<string, Uint8Array>) => string | null;
  renameScene: (id: string, name: string) => void;
  removeScene: (id: string) => boolean;
  moveScene: (id: string, delta: -1 | 1) => void;
  switchScene: (id: string) => boolean;

  addLink: (link: Omit<SceneLink, 'id' | 'scene'>) => boolean;
  removeLink: (id: string) => void;
  setNotes: (notes: string) => void;
  saveEncounter: (e: Encounter) => void;
  removeEncounter: (id: string) => void;
  addHandout: (
    h: Omit<Handout, 'id' | 'image'>,
    image?: { name: string; bytes: Uint8Array },
  ) => string | null;
  updateHandout: (id: string, patch: Partial<Pick<Handout, 'title' | 'text'>>) => void;
  removeHandout: (id: string) => void;
  showHandout: (id: string | null) => void;
}

const initial = {
  campaign: null as Campaign | null,
  scenes: new Map<string, SceneData>(),
  handoutImages: new Map<string, Uint8Array>(),
  filePath: null as string | null,
  fileName: null as string | null,
  dirty: false,
  revision: 0,
  shownHandout: null as string | null,
};

const touch = (c: Campaign): Campaign => ({ ...c, modifiedAt: new Date().toISOString() });

/** Aktive Karte als Szenendaten (nur referenzierte Assets). */
function activeScene(): SceneData | null {
  const m = useMapStore.getState();
  if (!m.doc) return null;
  return {
    doc: m.doc,
    assets: referencedAssets(m.doc, m.assets, m.snapshots),
    snapshots: m.snapshots,
  };
}

export const useCampaignStore = create<CampaignState>((set, get) => {
  const changed = (patch: Partial<CampaignState>) =>
    set((s) => ({
      ...patch,
      ...(patch.campaign ? { campaign: touch(patch.campaign) } : {}),
      dirty: true,
      revision: s.revision + 1,
    }));
  const fileRef = (): FileRef => ({ path: get().filePath, name: get().fileName });

  return {
    ...initial,

    start: (name) => {
      const m = useMapStore.getState();
      const doc = m.doc ?? createMap({ name, cols: 30, rows: 20 });
      const sceneId = crypto.randomUUID();
      set({
        ...initial,
        campaign: createCampaign(name, { id: sceneId, name: doc.name }),
        scenes: new Map(),
        dirty: true,
        revision: get().revision + 1,
      });
      // Karte bleibt aktiv (nun als Szene der Kampagne); ohne Karte eine leere anlegen.
      if (!m.doc) m.loadMap(doc, { path: null, name: null }, true);
    },

    load: (contents, file, dirty = false) => {
      const { campaign, scenes, handoutImages } = contents;
      const active = scenes.get(campaign.current);
      const rest = new Map(scenes);
      rest.delete(campaign.current);
      set({
        ...initial,
        campaign,
        scenes: rest,
        handoutImages: new Map(handoutImages),
        filePath: file.path,
        fileName: file.name,
        dirty,
        revision: get().revision + 1,
      });
      if (active)
        useMapStore
          .getState()
          .loadMap(active.doc, file, false, new Map(active.assets), active.snapshots);
    },

    close: () => set({ ...initial, revision: get().revision + 1 }),

    collect: () => {
      const { campaign, scenes, handoutImages } = get();
      const active = activeScene();
      if (!campaign || !active) return null;
      const all = new Map(scenes);
      all.set(campaign.current, active);
      // Szenennamen folgen den Kartennamen.
      const named = {
        ...campaign,
        scenes: campaign.scenes.map((s) => ({
          ...s,
          name: all.get(s.id)?.doc.name ?? s.name,
        })),
      };
      return { campaign: named, scenes: all, handoutImages };
    },

    markSaved: (file) => {
      set({ filePath: file.path, fileName: file.name, dirty: false });
      useMapStore.getState().markSaved(file);
    },

    addScene: (opts) => {
      const { campaign, scenes } = get();
      if (!campaign || campaign.scenes.length >= SCENES_MAX) return null;
      const doc = createMap(opts);
      const sceneId = crypto.randomUUID();
      changed({
        campaign: { ...campaign, scenes: [...campaign.scenes, { id: sceneId, name: doc.name }] },
        scenes: new Map(scenes).set(sceneId, { doc, assets: new Map(), snapshots: [] }),
      });
      return sceneId;
    },

    addSceneFromMap: (doc, assets) => {
      const { campaign, scenes } = get();
      if (!campaign || campaign.scenes.length >= SCENES_MAX) return null;
      const sceneId = crypto.randomUUID();
      changed({
        campaign: { ...campaign, scenes: [...campaign.scenes, { id: sceneId, name: doc.name }] },
        scenes: new Map(scenes).set(sceneId, {
          doc,
          assets: referencedAssets(doc, assets),
          snapshots: [],
        }),
      });
      return sceneId;
    },

    renameScene: (id, name) => {
      const { campaign, scenes } = get();
      const clean = name.trim().slice(0, 120);
      if (!campaign || !clean) return;
      if (id === campaign.current) {
        useMapStore.getState().rename(clean);
        return;
      }
      const data = scenes.get(id);
      changed({
        campaign: {
          ...campaign,
          scenes: campaign.scenes.map((s) => (s.id === id ? { ...s, name: clean } : s)),
        },
        ...(data
          ? { scenes: new Map(scenes).set(id, { ...data, doc: { ...data.doc, name: clean } }) }
          : {}),
      });
    },

    removeScene: (id) => {
      const { campaign, scenes } = get();
      if (!campaign || id === campaign.current || campaign.scenes.length <= 1) return false;
      const rest = new Map(scenes);
      rest.delete(id);
      changed({
        campaign: {
          ...campaign,
          scenes: campaign.scenes.filter((s) => s.id !== id),
          links: campaign.links.filter((l) => l.scene !== id && l.target !== id),
        },
        scenes: rest,
      });
      return true;
    },

    moveScene: (id, delta) => {
      const { campaign } = get();
      if (!campaign) return;
      const list = [...campaign.scenes];
      const i = list.findIndex((s) => s.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return;
      const [item] = list.splice(i, 1);
      if (item) list.splice(j, 0, item);
      changed({ campaign: { ...campaign, scenes: list } });
    },

    switchScene: (id) => {
      const { campaign, scenes } = get();
      if (!campaign || id === campaign.current) return false;
      const target = scenes.get(id);
      const active = activeScene();
      if (!target || !active) return false;
      const rest = new Map(scenes);
      rest.delete(id);
      rest.set(campaign.current, active);
      const wasDirty = useMapStore.getState().dirty;
      set((s) => ({
        campaign: { ...campaign, current: id },
        scenes: rest,
        dirty: s.dirty || wasDirty,
        revision: s.revision + 1,
      }));
      useMapStore
        .getState()
        .loadMap(target.doc, fileRef(), false, new Map(target.assets), target.snapshots);
      return true;
    },

    addLink: (link) => {
      const { campaign } = get();
      if (!campaign || campaign.links.length >= LINKS_MAX) return false;
      if (!campaign.scenes.some((s) => s.id === link.target)) return false;
      const others = campaign.links.filter(
        (l) => !(l.scene === campaign.current && l.x === link.x && l.y === link.y),
      );
      changed({
        campaign: {
          ...campaign,
          links: [
            ...others,
            {
              id: crypto.randomUUID(),
              scene: campaign.current,
              x: link.x,
              y: link.y,
              target: link.target,
              label: link.label.slice(0, 120),
            },
          ],
        },
      });
      return true;
    },

    removeLink: (id) => {
      const { campaign } = get();
      if (!campaign) return;
      changed({ campaign: { ...campaign, links: campaign.links.filter((l) => l.id !== id) } });
    },

    setNotes: (notes) => {
      const { campaign } = get();
      if (!campaign || notes === campaign.notes) return;
      changed({ campaign: { ...campaign, notes: notes.slice(0, 50_000) } });
    },

    saveEncounter: (e) => {
      const { campaign } = get();
      if (!campaign) return;
      const exists = campaign.encounters.some((x) => x.id === e.id);
      if (!exists && campaign.encounters.length >= ENCOUNTERS_MAX) return;
      const copy = structuredClone(e);
      changed({
        campaign: {
          ...campaign,
          encounters: exists
            ? campaign.encounters.map((x) => (x.id === e.id ? copy : x))
            : [...campaign.encounters, copy],
        },
      });
    },

    removeEncounter: (id) => {
      const { campaign } = get();
      if (!campaign) return;
      changed({
        campaign: { ...campaign, encounters: campaign.encounters.filter((x) => x.id !== id) },
      });
    },

    addHandout: (h, image) => {
      const { campaign, handoutImages } = get();
      if (!campaign || campaign.handouts.length >= HANDOUTS_MAX) return null;
      const hid = crypto.randomUUID();
      const imgName = image
        ? `${hid}.${image.name.split('.').pop()?.toLowerCase() ?? 'png'}`
        : undefined;
      changed({
        campaign: {
          ...campaign,
          handouts: [
            ...campaign.handouts,
            {
              id: hid,
              title: h.title.trim().slice(0, 120) || 'Handout',
              text: h.text.slice(0, 20_000),
              ...(imgName ? { image: imgName } : {}),
            },
          ],
        },
        ...(image && imgName
          ? { handoutImages: new Map(handoutImages).set(imgName, image.bytes) }
          : {}),
      });
      return hid;
    },

    updateHandout: (id, patch) => {
      const { campaign } = get();
      if (!campaign) return;
      changed({
        campaign: {
          ...campaign,
          handouts: campaign.handouts.map((h) =>
            h.id === id
              ? {
                  ...h,
                  ...(patch.title !== undefined ? { title: patch.title.slice(0, 120) } : {}),
                  ...(patch.text !== undefined ? { text: patch.text.slice(0, 20_000) } : {}),
                }
              : h,
          ),
        },
      });
    },

    removeHandout: (id) => {
      const { campaign, handoutImages, shownHandout } = get();
      if (!campaign) return;
      const h = campaign.handouts.find((x) => x.id === id);
      const images = new Map(handoutImages);
      if (h?.image) images.delete(h.image);
      changed({
        campaign: { ...campaign, handouts: campaign.handouts.filter((x) => x.id !== id) },
        handoutImages: images,
        ...(shownHandout === id ? { shownHandout: null } : {}),
      });
    },

    showHandout: (id) => set({ shownHandout: id }),
  };
});

/** Verknüpfungen der aktiven Szene. */
export function activeLinks(c: Campaign | null): SceneLink[] {
  return c ? c.links.filter((l) => l.scene === c.current) : [];
}
