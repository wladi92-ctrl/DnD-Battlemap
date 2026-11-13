/**
 * .dndcampaign = ZIP-Archiv mit
 *   campaign.json          – Kampagne (Szenen, Verknüpfungen, Notizen, Begegnungen, Handouts)
 *   scenes/<id>.dndmap     – je Szene eine vollständige Karte (Format wie .dndmap, inkl.
 *                            eigener Assets und Schnappschüsse)
 *   handouts/<datei>       – Bilder der Handouts
 *   recovery.json          – nur in Autosave-Dateien
 *
 * Karten bleiben damit unverändert im bewährten Format (Version, Migration, Prüfung).
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { Encounter } from '../editor/encounter';
import type { MapSnapshot } from '../editor/snapshot';
import { ProjectFileError } from './errors';
import type { MapDocument, Team } from './mapDocument';
import { TEAMS } from './mapDocument';
import { decodeProject, encodeProject, RECOVERY_JSON, type RecoveryInfo } from './projectFile';

export const CAMPAIGN_EXTENSION = 'dndcampaign';
export const CAMPAIGN_FORMAT = 'dndcampaign';
export const CAMPAIGN_FORMAT_VERSION = 1;
export const CAMPAIGN_JSON = 'campaign.json';
const SCENE_DIR = 'scenes/';
const HANDOUT_DIR = 'handouts/';

export const SCENES_MAX = 100;
export const LINKS_MAX = 1000;
export const HANDOUTS_MAX = 200;
export const ENCOUNTERS_MAX = 200;
export const CAMPAIGN_NOTES_MAX = 50_000;

export interface CampaignScene {
  id: string;
  name: string;
}

/** Verknüpfung: Feld einer Szene führt zu einer anderen Szene (z. B. Tür → nächste Karte). */
export interface SceneLink {
  id: string;
  scene: string;
  x: number;
  y: number;
  target: string;
  label: string;
}

export interface Handout {
  id: string;
  title: string;
  text: string;
  /** Dateiname unter handouts/ (optional). */
  image?: string;
}

export interface Campaign {
  format: typeof CAMPAIGN_FORMAT;
  version: typeof CAMPAIGN_FORMAT_VERSION;
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  /** Aktive Szene beim Speichern. */
  current: string;
  scenes: CampaignScene[];
  links: SceneLink[];
  notes: string;
  encounters: Encounter[];
  handouts: Handout[];
}

export interface SceneData {
  doc: MapDocument;
  assets: ReadonlyMap<string, Uint8Array>;
  snapshots: MapSnapshot[];
}

export interface CampaignContents {
  campaign: Campaign;
  scenes: Map<string, SceneData>;
  handoutImages: Map<string, Uint8Array>;
  recovery: RecoveryInfo | null;
  /** Namen von Szenen-Dateien, die nicht gelesen werden konnten (werden gemeldet). */
  damaged: string[];
}

export function createCampaign(name: string, firstScene: CampaignScene): Campaign {
  const now = new Date().toISOString();
  return {
    format: CAMPAIGN_FORMAT,
    version: CAMPAIGN_FORMAT_VERSION,
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 120) || 'Kampagne',
    createdAt: now,
    modifiedAt: now,
    current: firstScene.id,
    scenes: [firstScene],
    links: [],
    notes: '',
    encounters: [],
    handouts: [],
  };
}

export function encodeCampaign(
  c: Omit<CampaignContents, 'recovery' | 'damaged'>,
  recovery: RecoveryInfo | null = null,
): Uint8Array {
  const files: Zippable = {
    [CAMPAIGN_JSON]: strToU8(JSON.stringify(c.campaign, null, 2)),
  };
  for (const s of c.campaign.scenes) {
    const data = c.scenes.get(s.id);
    if (!data) continue;
    // Szenen sind bereits komprimierte ZIPs.
    files[`${SCENE_DIR}${s.id}.dndmap`] = [
      encodeProject(data.doc, data.assets, null, data.snapshots),
      { level: 0 },
    ];
  }
  for (const h of c.campaign.handouts) {
    const img = h.image ? c.handoutImages.get(h.image) : undefined;
    if (h.image && img) files[HANDOUT_DIR + h.image] = [img, { level: 0 }];
  }
  if (recovery) files[RECOVERY_JSON] = strToU8(JSON.stringify(recovery));
  return zipSync(files, { level: 6 });
}

