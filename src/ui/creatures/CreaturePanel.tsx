/** Kreaturen: SRD-5.1-Liste plus eigene Kreaturen, Filter, Statblock, auf die Karte setzen. */
import { useEffect, useId, useMemo, useState } from 'react';
import { formatCr, loadCreatures, SIZE_CATEGORIES, type Creature } from '../../data/srd/creatures';
import { templateFromCreature } from '../../editor/tokens';
import { getFileAccess } from '../../storage/fileAccess';
import type { HomebrewCreature } from '../../storage/library';
import { TEAMS, type Team } from '../../storage/mapDocument';
import { setTool } from '../map/editorTools';
import { useEditorStore } from '../state/editorStore';
import { useLibraryStore } from '../state/libraryStore';
import { useNoticeStore } from '../state/noticeStore';
import { useT } from '../useT';
import { HomebrewDialog } from './HomebrewDialog';
import { CREATURE_TYPES, sizeLabel, teamLabel, typeKey, typeLabel } from './labels';

const CR_VALUES = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];

/** Gemeinsame Bedienelemente: Anzahl, Seite, Setzen. */
export function PlaceControls({
  onPlace,
  defaultTeam,
  allowCount = true,
}: {
  onPlace: (count: number, team: Team) => void;
  defaultTeam: Team;
  allowCount?: boolean;
}) {
  const t = useT();
  const id = useId();
  // Als Text, damit das Feld geleert und neu getippt werden kann; begrenzt wird beim Setzen.
  const [count, setCount] = useState('1');
  const amount = Math.max(1, Math.min(50, Math.round(Number(count) || 1)));
  const [team, setTeam] = useState<Team>(defaultTeam);
  return (
    <div className="place-controls">
      {allowCount && (
        <label htmlFor={`${id}-n`}>
          {t('creatures.amount')}
          <input
            id={`${id}-n`}
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            onBlur={() => setCount(String(amount))}
          />
        </label>
      )}
      <label htmlFor={`${id}-team`}>
        {t('creatures.team')}
        <select id={`${id}-team`} value={team} onChange={(e) => setTeam(e.target.value as Team)}>
          {TEAMS.map((tm) => (
            <option key={tm} value={tm}>
              {teamLabel(t, tm)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => onPlace(allowCount ? amount : 1, team)}
      >
        {t('creatures.place')}
      </button>
    </div>
  );
}

export function CreaturePanel() {
  const t = useT();
  const id = useId();
  const [srd, setSrd] = useState<Creature[] | null>(null);
  const homebrew = useLibraryStore((s) => s.homebrew);
  const libStatus = useLibraryStore((s) => s.status);
  const libError = useLibraryStore((s) => s.error);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [size, setSize] = useState('');
  const [crMin, setCrMin] = useState(0);
  const [crMax, setCrMax] = useState(30);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<HomebrewCreature | 'new' | null>(null);

  useEffect(() => {
    let alive = true;
    void loadCreatures().then((list) => alive && setSrd(list));
    void useLibraryStore.getState().load();
    return () => {
      alive = false;
    };
  }, []);

  const all = useMemo<Creature[]>(() => [...homebrew, ...(srd ?? [])], [homebrew, srd]);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('de');
    return all.filter(
      (c) =>
        (!type || typeKey(c.type) === type) &&
        (!size || c.size === size) &&
        c.cr >= crMin &&
        c.cr <= crMax &&
        (!q ||
          c.name.toLocaleLowerCase('de').includes(q) ||
          typeLabel(t, c.type).toLocaleLowerCase('de').includes(q)),
    );
  }, [all, query, type, size, crMin, crMax, t]);
  const current = all.find((c) => c.id === selected) ?? null;
  const isHomebrew = (c: Creature): c is HomebrewCreature => 'homebrew' in c;

  const place = (c: Creature, count: number, team: Team) => {
    const image = isHomebrew(c) ? c.image : undefined;
    useEditorStore.getState().setSpawn({
      template: templateFromCreature(c, team),
      count,
      ...(image ? { imageData: image } : {}),
    });
    setTool('select');
  };

  const remove = async (c: HomebrewCreature) => {
    const ok = await getFileAccess().confirm(
      t('creatures.deleteConfirm', { name: c.name }),
      t('confirm.title'),
      t('creatures.delete'),
      t('common.cancel'),
    );
    if (!ok) return;
    try {
      await useLibraryStore.getState().removeHomebrew(c.id);
      setSelected(null);
    } catch (e) {
      useNoticeStore.getState().push('error', t('creatures.saveError', { error: String(e) }));
    }
  };

  const crOptions = (value: number, onChange: (v: number) => void, label: string) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {CR_VALUES.map((v) => (
        <option key={v} value={v}>
          {formatCr(v)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="creature-panel">
      <input
        type="search"
        aria-label={t('creatures.search')}
        placeholder={t('creatures.search')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="filter-grid">
        <select
          aria-label={t('creatures.type')}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">{t('creatures.allTypes')}</option>
          {CREATURE_TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {typeLabel(t, ty)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('creatures.size')}
          value={size}
          onChange={(e) => setSize(e.target.value)}
        >
          <option value="">{t('creatures.allSizes')}</option>
          {SIZE_CATEGORIES.map((s) => (
            <option key={s} value={s}>
              {sizeLabel(t, s)}
            </option>
          ))}
        </select>
        <span className="filter-cr">
          {t('creatures.cr')}
          {crOptions(
            crMin,
            (v) => {
              setCrMin(v);
              if (v > crMax) setCrMax(v);
            },
            t('creatures.crMin'),
          )}
          –
          {crOptions(
            crMax,
            (v) => {
              setCrMax(v);
              if (v < crMin) setCrMin(v);
            },
            t('creatures.crMax'),
          )}
        </span>
        <select aria-label={t('creatures.environment')} disabled title={t('creatures.envNotInSrd')}>
          <option>
            {t('creatures.environment')}: {t('creatures.envNotInSrd')}
          </option>
        </select>
      </div>
      <p className="muted small" aria-live="polite">
        {srd ? t('creatures.count', { count: filtered.length }) : t('creatures.loading')}
      </p>
      {libStatus === 'error' && (
        <p className="small error-text" role="alert">
          {t('creatures.libraryError', { error: libError ?? '' })}
        </p>
      )}
      <ul
        className="creature-list"
        role="listbox"
        id={`${id}-list`}
        aria-label={t('side.creatures')}
      >
        {filtered.map((c) => (
          <li
            key={c.id}
            role="option"
            aria-selected={c.id === selected}
            tabIndex={c.id === (selected ?? filtered[0]?.id) ? 0 : -1}
            className={c.id === selected ? 'creature-item selected' : 'creature-item'}
            onClick={() => setSelected(c.id)}
            onDoubleClick={() => useEditorStore.getState().showStatblock(c)}
            onKeyDown={(e) => {
              const items = [
                ...(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('li') ?? []),
              ];
              const i = items.indexOf(e.currentTarget);
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const next = items[i + (e.key === 'ArrowDown' ? 1 : -1)];
                next?.focus();
                next?.click();
              } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSelected(c.id);
              }
            }}
          >
            <span className="creature-name">
              {c.name}
              {isHomebrew(c) && <span className="badge">{t('creatures.homebrew')}</span>}
            </span>
            <span className="muted small">
              {t('creatures.crValue', { cr: formatCr(c.cr) })} · {typeLabel(t, c.type)} ·{' '}
              {sizeLabel(t, c.size)}
            </span>
          </li>
        ))}
      </ul>
      {current && (
        <div className="creature-actions" aria-label={current.name} role="group">
          <strong>{current.name}</strong>
          <div className="field-inline">
            <button
              type="button"
              className="btn"
              onClick={() => useEditorStore.getState().showStatblock(current)}
            >
              {t('creatures.statblock')}
            </button>
            {isHomebrew(current) && (
              <>
                <button type="button" className="btn" onClick={() => setEditing(current)}>
                  {t('creatures.edit')}
                </button>
                <button type="button" className="btn" onClick={() => void remove(current)}>
                  {t('creatures.delete')}
                </button>
              </>
            )}
          </div>
          <PlaceControls defaultTeam="enemy" onPlace={(n, team) => place(current, n, team)} />
        </div>
      )}
      <button type="button" className="btn library-import" onClick={() => setEditing('new')}>
        {t('creatures.newHomebrew')}
      </button>
      <p className="muted small">{t('creatures.sourceNote')}</p>
      {editing && (
        <HomebrewDialog
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(c) => {
            setEditing(null);
            setSelected(c.id);
          }}
        />
      )}
    </div>
  );
}
