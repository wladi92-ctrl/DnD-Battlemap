/**
 * Anpassbare Tastenkürzel: Einzeltasten-Befehle der Kartenansicht (Werkzeuge, Raster, Drehen,
 * Zoom, Zugwechsel …). Kombinationen mit Strg (Speichern, Rückgängig, Kopieren …) sind
 * Betriebssystem-Standard und bleiben fest. Tasten werden als `KeyboardEvent.key` in
 * Kleinbuchstaben gespeichert („b“, „pagedown“, „f2“, „+“).
 */
import type { MessageKey } from '../i18n';
import type { Tool } from './state/viewStore';

/** Werkzeuge in Toolbar-Reihenfolge mit Standardtaste. */
export const TOOL_DEFAULTS: readonly { id: Tool; key: string }[] = [
  { id: 'pan', key: 'h' },
  { id: 'select', key: 'v' },
  { id: 'brush', key: 'b' },
  { id: 'rect', key: 'u' },
  { id: 'line', key: 'l' },
  { id: 'fill', key: 'f' },
  { id: 'erase', key: 'e' },
  { id: 'wall', key: 'w' },
  { id: 'note', key: 'n' },
  { id: 'ruler', key: 'r' },
  { id: 'effect', key: 'a' },
  { id: 'fog', key: 'o' },
  { id: 'light', key: 'i' },
  { id: 'draw', key: 'z' },
];

export type ActionId =
  | 'grid'
  | 'door'
  | 'terrain'
  | 'rotate'
  | 'flip'
  | 'delete'
  | 'zoomIn'
  | 'zoomOut'
  | 'fit'
  | 'dice'
  | 'nextTurn'
  | 'prevTurn'
  | 'ping'
  | 'clearDrawings'
  | 'fullscreen';

export type CommandId = `tool.${Tool}` | ActionId;

export interface CommandInfo {
  id: CommandId;
  label: MessageKey;
  defaults: readonly string[];
}

const ACTIONS: readonly CommandInfo[] = [
  { id: 'grid', label: 'shortcut.grid', defaults: ['g'] },
  { id: 'door', label: 'shortcut.door', defaults: ['d'] },
  { id: 'terrain', label: 'shortcut.terrainOverlay', defaults: ['t'] },
  { id: 'rotate', label: 'shortcut.rotate', defaults: ['q'] },
  { id: 'flip', label: 'shortcut.flip', defaults: ['y'] },
  { id: 'delete', label: 'shortcut.delete', defaults: ['delete', 'backspace'] },
  { id: 'zoomIn', label: 'keymap.zoomIn', defaults: ['+', '='] },
  { id: 'zoomOut', label: 'keymap.zoomOut', defaults: ['-'] },
  { id: 'fit', label: 'shortcut.fit', defaults: ['0'] },
  { id: 'dice', label: 'shortcut.dice', defaults: ['x'] },
  { id: 'nextTurn', label: 'keymap.nextTurn', defaults: ['pagedown'] },
  { id: 'prevTurn', label: 'keymap.prevTurn', defaults: ['pageup'] },
  { id: 'ping', label: 'keymap.ping', defaults: ['p'] },
  { id: 'clearDrawings', label: 'keymap.clearDrawings', defaults: ['c'] },
  { id: 'fullscreen', label: 'keymap.fullscreen', defaults: ['f11'] },
];

export const COMMANDS: readonly CommandInfo[] = [
  ...TOOL_DEFAULTS.map((tl) => ({
    id: `tool.${tl.id}` as CommandId,
    label: `tool.${tl.id}` as MessageKey,
    defaults: [tl.key],
  })),
  ...ACTIONS,
];

const COMMAND_IDS = new Set<string>(COMMANDS.map((c) => c.id));

/** Tasten, die die Kartenansicht selbst braucht (Fokusfeld, Bestätigen, Abbrechen, Ziehen). */
export const RESERVED_KEYS: ReadonlySet<string> = new Set([
  'escape',
  'enter',
  'tab',
  ' ',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'shift',
  'control',
  'alt',
  'altgraph',
  'meta',
  'contextmenu',
  'dead',
  'unidentified',
]);

/** Eigene Belegung: Befehl → Tasten (leere Liste = ohne Taste). */
export type KeyOverrides = Partial<Record<CommandId, string[]>>;
export type Keymap = Record<CommandId, readonly string[]>;