/** true, wenn die Bytes eine Kampagne (und keine einzelne Karte) sind. */
export function isCampaignFile(bytes: Uint8Array): boolean {
  try {
    return CAMPAIGN_JSON in unzipSync(bytes, { filter: (f) => f.name === CAMPAIGN_JSON });
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ Prüfung

const str = (v: unknown, max: number, fallback = '') =>
  typeof v === 'string' ? v.slice(0, max) : fallback;
const ID = /^[A-Za-z0-9_\-.:]{1,100}$/;
const id = (v: unknown) => (typeof v === 'string' && ID.test(v) ? v : null);
const int = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : min;
const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? v.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
    : [];

function parseEncounter(o: Record<string, unknown>): Encounter | null {
  const eid = id(o.id);
  if (!eid) return null;
  return {
    id: eid,
    name: str(o.name, 120, 'Begegnung') || 'Begegnung',
    party: arr(o.party)
      .slice(0, 20)
      .map((m) => ({ name: str(m.name, 60) || '?', level: int(m.level, 1, 20) })),
    groups: arr(o.groups)
      .slice(0, 30)
      .flatMap((g) => {
        const source = typeof g.source === 'string' ? g.source.slice(0, 100) : '';
        if (!source) return [];
        const team = TEAMS.includes(g.team as Team) ? (g.team as Team) : 'enemy';
        return [{ source, name: str(g.name, 120) || source, count: int(g.count, 1, 50), team }];
      }),
    notes: str(o.notes, 5000),
  };
}

/** Prüft campaign.json gegen die vorhandenen Szenen-Dateien. */
export function parseCampaign(raw: unknown, sceneIds: ReadonlySet<string>): Campaign {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (o.format !== CAMPAIGN_FORMAT) throw new ProjectFileError('wrongFormat');
  if (typeof o.version !== 'number') throw new ProjectFileError('invalidContent', ['version']);
  if (o.version > CAMPAIGN_FORMAT_VERSION) throw new ProjectFileError('newerVersion');

  const seen = new Set<string>();
  const scenes: CampaignScene[] = [];
  for (const s of arr(o.scenes).slice(0, SCENES_MAX)) {
    const sid = id(s.id);
    if (!sid || seen.has(sid) || !sceneIds.has(sid)) continue;
    seen.add(sid);
    scenes.push({ id: sid, name: str(s.name, 120) || sid });
  }
  const first = scenes[0];
  if (!first) throw new ProjectFileError('invalidContent', ['scenes']);
  const current = typeof o.current === 'string' && seen.has(o.current) ? o.current : first.id;

  const links: SceneLink[] = [];
  for (const l of arr(o.links).slice(0, LINKS_MAX)) {
    const lid = id(l.id);
    const scene = typeof l.scene === 'string' ? l.scene : '';
    const target = typeof l.target === 'string' ? l.target : '';
    if (!lid || !seen.has(scene) || !seen.has(target)) continue;
    links.push({
      id: lid,
      scene,
      target,
      x: int(l.x, 0, 199),
      y: int(l.y, 0, 199),
      label: str(l.label, 120),
    });
  }

  const handouts: Handout[] = [];
  for (const h of arr(o.handouts).slice(0, HANDOUTS_MAX)) {
    const hid = id(h.id);
    if (!hid) continue;
    const image = typeof h.image === 'string' && ID.test(h.image) ? h.image : undefined;
    handouts.push({
      id: hid,
      title: str(h.title, 120) || 'Handout',
      text: str(h.text, 20_000),
      ...(image ? { image } : {}),
    });
  }

  const encounters = arr(o.encounters)
    .slice(0, ENCOUNTERS_MAX)
    .map(parseEncounter)
    .filter((e): e is Encounter => e !== null);

  return {
    format: CAMPAIGN_FORMAT,
    version: CAMPAIGN_FORMAT_VERSION,
    id: id(o.id) ?? crypto.randomUUID(),
    name: str(o.name, 120, 'Kampagne') || 'Kampagne',
    createdAt: str(o.createdAt, 40),
    modifiedAt: str(o.modifiedAt, 40),
    current,
    scenes,
    links,
    notes: str(o.notes, CAMPAIGN_NOTES_MAX),
    encounters,
    handouts,
  };
}

export function decodeCampaign(bytes: Uint8Array): CampaignContents {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new ProjectFileError('notZip');
  }
  const json = entries[CAMPAIGN_JSON];
  if (!json) throw new ProjectFileError('wrongFormat');
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(json));
  } catch (e) {
    throw new ProjectFileError('invalidJson', [e instanceof Error ? e.message : String(e)]);
  }

  // Szenen lesen; jede Karte wird wie eine eigene .dndmap geprüft (und ggf. migriert).
  const scenes = new Map<string, SceneData>();
  const damagedIds: string[] = [];
  for (const [name, data] of Object.entries(entries)) {
    if (!name.startsWith(SCENE_DIR) || !name.endsWith('.dndmap')) continue;
    const sid = name.slice(SCENE_DIR.length, -'.dndmap'.length);
    if (!ID.test(sid)) continue;
    try {
      const p = decodeProject(data);
      scenes.set(sid, { doc: p.doc, assets: p.assets, snapshots: p.snapshots });
    } catch (e) {
      // Eine beschädigte Szene macht die Kampagne nicht unbrauchbar, wird aber gemeldet.
      if (e instanceof ProjectFileError && e.code === 'newerVersion') throw e;
      damagedIds.push(sid);
    }
  }
  const campaign = parseCampaign(raw, new Set(scenes.keys()));
  // Szenen-Dateien, die die Kampagne nicht (mehr) kennt, verwerfen.
  for (const sid of [...scenes.keys()])
    if (!campaign.scenes.some((s) => s.id === sid)) scenes.delete(sid);

  const handoutImages = new Map<string, Uint8Array>();
  for (const h of campaign.handouts) {
    const img = h.image ? entries[HANDOUT_DIR + h.image] : undefined;
    if (h.image && img) handoutImages.set(h.image, img);
    else if (h.image) delete h.image;
  }

  let recovery: RecoveryInfo | null = null;
  const rec = entries[RECOVERY_JSON];
  if (rec) {
    try {
      const r = JSON.parse(strFromU8(rec)) as Partial<RecoveryInfo>;
      recovery = {
        savedAt: typeof r.savedAt === 'string' ? r.savedAt : '',
        filePath: typeof r.filePath === 'string' ? r.filePath : null,
      };
    } catch {
      recovery = { savedAt: '', filePath: null };
    }
  }
  const names = (o: unknown) =>
    new Map(
      arr((o as Record<string, unknown> | null)?.scenes).map((s) => [
        String(s.id),
        str(s.name, 120),
      ]),
    );
  const known = names(raw);
  const damaged = damagedIds.map((d) => known.get(d) || d);
  return { campaign, scenes, handoutImages, recovery, damaged };
}
