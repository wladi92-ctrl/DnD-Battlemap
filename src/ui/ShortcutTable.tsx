import { Fragment } from 'react';
import type { MessageKey } from '../i18n';
import { shortcutList, type KeyToken } from './shortcuts';
import { useT } from './useT';

export function ShortcutTable() {
  const t = useT();
  const label = (k: KeyToken) => (typeof k === 'string' ? k : t(`key.${k.name}` as MessageKey));
  return (
    <dl className="shortcut-list">
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
