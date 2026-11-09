/**
 * Angriffs-Helfer: Angriff aus dem Statblock oder eigener Angriff, Ziele wählen, Trefferwurf
 * gegen RK (Vorteil/Nachteil, 20 = kritisch, 1 = verfehlt), Schaden würfeln mit Resistenzen,
 * anwenden in einem Undo-Schritt; alles im Kampflog.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { parseDice, type Advantage } from '../../core/dice';
import { loadCreatures, type Creature } from '../../data/srd/creatures';
import {
  attackOptions,
  attackRoll,
  damageAgainst,
  rollDamage,
  type AttackOption,
  type AttackRoll,
  type DamageRollPart,
} from '../../editor/attack';
import { damageToken, isHostile, updateTokens } from '../../editor/tokens';
import type { MessageKey } from '../../i18n';
import { DAMAGE_TYPES, type DamageType, type Token } from '../../storage/mapDocument';
import { Modal } from '../Modal';
import { useEditorStore } from '../state/editorStore';
import { useLibraryStore } from '../state/libraryStore';
import { useMapStore } from '../state/mapStore';
import { useT } from '../useT';
import { log } from './combatTools';

interface Outcome {
  tokenId: string;
  roll: AttackRoll;
  parts: DamageRollPart[];
  damage: string;
  apply: boolean;
}

export function AttackDialog() {
  const attackerId = useEditorStore((s) => s.attackerId);
  const doc = useMapStore((s) => s.doc);
  const attacker = attackerId ? doc?.tokens.find((t) => t.id === attackerId) : undefined;
  if (!attacker) return null;
  return <Attack key={attacker.id} attacker={attacker} />;
}

function Attack({ attacker }: { attacker: Token }) {
  const t = useT();
  const id = useId();
  const doc = useMapStore((s) => s.doc);
  const homebrew = useLibraryStore((s) => s.homebrew);
  const [srd, setSrd] = useState<Creature[] | null>(null);
  const [choice, setChoice] = useState('0');
  const [bonus, setBonus] = useState('5');
  const [dice, setDice] = useState('1d8+3');
  const [dtype, setDtype] = useState<DamageType | ''>('');
  const [mode, setMode] = useState<Advantage>('normal');
  const selection = useEditorStore.getState().selection;
  const [targets, setTargets] = useState<Set<string>>(
    () =>
      new Set(
        [...selection].filter((x) => x !== attacker.id && doc?.tokens.some((tk) => tk.id === x)),
      ),
  );
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const close = () => useEditorStore.getState().openAttack(null);

  useEffect(() => {
    let alive = true;
    void loadCreatures().then((l) => alive && setSrd(l));
    return () => {
      alive = false;
    };
  }, []);

  const creatureOf = useMemo(() => {
    const m = new Map<string, Creature>();
    for (const c of [...(srd ?? []), ...homebrew]) m.set(c.id, c);
    return (tk: Token) => (tk.kind === 'creature' && tk.source ? m.get(tk.source) : undefined);
  }, [srd, homebrew]);

  const options = attackOptions(creatureOf(attacker));
  const custom = choice === 'custom' || !options.length;
  const option: AttackOption | null = custom
    ? parseDice(dice)
      ? {
          name: t('attack.custom'),
          bonus: Math.round(Number(bonus) || 0),
          parts: [{ dice, ...(dtype ? { type: dtype } : {}) }],
        }
      : null
    : (options[Number(choice)] ?? null);

  // Mögliche Ziele: Feinde zuerst, dann der Rest (ohne den Angreifer).
  const candidates = (doc?.tokens ?? [])
    .filter((x) => x.id !== attacker.id)
    .sort(
      (a, b) => Number(isHostile(b.team, attacker.team)) - Number(isHostile(a.team, attacker.team)),
    );

  const roll = () => {
    if (!option || !doc) return;
    const res: Outcome[] = [];
    for (const tid of targets) {
      const target = doc.tokens.find((x) => x.id === tid);
      if (!target) continue;
      const r = attackRoll(option.bonus, target.ac, mode);
      const parts = r.hit ? rollDamage(option.parts, r.critical) : [];
      const amount = r.hit ? damageAgainst(parts, creatureOf(target)) : 0;
      res.push({ tokenId: tid, roll: r, parts, damage: String(amount), apply: r.hit });
      log(
        'attack',
        t(r.critical ? 'log.attackCrit' : r.hit ? 'log.attackHit' : 'log.attackMiss', {
          attacker: attacker.name,
          weapon: option.name,
          target: target.name,
          total: r.total,
          rolls: r.rolls.join('/'),
          ac: target.ac,
          damage: amount,
        }),
      );
    }
    setOutcomes(res);
  };

  const apply = () => {
    if (!doc || !outcomes) return;
    const map = new Map(outcomes.filter((o) => o.apply).map((o) => [o.tokenId, o]));
    if (!map.size) return close();
    const r = updateTokens(doc, new Set(map.keys()), (tk) => {
      const o = map.get(tk.id);
      return o
        ? damageToken(tk, Math.max(0, Math.round(Number(o.damage) || 0)), o.roll.critical)
        : tk;
    });
    useMapStore.getState().run(r, 'action.tokenHp');
    log(
      'damage',
      t('log.damageApplied', {
        list: [...map.values()]
          .map(
            (o) =>
              `${doc.tokens.find((x) => x.id === o.tokenId)?.name ?? '?'} ${Math.round(Number(o.damage) || 0)}`,
          )
          .join(', '),
      }),
    );
    close();
  };

  return (
    <Modal title={t('attack.heading', { name: attacker.name })} onClose={close} wide>
      <div className="assist-settings">
        <label htmlFor={`${id}-opt`}>{t('attack.weapon')}</label>
        <select
          id={`${id}-opt`}
          value={custom ? 'custom' : choice}
          onChange={(e) => setChoice(e.target.value)}
        >
          {options.map((o, i) => (
            <option key={i} value={String(i)}>
              {o.name} ({o.bonus >= 0 ? '+' : ''}
              {o.bonus}, {o.parts.map((p) => p.dice).join(' + ')})
            </option>
          ))}
          <option value="custom">{t('attack.custom')}</option>
        </select>
        {custom && (
          <>
            <label htmlFor={`${id}-b`}>{t('attack.bonus')}</label>
            <input
              id={`${id}-b`}
              type="number"
              className="input-narrow"
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
            />
            <label htmlFor={`${id}-d`}>{t('effect.damageDice')}</label>
            <input
              id={`${id}-d`}
              className="input-narrow"
              value={dice}
              onChange={(e) => setDice(e.target.value)}
              aria-invalid={!parseDice(dice)}
            />
            <label htmlFor={`${id}-t`}>{t('effect.damageType')}</label>
            <select
              id={`${id}-t`}
              value={dtype}
              onChange={(e) => setDtype(e.target.value as DamageType | '')}
            >
              <option value="">–</option>
              {DAMAGE_TYPES.map((d) => (
                <option key={d} value={d}>
                  {t(`damage.${d}` as MessageKey)}
                </option>
              ))}
            </select>
          </>
        )}
        <label htmlFor={`${id}-m`}>{t('assist.advantage')}</label>
        <select id={`${id}-m`} value={mode} onChange={(e) => setMode(e.target.value as Advantage)}>
          <option value="normal">{t('assist.adv.normal')}</option>
          <option value="advantage">{t('assist.adv.advantage')}</option>
          <option value="disadvantage">{t('assist.adv.disadvantage')}</option>
        </select>
      </div>
      <fieldset className="panel-fieldset attack-targets">
        <legend>{t('attack.targets')}</legend>
        {candidates.map((c) => (
          <label key={c.id} className="panel-check">
            <input
              type="checkbox"
              checked={targets.has(c.id)}
              onChange={(e) =>
                setTargets((s) => {
                  const n = new Set(s);
                  if (e.target.checked) n.add(c.id);
                  else n.delete(c.id);
                  return n;
                })
              }
            />
            {c.name}{' '}
            <span className="muted small">
              {t('combat.stats', { hp: c.hp.current, max: c.hp.max, ac: c.ac })}
            </span>
          </label>
        ))}
      </fieldset>
      {outcomes && (
        <table className="assist-table">
          <thead>
            <tr>
              <th scope="col">{t('assist.target')}</th>
              <th scope="col">{t('attack.roll')}</th>
              <th scope="col">{t('attack.result')}</th>
              <th scope="col">{t('assist.damage')}</th>
            </tr>
          </thead>
          <tbody>
            {outcomes.map((o) => {
              const target = doc?.tokens.find((x) => x.id === o.tokenId);
              return (
                <tr key={o.tokenId}>
                  <td>
                    <label className="panel-check">
                      <input
                        type="checkbox"
                        checked={o.apply}
                        onChange={(e) =>
                          setOutcomes(
                            (os) =>
                              os?.map((x) =>
                                x.tokenId === o.tokenId ? { ...x, apply: e.target.checked } : x,
                              ) ?? null,
                          )
                        }
                      />
                      {target?.name}
                    </label>
                  </td>
                  <td>
                    {o.roll.total}{' '}
                    <span className="muted small">
                      [{o.roll.rolls.join(', ')}] {t('attack.vsAc', { ac: target?.ac ?? 0 })}
                    </span>
                  </td>
                  <td className={o.roll.hit ? 'save-ok' : 'save-fail'}>
                    {t(o.roll.critical ? 'attack.crit' : o.roll.hit ? 'attack.hit' : 'attack.miss')}
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      className="input-narrow"
                      aria-label={t('attack.damageFor', { name: target?.name ?? '' })}
                      value={o.damage}
                      onChange={(e) =>
                        setOutcomes(
                          (os) =>
                            os?.map((x) =>
                              x.tokenId === o.tokenId ? { ...x, damage: e.target.value } : x,
                            ) ?? null,
                        )
                      }
                    />{' '}
                    <span className="muted small">
                      {o.parts
                        .map(
                          (p) =>
                            `${p.dice}=${p.total}${p.type ? ` ${t(`damage.${p.type}` as MessageKey)}` : ''}`,
                        )
                        .join(' + ')}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={close}>
          {t('common.cancel')}
        </button>
        <button type="button" className="btn" disabled={!option || !targets.size} onClick={roll}>
          {outcomes ? t('attack.reroll') : t('attack.rollAttack')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!outcomes?.some((o) => o.apply)}
          onClick={apply}
        >
          {t('assist.apply')}
        </button>
      </div>
    </Modal>
  );
}
