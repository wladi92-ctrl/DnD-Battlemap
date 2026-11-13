/**
 * Einstellungen → Tastenkürzel: Einzeltasten-Befehle neu belegen. „Ändern“ wartet auf den
 * nächsten Tastendruck (Esc bricht ab); belegt die Taste schon einen anderen Befehl, verliert
 * dieser sie (mit Hinweis). Strg-Kombinationen sind fest.
 */
import { useEffect, useState } from 'react';
import {
  assignKey,
  buildKeymap,
  COMMANDS,
  isAssignable,
  keyLabel,
  resetCommand,
  type CommandId,
} from '../keymap';
import { useNoticeStore } from '../state/noticeStore';
import { useSettings } from '../state/settingsStore';
import { useT } from '../useT';

export function KeymapCard() {
  const t = useT();
  const overrides = useSettings((s) => s.keymap);
  const map = buildKeymap(overrides);
  const [capturing, setCapturing] = useState<CommandId | null>(null);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return setCapturing(null);
      if (!isAssignable(e.key)) {
        useNoticeStore.getState().push('error', t('keymap.reserved', { key: e.key }));
        return;
      }
      const s = useSettings.getState();
      const r = assignKey(s.keymap, capturing, e.key);
      s.setKeymap(r.overrides);
      setCapturing(null);
      if (r.displaced) {
        const info = COMMANDS.find((c) => c.id === r.displaced);
        useNoticeStore.getState().push(
          'info',
          t('keymap.displaced', {
            key: keyLabel(e.key.toLowerCase(), t),
            command: info ? t(info.label) : r.displaced,
          }),
        );
      }
    };
    // In der Capture-Phase, damit die Kartenkürzel die Taste nicht auslösen.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, t]);

  return (
    <div className="card">
      <h2>{t('keymap.heading')}</h2>
      <p className="muted small">{t('keymap.intro')}</p>
      <table className="keymap-table">
        <tbody>
          {COMMANDS.map((c) => {
            const keys = map[c.id];
            const custom = c.id in overrides;
            return (
              <tr key={c.id}>
                <th scope="row">{t(c.label)}</th>
                <td>
                  {keys.length ? (
                    keys.map((k) => <kbd key={k}>{keyLabel(k, t)}</kbd>)
                  ) : (
                    <span className="muted">{t('keymap.none')}</span>
                  )}
                </td>
                <td className="keymap-actions">
                  <button
                    type="button"
                    className="btn btn-small"
                    aria-pressed={capturing === c.id}
                    aria-label={t('keymap.changeFor', { command: t(c.label) })}
                    onClick={() => setCapturing(capturing === c.id ? null : c.id)}
                  >
                    {capturing === c.id ? t('keymap.press') : t('keymap.change')}
                  </button>
                  {custom && (
                    <button
                      type="button"
                      className="btn btn-small"
                      aria-label={t('keymap.resetFor', { command: t(c.label) })}
                      onClick={() => {
                        const s = useSettings.getState();
                        s.setKeymap(resetCommand(s.keymap, c.id));
                      }}
                    >
                      {t('keymap.default')}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        type="button"
        className="btn"
        disabled={!Object.keys(overrides).length}
        onClick={() => useSettings.getState().setKeymap({})}
      >
        {t('keymap.resetAll')}
      </button>
    </div>
  );
}
