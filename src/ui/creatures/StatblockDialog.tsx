/** Statblock einer Kreatur. Beschriftungen deutsch, SRD-Texte im englischen Original. */
import {
  abilityMod,
  formatCr,
  formatMod,
  type Creature,
  type CreatureAction,
} from '../../data/srd/creatures';
import type { MessageKey } from '../../i18n';
import { Modal } from '../Modal';
import { useEditorStore } from '../state/editorStore';
import { useT } from '../useT';
import { sizeLabel, typeLabel } from './labels';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export function StatblockDialog() {
  const creature = useEditorStore((s) => s.statblock);
  if (!creature) return null;
  return <Statblock c={creature} onClose={() => useEditorStore.getState().showStatblock(null)} />;
}

function Statblock({ c, onClose }: { c: Creature; onClose: () => void }) {
  const t = useT();
  const homebrew = 'homebrew' in c;
  const speed = [
    `${c.speed.walk ?? 0} ft`,
    ...(['fly', 'swim', 'climb', 'burrow'] as const)
      .filter((k) => c.speed[k])
      .map(
        (k) =>
          `${t(`sb.${k}` as MessageKey)} ${c.speed[k]} ft${k === 'fly' && c.speed.hover ? ` ${t('sb.hover')}` : ''}`,
      ),
  ].join(', ');
  const senses = [
    ...(['darkvision', 'blindsight', 'truesight', 'tremorsense'] as const)
      .filter((k) => c.senses[k])
      .map((k) => `${t(`sb.${k}` as MessageKey)} ${c.senses[k]} ft`),
    t('sb.passive', { value: c.senses.passive ?? 10 }),
  ].join(', ');
  const kv = (rec: Record<string, number>) =>
    Object.entries(rec)
      .map(([k, v]) => `${k} ${formatMod(v)}`)
      .join(', ');
  const rows: [MessageKey, string][] = [
    ['sb.saves', kv(c.saves)],
    ['sb.skills', kv(c.skills)],
    ['sb.vulnerable', c.vulnerable.join('; ')],
    ['sb.resist', c.resist.join('; ')],
    ['sb.immune', c.immune.join('; ')],
    ['sb.conditionImmune', c.conditionImmune.join(', ')],
    ['sb.senses', senses],
    ['sb.languages', c.languages || '—'],
  ];

  const section = (key: MessageKey, list: CreatureAction[]) =>
    list.length > 0 && (
      <section className="sb-section">
        <h3>{t(key)}</h3>
        {list.map((a, i) => (
          <p key={i}>
            <strong>
              <em>
                {a.name}
                {a.usage ? ` (${a.usage})` : ''}.
              </em>
            </strong>{' '}
            {a.desc}
          </p>
        ))}
      </section>
    );

  return (
    <Modal title={c.name} onClose={onClose} wide>
      <div className="statblock" lang="en">
        <p className="sb-sub" lang="de">
          {sizeLabel(t, c.size)} · {typeLabel(t, c.type)}
          {c.subtype ? ` (${c.subtype})` : ''}
          {c.alignment ? ` · ${c.alignment}` : ''}
        </p>
        <dl className="sb-core" lang="de">
          <dt>{t('sb.ac')}</dt>
          <dd>
            {c.ac}
            {c.acNote ? ` (${c.acNote})` : ''}
          </dd>
          <dt>{t('sb.hp')}</dt>
          <dd>
            {c.hp}
            {c.hitDice ? ` (${c.hitDice})` : ''}
          </dd>
          <dt>{t('sb.speed')}</dt>
          <dd>{speed}</dd>
        </dl>
        <table className="sb-abilities" lang="de">
          <thead>
            <tr>
              {ABILITIES.map((a) => (
                <th key={a} scope="col">
                  {t(`ability.${a}` as MessageKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {c.abilities.map((v, i) => (
                <td key={i}>
                  {v} ({formatMod(abilityMod(v))})
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <dl className="sb-core">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="sb-row">
                <dt lang="de">{t(k)}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          <div className="sb-row">
            <dt lang="de">{t('sb.challenge')}</dt>
            <dd>
              {formatCr(c.cr)} ({t('sb.xp', { xp: c.xp })}) · {t('sb.prof')} {formatMod(c.prof)}
            </dd>
          </div>
        </dl>
        {section('sb.traits', c.traits)}
        {section('sb.actions', c.actions)}
        {section('sb.reactions', c.reactions)}
        {section('sb.legendary', c.legendary)}
        <p className="muted small" lang="de">
          {homebrew ? t('sb.homebrewSource') : t('sb.source')}
        </p>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </Modal>
  );
}
