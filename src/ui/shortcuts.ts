/** Übersicht aller Tastenkürzel (Anzeige auf der Startseite und in der README). */
import type { MessageKey } from '../i18n';

/** Benannte Tasten werden übersetzt (key.*), alle anderen wörtlich angezeigt. */
export type KeyToken =
  | {
      name:
        | 'ctrl'
        | 'shift'
        | 'alt'
        | 'space'
        | 'enter'
        | 'esc'
        | 'arrows'
        | 'wheel'
        | 'drag'
        | 'delete';
    }
  | string;

export interface ShortcutInfo {
  /** Jede innere Liste ist eine Tastenkombination; mehrere Listen = Alternativen. */
  keys: KeyToken[][];
  label: MessageKey;
}

const k = (name: Exclude<KeyToken, string>['name']) => ({ name });

export const shortcutList: readonly ShortcutInfo[] = [
  { keys: [[k('ctrl'), 'N']], label: 'shortcut.newMap' },
  { keys: [[k('ctrl'), 'O']], label: 'shortcut.open' },
  { keys: [[k('ctrl'), 'S']], label: 'shortcut.save' },
  { keys: [[k('ctrl'), k('shift'), 'S']], label: 'shortcut.saveAs' },
  {
    keys: [
      [k('ctrl'), 'Z'],
      [k('ctrl'), 'Y'],
    ],
    label: 'shortcut.undoRedo',
  },
  {
    keys: [
      [k('ctrl'), 'C'],
      [k('ctrl'), 'V'],
      [k('ctrl'), 'D'],
      [k('ctrl'), 'A'],
    ],
    label: 'shortcut.clipboard',
  },
  { keys: [['V'], ['B'], ['U'], ['L'], ['F'], ['E'], ['N']], label: 'shortcut.tools' },
  { keys: [['H']], label: 'shortcut.pan' },
  { keys: [['R']], label: 'shortcut.ruler' },
  { keys: [['Q']], label: 'shortcut.rotate' },
  { keys: [['Y']], label: 'shortcut.flip' },
  { keys: [[k('delete')]], label: 'shortcut.delete' },
  { keys: [['G']], label: 'shortcut.grid' },
  { keys: [['T']], label: 'shortcut.terrainOverlay' },
  { keys: [[k('enter')]], label: 'shortcut.apply' },
  { keys: [['+'], ['−']], label: 'shortcut.zoom' },
  { keys: [['0']], label: 'shortcut.fit' },
  { keys: [[k('wheel')]], label: 'shortcut.wheel' },
  { keys: [[k('arrows')]], label: 'shortcut.cursor' },
  { keys: [[k('shift'), k('arrows')]], label: 'shortcut.panView' },
  { keys: [[k('space'), k('drag')]], label: 'shortcut.panDrag' },
  { keys: [[k('enter')], [k('esc')]], label: 'shortcut.rulerKeys' },
  {
    keys: [
      [k('alt'), '1'],
      [k('alt'), '2'],
      [k('alt'), '3'],
    ],
    label: 'shortcut.pages',
  },
];

/** true, wenn ein Tastendruck in einem Eingabefeld landet und ignoriert werden soll. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'range', 'button', 'color'].includes(target.type);
  }
  return false;
}
