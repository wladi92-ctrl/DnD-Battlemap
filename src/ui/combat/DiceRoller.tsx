/**
 * Würfelroller: W4–W100 per Knopf, Ausdrücke wie „2d6+3“, W20 mit Vorteil/Nachteil,
 * Verlauf (Sitzung) und optional Eintrag ins Kampflog. Zufall kryptografisch (core/dice).
 */
import { useId, useState } from 'react';
import { create } from 'zustand';
import { parseDice, roll, rollD20, type Advantage } from '../../core/dice';
import { useEditorStore } from '../state/editorStore';
import { useMapStore } from '../state/mapStore';
import { useT } from '../useT';
import { log, tr } from './combatTools';

export interface DiceHistoryEntry {
  id: string;
  label: string;
  detail: string;
  total: number;
}

interface DiceState {
  history: DiceHistoryEntry[];
  add: (e: Omit<DiceHistoryEntry, 'id'>) => void;
  clear: () => void;
}

export const useDiceStore = create<DiceState>((set) => ({
  history: [],
  add: (e) =>
    set((s) => ({ history: [{ ...e, id: crypto.randomUUID() }, ...s.history].slice(0, 50) })),
  clear: () => set({ history: [] }),
}));

const QUICK = [4, 6, 8, 10, 12, 20, 100];

/** Würfelt einen Ausdruck bzw. W20 mit Vorteil/Nachteil; liefert den Verlaufseintrag oder null. */
export function rollForHistory(
  expr: string,
  mode: Advantage,
  toLog: boolean,
): DiceHistoryEntry | null {
  const parsed = parseDice(expr);
  if (!parsed) return null;
  let entry: Omit<DiceHistoryEntry, 'id'>;
  const singleD20 =
    parsed.terms.length === 1 && parsed.terms[0]?.count === 1 && parsed.terms[0].sides === 20;
  if (singleD20 && mode !== 'normal') {
    const r = rollD20(parsed.modifier, mode);
    entry = {
      label: `${parsed.text} (${tr(mode === 'advantage' ? 'dice.adv' : 'dice.dis')})`,
      detail: `[${r.rolls.join(', ')}] → ${r.natural}${parsed.modifier ? (parsed.modifier > 0 ? ` + ${parsed.modifier}` : ` − ${-parsed.modifier}`) : ''}`,
      total: r.total,
    };
  } else {
    const r = roll(parsed.text);
    if (!r) return null;
    entry = {
      label: parsed.text,
      detail:
        r.rolls.map((g) => `[${g.join(', ')}]`).join(' ') +
        (r.modifier ? ` ${r.modifier > 0 ? '+' : '−'} ${Math.abs(r.modifier)}` : ''),
      total: r.total,
    };
  }
  useDiceStore.getState().add(entry);
  if (toLog && useMapStore.getState().doc)
    log('roll', `${entry.label}: ${entry.detail} = ${entry.total}`);
  return { ...entry, id: '' };
}

export function DiceRoller() {
  const t = useT();
  const id = useId();
  const open = useEditorStore((s) => s.diceOpen);
  const history = useDiceStore((s) => s.history);
  const [expr, setExpr] = useState('1d20');
  const [mode, setMode] = useState<Advantage>('normal');
  const [toLog, setToLog] = useState(true);
  const [error, setError] = useState(false);
  if (!open) return null;

  const doRoll = (e: string) => {
    const r = rollForHistory(e, mode, toLog);
    setError(!r);
  };

  return (
    <section className="dice-roller" aria-labelledby={`${id}-h`}>
      <header>
        <h2 id={`${id}-h`}>{t('dice.heading')}</h2>
        <button
          type="button"
          className="btn btn-small"
          aria-label={t('common.close')}
          onClick={() => useEditorStore.getState().setDiceOpen(false)}
        >
          ×
        </button>
      </header>
      <div className="dice-quick" role="group" aria-label={t('dice.quick')}>
        {QUICK.map((d) => (
          <button key={d} type="button" className="btn btn-small" onClick={() => doRoll(`1d${d}`)}>
            {t('dice.die', { sides: d })}
          </button>
        ))}
      </div>
      <form
        className="field-inline"
        onSubmit={(e) => {
          e.preventDefault();
          doRoll(expr);
        }}
      >
        <input
          aria-label={t('dice.expression')}
          value={expr}
          maxLength={60}
          aria-invalid={error}
          onChange={(e) => {
            setExpr(e.target.value);
            setError(false);
          }}
        />
        <button type="submit" className="btn btn-primary">
          {t('dice.roll')}
        </button>
      </form>
      {error && <p className="small error-text">{t('effect.diceInvalid')}</p>}
      <fieldset className="panel-radios dice-mode">
        <legend className="sr-only">{t('dice.mode')}</legend>
        {(['normal', 'advantage', 'disadvantage'] as const).map((m) => (
          <label key={m}>
            <input
              type="radio"
              name={`${id}-mode`}
              checked={mode === m}
              onChange={() => setMode(m)}
            />
            {t(`assist.adv.${m}`)}
          </label>
        ))}
      </fieldset>
      <label className="panel-check small">
        <input type="checkbox" checked={toLog} onChange={(e) => setToLog(e.target.checked)} />
        {t('dice.toLog')}
      </label>
      <ol className="dice-history" aria-live="polite" aria-label={t('dice.history')}>
        {history.map((h) => (
          <li key={h.id}>
            <strong className="dice-total">{h.total}</strong> <span>{h.label}</span>{' '}
            <span className="muted small">{h.detail}</span>
          </li>
        ))}
      </ol>
      {history.length > 0 && (
        <button
          type="button"
          className="btn btn-small"
          onClick={() => useDiceStore.getState().clear()}
        >
          {t('dice.clearHistory')}
        </button>
      )}
    </section>
  );
}
