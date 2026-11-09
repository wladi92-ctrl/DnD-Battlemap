/**
 * Rettungswurf-Assistent: pro betroffenem Ziel Rettungswurf würfeln oder eintragen
 * (Vorteil/Nachteil), Schaden würfeln oder eintragen, voll/halb und Resistenzen automatisch,
 * dann in einem Undo-Schritt anwenden.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { averageOf, roll, rollD20, type Advantage } from '../../core/dice';
import { loadCreatures, type Creature } from '../../data/srd/creatures';
import { damageResponse, finalDamage, saveBonus, type DamageResponse } from '../../editor/effects';
import { damageToken, updateTokens } from '../../editor/tokens';
import type { MessageKey } from '../../i18n';
import { SAVE_ABILITIES, type SaveAbility } from '../../storage/mapDocument';
import { Modal } from '../Modal';
import { runOnTokens } from '../map/tokenTools';
import { useEditorStore, type AoeResult } from '../state/editorStore';
import { useLibraryStore } from '../state/libraryStore';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useT } from '../useT';

interface Row {
  id: string;
  include: boolean;
  bonus: number;
  adv: Advantage;
  /** Gesamtergebnis des Rettungswurfs als Text (leer = noch nicht gewürfelt). */
  result: string;
  response: DamageResponse;
}

export function SaveAssistant() {
  const result = useEditorStore((s) => s.assistant);
  if (!result) return null;
  return <Assistant key={result.tokenIds.join(',') + result.name} result={result} />;
}

const RESPONSES: readonly DamageResponse[] = ['normal', 'resistant', 'immune', 'vulnerable'];

