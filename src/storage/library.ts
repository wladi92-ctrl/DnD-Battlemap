/**
 * Lokale Bibliothek für Spielercharaktere und eigene Kreaturen (Homebrew).
 * Desktop: SQLite im App-Datenordner (Rust-Commands library_*).
 * Browser-Vorschau (nur Entwicklung): localStorage.
 *
 * Einträge werden beim Lesen geprüft und normalisiert – eine beschädigte oder von Hand
 * geänderte Datenbank bringt die App nicht zum Absturz, fehlerhafte Einträge werden übersprungen.
 */
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  SIZE_CATEGORIES,
  type Creature,
  type CreatureAction,
  type SizeCategory,
} from '../data/srd/creatures';

export type LibraryKind = 'pc' | 'creature';

export interface RawEntry {
  kind: LibraryKind;
  id: string;
  name: string;
  data: string;
  modifiedAt: string;
}

export interface LibraryBackend {
  list(kind: LibraryKind): Promise<RawEntry[]>;
  put(kind: LibraryKind, id: string, name: string, data: string): Promise<RawEntry>;
  delete(kind: LibraryKind, id: string): Promise<boolean>;
}

/** Spielercharakter (Vorlage für Tokens). */
export interface PlayerCharacter {
  id: string;
  name: string;
  className: string;
  level: number;
  size: SizeCategory;
  ac: number;
  hpMax: number;
  initiativeBonus: number;
  passivePerception: number;
  speed: number;
  darkvision: number;
  /** Token-Bild als Data-URL (PNG/JPEG/WebP), höchstens ~3 MB. */
  image?: string;
}

/** Eigene Kreatur: gleiches Format wie SRD-Kreaturen, plus optionales Bild. */
export interface HomebrewCreature extends Creature {
  homebrew: true;
  image?: string;
}

export const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
export const LIBRARY_IMAGE_MAX = 3 * 1024 * 1024;

const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.round(v)))
    : fallback;
const str = (v: unknown, max: number, fallback = '') =>
  typeof v === 'string' ? v.slice(0, max) : fallback;
const size = (v: unknown): SizeCategory =>
  SIZE_CATEGORIES.includes(v as SizeCategory) ? (v as SizeCategory) : 'medium';
const image = (v: unknown) =>
  typeof v === 'string' && v.length <= LIBRARY_IMAGE_MAX && IMAGE_DATA_URL.test(v) ? v : undefined;

export function normalizePc(id: string, name: string, raw: unknown): PlayerCharacter {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const img = image(o.image);
  return {
    id,
    name: name.trim().slice(0, 120) || 'Charakter',
    className: str(o.className, 60),
    level: int(o.level, 1, 30, 1),
    size: size(o.size),
    ac: int(o.ac, 0, 99, 10),
    hpMax: int(o.hpMax, 1, 100_000, 10),
    initiativeBonus: int(o.initiativeBonus, -99, 99, 0),
    passivePerception: int(o.passivePerception, 0, 99, 10),
    speed: int(o.speed, 0, 1000, 30),
    darkvision: int(o.darkvision, 0, 1000, 0),
    ...(img ? { image: img } : {}),
  };
}

const actions = (v: unknown): CreatureAction[] =>
  (Array.isArray(v) ? v : [])
    .slice(0, 50)
    .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === 'object')
    .map((a) => ({ name: str(a.name, 120), desc: str(a.desc, 5000) }))
    .filter((a) => a.name);

export function normalizeCreature(id: string, name: string, raw: unknown): HomebrewCreature {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const sp = (o.speed && typeof o.speed === 'object' ? o.speed : {}) as Record<string, unknown>;
  const se = (o.senses && typeof o.senses === 'object' ? o.senses : {}) as Record<string, unknown>;
  const abil = Array.isArray(o.abilities) ? o.abilities : [];
  const cr =
    typeof o.cr === 'number' && Number.isFinite(o.cr) ? Math.min(30, Math.max(0, o.cr)) : 0;
  const speed: Creature['speed'] = { walk: int(sp.walk, 0, 1000, 30) };
  for (const k of ['fly', 'swim', 'climb', 'burrow'] as const) {
    const v = int(sp[k], 0, 1000, 0);
    if (v) speed[k] = v;
  }
  const senses: Creature['senses'] = { passive: int(se.passive, 0, 99, 10) };
  for (const k of ['darkvision', 'blindsight', 'truesight', 'tremorsense'] as const) {
    const v = int(se[k], 0, 1000, 0);
    if (v) senses[k] = v;
  }
  const img = image(o.image);
  return {
    id,
    homebrew: true,
    name: name.trim().slice(0, 120) || 'Kreatur',
    size: size(o.size),
    type: str(o.type, 40, 'humanoid') || 'humanoid',
    alignment: str(o.alignment, 60),
    ac: int(o.ac, 0, 99, 10),
    hp: int(o.hp, 1, 100_000, 10),
    hitDice: str(o.hitDice, 30),
    speed,
    abilities: [0, 1, 2, 3, 4, 5].map((i) => int(abil[i], 1, 30, 10)),
    saves: {},
    skills: {},
    vulnerable: [],
    resist: [],
    immune: [],
    conditionImmune: [],
    senses,
    languages: str(o.languages, 200),
    cr,
    xp: int(o.xp, 0, 1_000_000, 0),
    prof: int(o.prof, 0, 20, 2),
    reach: int(o.reach, 0, 1000, 5),
    traits: actions(o.traits),
    actions: actions(o.actions),
    reactions: actions(o.reactions),
    legendary: [],
    ...(img ? { image: img } : {}),
  };
}

