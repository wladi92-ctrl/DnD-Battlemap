/** Übersicht der Tastenkürzel: anpassbare Einzeltasten (aktuelle Belegung) und feste Kürzel. */
import { Fragment } from 'react';
import type { MessageKey } from '../i18n';
import { buildKeymap, COMMANDS, keyLabel } from './keymap';
import { shortcutList, type KeyToken } from './shortcuts';
import { useSettings } from './state/settingsStore';
import { useT } from './useT';

export function ShortcutTable() {
  const t = useT();
  const map = buildKeymap(useSettings((s) => s.keymap));
  const label = (k: KeyToken) => (typeof k === 'string' ? k : t(`key.${k.name}` as MessageKey));
  return (
    <dl className="shortcut-list">
      {COMMANDS.filter((c) => map[c.id].length).map((c) => (
        <Fragment key={c.id}>
          <dt>
            {map[c.id].map((k, i) => (
              <Fragment key={k}>
                {i > 0 && ' / '}
                <kbd>{keyLabel(k, t)}</kbd>
              </Fragment>
            ))}
          </dt>
          <dd>{t(c.label)}</dd>
        </Fragment>
      ))}
      {shortcutList.map((s) => (
        <Fragment key={s.label}>
          <dt>
            {s.keys.map((combo, i) => (
              <Fragment key={i}>
                {i > 0 && ' / '}
                {combo.map((key, j) => (
                  <Fragment key={j}>
                    {j > 0 && ' + '}
                    <kbd>{label(key)}</kbd>
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </dt>
          <dd>{t(s.label)}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