function Assistant({ result }: { result: AoeResult }) {
  const t = useT();
  const id = useId();
  const doc = useMapStore((s) => s.doc);
  const homebrew = useLibraryStore((s) => s.homebrew);
  const [srd, setSrd] = useState<Creature[] | null>(null);
  const tpl = result.template;
  const [ability, setAbility] = useState<SaveAbility>(tpl.save?.ability ?? 'dex');
  const [dc, setDc] = useState(String(tpl.save?.dc ?? 13));
  const [half, setHalf] = useState(tpl.save?.half ?? true);
  const [useSave, setUseSave] = useState(Boolean(tpl.save));
  const [dice, setDice] = useState(tpl.damage ?? '');
  const [damage, setDamage] = useState(() =>
    String(tpl.damage ? (averageOf(tpl.damage) ?? '') : ''),
  );
  const [rows, setRows] = useState<Row[]>([]);
  const close = () => useEditorStore.getState().openAssistant(null);

  useEffect(() => {
    let alive = true;
    void loadCreatures().then((l) => alive && setSrd(l));
    return () => {
      alive = false;
    };
  }, []);

  const tokens = useMemo(
    () =>
      doc
        ? result.tokenIds
            .map((tid) => doc.tokens.find((x) => x.id === tid))
            .filter((x) => x !== undefined)
        : [],
    [doc, result.tokenIds],
  );
  const creatureOf = useMemo(() => {
    const map = new Map<string, Creature>();
    for (const c of [...(srd ?? []), ...homebrew]) map.set(c.id, c);
    return (source?: string) => (source ? map.get(source) : undefined);
  }, [srd, homebrew]);

  // Zeilen anlegen, sobald die Statblöcke geladen sind (Bonus/Resistenzen daraus).
  useEffect(() => {
    if (!srd) return;
    setRows(
      tokens.map((tk) => {
        const c = tk.kind === 'creature' ? creatureOf(tk.source) : undefined;
        return {
          id: tk.id,
          include: true,
          bonus: saveBonus(c, ability),
          adv: 'normal',
          result: '',
          response: damageResponse(c, tpl.damageType),
        };
      }),
    );
    // Nur beim Laden bzw. Wechsel des Attributs neu berechnen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srd, ability]);

  const setRow = (rid: string, c: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === rid ? { ...r, ...c } : r)));
  const dcNum = Math.round(Number(dc));
  const total = Math.max(0, Math.round(Number(damage) || 0));

  const rollAll = () =>
    setRows((rs) =>
      rs.map((r) => (r.include ? { ...r, result: String(rollD20(r.bonus, r.adv).total) } : r)),
    );
  const rollDamage = () => {
    const r = roll(dice);
    if (r) setDamage(String(r.total));
  };

  const outcome = (r: Row) => {
    const saved = useSave && r.result !== '' && Number(r.result) >= dcNum;
    return { saved, amount: finalDamage(total, saved, half, r.response) };
  };

  const apply = () => {
    if (!doc) return;
    const amounts = new Map(rows.filter((r) => r.include).map((r) => [r.id, outcome(r).amount]));
    const res = updateTokens(doc, new Set(amounts.keys()), (tk) =>
      damageToken(tk, amounts.get(tk.id) ?? 0),
    );
    runOnTokens(res, 'action.tokenHp', (key, params) =>
      useNoticeStore.getState().push('info', t(key, params)),
    );
    const summary = rows
      .filter((r) => r.include)
      .map((r) => `${tokens.find((x) => x.id === r.id)?.name ?? '?'} ${outcome(r).amount}`)
      .join(', ');
    useNoticeStore.getState().push('info', t('assist.applied', { name: result.name, summary }));
    close();
  };

  const pending = useSave && rows.some((r) => r.include && r.result === '');

  return (
    <Modal title={t('assist.heading', { name: result.name })} onClose={close} wide>
      <p className="small muted">
        {t('aoe.count', { cells: result.cells, targets: tokens.length })}
      </p>
      <div className="assist-settings">
        <label className="panel-check">
          <input type="checkbox" checked={useSave} onChange={(e) => setUseSave(e.target.checked)} />
          {t('effect.hasSave')}
        </label>
        {useSave && (
          <>
            <label htmlFor={`${id}-ab`}>{t('effect.saveAbility')}</label>
            <select
              id={`${id}-ab`}
              value={ability}
              onChange={(e) => setAbility(e.target.value as SaveAbility)}
            >
              {SAVE_ABILITIES.map((a) => (
                <option key={a} value={a}>
                  {t(`ability.${a}` as MessageKey)}
                </option>
              ))}
            </select>
            <label htmlFor={`${id}-dc`}>{t('effect.dc')}</label>
            <input
              id={`${id}-dc`}
              type="number"
              min={1}
              max={40}
              className="input-narrow"
              value={dc}
              onChange={(e) => setDc(e.target.value)}
            />
            <label className="panel-check">
              <input type="checkbox" checked={half} onChange={(e) => setHalf(e.target.checked)} />
              {t('effect.halfOnSave')}
            </label>
          </>
        )}
      </div>
      <div className="assist-settings">
        <label htmlFor={`${id}-dice`}>{t('effect.damageDice')}</label>
        <input
          id={`${id}-dice`}
          className="input-narrow"
          value={dice}
          onChange={(e) => setDice(e.target.value)}
          placeholder="8d6"
        />
        <button type="button" className="btn" disabled={!roll(dice, () => 1)} onClick={rollDamage}>
          {t('assist.rollDamage')}
        </button>
        <label htmlFor={`${id}-dmg`}>{t('assist.damageTotal')}</label>
        <input
          id={`${id}-dmg`}
          type="number"
          min={0}
          className="input-narrow"
          value={damage}
          onChange={(e) => setDamage(e.target.value)}
        />
        {tpl.damageType && (
          <span className="small">{t(`damage.${tpl.damageType}` as MessageKey)}</span>
        )}
      </div>
      {!srd ? (
        <p>{t('creatures.loading')}</p>
      ) : (
        <table className="assist-table">
          <thead>
            <tr>
              <th scope="col">{t('assist.target')}</th>
              {useSave && <th scope="col">{t('assist.bonus')}</th>}
              {useSave && <th scope="col">{t('assist.advantage')}</th>}
              {useSave && <th scope="col">{t('assist.result')}</th>}
              <th scope="col">{t('assist.response')}</th>
              <th scope="col">{t('assist.damage')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const tk = tokens.find((x) => x.id === r.id);
              const o = outcome(r);
              return (
                <tr key={r.id} className={r.include ? '' : 'muted'}>
                  <td>
                    <label className="panel-check">
                      <input
                        type="checkbox"
                        checked={r.include}
                        onChange={(e) => setRow(r.id, { include: e.target.checked })}
                      />
                      {tk?.name}
                    </label>
                  </td>
                  {useSave && (
                    <td>
                      <input
                        type="number"
                        className="input-narrow"
                        aria-label={t('assist.bonusOf', { name: tk?.name ?? '' })}
                        value={r.bonus}
                        onChange={(e) =>
                          setRow(r.id, { bonus: Math.round(Number(e.target.value) || 0) })
                        }
                      />
                    </td>
                  )}
                  {useSave && (
                    <td>
                      <select
                        aria-label={t('assist.advantageOf', { name: tk?.name ?? '' })}
                        value={r.adv}
                        onChange={(e) => setRow(r.id, { adv: e.target.value as Advantage })}
                      >
                        <option value="normal">{t('assist.adv.normal')}</option>
                        <option value="advantage">{t('assist.adv.advantage')}</option>
                        <option value="disadvantage">{t('assist.adv.disadvantage')}</option>
                      </select>
                    </td>
                  )}
                  {useSave && (
                    <td>
                      <input
                        type="number"
                        className="input-narrow"
                        aria-label={t('assist.resultOf', { name: tk?.name ?? '' })}
                        value={r.result}
                        onChange={(e) => setRow(r.id, { result: e.target.value })}
                      />{' '}
                      {r.result !== '' && (
                        <span className={o.saved ? 'save-ok' : 'save-fail'}>
                          {o.saved ? t('assist.success') : t('assist.failure')}
                        </span>
                      )}
                    </td>
                  )}
                  <td>
                    <select
                      aria-label={t('assist.responseOf', { name: tk?.name ?? '' })}
                      value={r.response}
                      onChange={(e) => setRow(r.id, { response: e.target.value as DamageResponse })}
                    >
                      {RESPONSES.map((x) => (
                        <option key={x} value={x}>
                          {t(`assist.resp.${x}` as MessageKey)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="assist-damage">{r.include ? o.amount : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="modal-actions">
        {useSave && (
          <button type="button" className="btn" onClick={rollAll}>
            {t('assist.rollSaves')}
          </button>
        )}
        <button type="button" className="btn" onClick={close}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !rows.some((r) => r.include)}
          onClick={apply}
        >
          {t('assist.apply')}
        </button>
      </div>
      {pending && <p className="small muted">{t('assist.pending')}</p>}
    </Modal>
  );
}