export function normalizeKey(key: string): string {
  return key.toLowerCase();
}

export function isAssignable(key: string): boolean {
  const k = normalizeKey(key);
  return k.length > 0 && !RESERVED_KEYS.has(k);
}

/** Vollständige Belegung (Standard + eigene Änderungen). */
export function buildKeymap(overrides: KeyOverrides): Keymap {
  const map = {} as Record<CommandId, readonly string[]>;
  for (const c of COMMANDS) map[c.id] = overrides[c.id] ?? c.defaults;
  return map;
}

/** Taste → Befehl (erste Belegung gewinnt; Konflikte verhindert assignKey). */
export function keyIndex(map: Keymap): Map<string, CommandId> {
  const idx = new Map<string, CommandId>();
  for (const c of COMMANDS) for (const k of map[c.id]) if (!idx.has(k)) idx.set(k, c.id);
  return idx;
}

/**
 * Belegt `command` mit `key`. Hatte ein anderer Befehl die Taste, verliert er sie (er wird
 * zurückgegeben, damit die Oberfläche darauf hinweisen kann).
 */
export function assignKey(
  overrides: KeyOverrides,
  command: CommandId,
  key: string,
): { overrides: KeyOverrides; displaced: CommandId | null } {
  const k = normalizeKey(key);
  const current = buildKeymap(overrides);
  const next: KeyOverrides = { ...overrides };
  let displaced: CommandId | null = null;
  for (const c of COMMANDS) {
    if (c.id === command) continue;
    if (current[c.id].includes(k)) {
      next[c.id] = current[c.id].filter((x) => x !== k);
      displaced = c.id;
    }
  }
  next[command] = [k];
  return { overrides: simplify(next), displaced };
}

/** Befehl auf seine Standardtasten zurücksetzen (Konflikte wie bei assignKey auflösen). */
export function resetCommand(overrides: KeyOverrides, command: CommandId): KeyOverrides {
  const info = COMMANDS.find((c) => c.id === command);
  if (!info) return overrides;
  let next: KeyOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([id]) => id !== command),
  );
  for (const k of info.defaults) {
    for (const c of COMMANDS) {
      if (c.id === command) continue;
      const keys = buildKeymap(next)[c.id];
      if (keys.includes(k)) next = { ...next, [c.id]: keys.filter((x) => x !== k) };
    }
  }
  return simplify(next);
}

/** Einträge, die genau dem Standard entsprechen, entfallen. */
function simplify(o: KeyOverrides): KeyOverrides {
  const out: KeyOverrides = {};
  for (const c of COMMANDS) {
    const v = o[c.id];
    if (!v) continue;
    const same = v.length === c.defaults.length && v.every((k, i) => k === c.defaults[i]);
    if (!same) out[c.id] = [...v];
  }
  return out;
}

/** Gespeicherte Belegung prüfen: unbekannte Befehle, reservierte Tasten, Doppelte verwerfen. */
export function sanitizeOverrides(raw: unknown): KeyOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: KeyOverrides = {};
  for (const [id, keys] of Object.entries(raw as Record<string, unknown>)) {
    if (!COMMAND_IDS.has(id) || !Array.isArray(keys)) continue;
    const valid = keys
      .filter((k): k is string => typeof k === 'string' && k.length <= 20 && isAssignable(k))
      .map(normalizeKey);
    out[id as CommandId] = [...new Set(valid)].slice(0, 4);
  }
  // Doppelte Tasten: der zuerst gelistete Befehl behält sie.
  const seen = new Set<string>();
  const map = buildKeymap(out);
  for (const c of COMMANDS) {
    const keys = map[c.id].filter((k) => !seen.has(k));
    keys.forEach((k) => seen.add(k));
    if (keys.length !== map[c.id].length || out[c.id]) out[c.id] = keys;
  }
  return simplify(out);
}

const NAMED: Record<string, MessageKey> = {
  pagedown: 'key.pageDown',
  pageup: 'key.pageUp',
  delete: 'key.delete',
  backspace: 'key.backspace',
  home: 'key.home',
  end: 'key.end',
  insert: 'key.insert',
};

/** Anzeige einer Taste („B“, „Bild↓“, „F2“). */
export function keyLabel(key: string, t: (k: MessageKey) => string): string {
  const named = NAMED[key];
  if (named) return t(named);
  if (key.length === 1) return key.toUpperCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
}