export function createTauriLibrary(): LibraryBackend {
  return {
    list: (kind) => invoke<RawEntry[]>('library_list', { kind }),
    put: (kind, id, name, data) => invoke<RawEntry>('library_put', { kind, id, name, data }),
    delete: (kind, id) => invoke<boolean>('library_delete', { kind, id }),
  };
}

const LS_KEY = 'dndmap.library.v1';

/** Browser-Vorschau: alle Einträge als JSON in localStorage. */
export function createLocalStorageLibrary(storage: Storage = localStorage): LibraryBackend {
  const read = (): RawEntry[] => {
    try {
      const v = JSON.parse(storage.getItem(LS_KEY) ?? '[]') as unknown;
      return Array.isArray(v) ? (v as RawEntry[]) : [];
    } catch {
      return [];
    }
  };
  const write = (list: RawEntry[]) => {
    try {
      storage.setItem(LS_KEY, JSON.stringify(list));
    } catch {
      throw new Error('Speicher des Browsers ist voll.');
    }
  };
  return {
    async list(kind) {
      return read()
        .filter((e) => e.kind === kind)
        .sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
    },
    async put(kind, id, name, data) {
      const entry: RawEntry = {
        kind,
        id,
        name: name.trim(),
        data,
        modifiedAt: new Date().toISOString(),
      };
      write([...read().filter((e) => !(e.kind === kind && e.id === id)), entry]);
      return entry;
    },
    async delete(kind, id) {
      const list = read();
      const next = list.filter((e) => !(e.kind === kind && e.id === id));
      write(next);
      return next.length !== list.length;
    },
  };
}

let backend: LibraryBackend | null = null;

export function getLibrary(): LibraryBackend {
  backend ??= isTauri() ? createTauriLibrary() : createLocalStorageLibrary();
  return backend;
}

/** Für Tests: anderes Backend setzen (null = Standard). */
export function setLibrary(b: LibraryBackend | null): void {
  backend = b;
}

const parse = (data: string): unknown => {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};

export async function listPcs(lib = getLibrary()): Promise<PlayerCharacter[]> {
  return (await lib.list('pc'))
    .filter((e) => parse(e.data))
    .map((e) => normalizePc(e.id, e.name, parse(e.data)));
}

export async function listHomebrew(lib = getLibrary()): Promise<HomebrewCreature[]> {
  return (await lib.list('creature'))
    .filter((e) => parse(e.data))
    .map((e) => normalizeCreature(e.id, e.name, parse(e.data)));
}

export async function savePc(pc: PlayerCharacter, lib = getLibrary()): Promise<PlayerCharacter> {
  const clean = normalizePc(pc.id, pc.name, pc);
  const { id, name, ...data } = clean;
  await lib.put('pc', id, name, JSON.stringify(data));
  return clean;
}

export async function saveHomebrew(
  c: HomebrewCreature,
  lib = getLibrary(),
): Promise<HomebrewCreature> {
  const clean = normalizeCreature(c.id, c.name, c);
  const { id, name, ...data } = clean;
  await lib.put('creature', id, name, JSON.stringify(data));
  return clean;
}

export function deleteEntry(kind: LibraryKind, id: string, lib = getLibrary()): Promise<boolean> {
  return lib.delete(kind, id);
}

/** Data-URL → Bytes und Dateiendung (für das Einbetten in die Karte). */
export function dataUrlToBytes(url: string): { bytes: Uint8Array; ext: string } | null {
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(url);
  if (!m?.[1] || !m[2]) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, ext: m[1] === 'jpeg' ? 'jpg' : m[1] };
}
