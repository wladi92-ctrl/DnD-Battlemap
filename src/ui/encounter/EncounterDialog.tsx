/**
 * Begegnungsplaner: Gruppe (aus den Spielercharakteren oder von Hand), Monstergruppen aus SRD
 * und eigenen Kreaturen, XP-Budget und Schwierigkeit (DMG-Werte, gekennzeichnet), alles auf
 * die Karte setzen, Zusammenfassung als Markdown/PDF, in der Kampagne speichern.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { DIFFICULTIES } from '../../core/encounter';
import { markdownToPdf } from '../../core/textPdf';
import { formatCr, loadCreatures, type Creature } from '../../data/srd/creatures';
import {
  ENCOUNTER_GROUPS_MAX,
  encounterMarkdown,
  rateEncounter,
  spawnEncounter,
  type Encounter,
} from '../../editor/encounter';
import type { MessageKey } from '../../i18n';
import { getFileAccess } from '../../storage/fileAccess';
import { dataUrlToBytes } from '../../storage/library';
import { TEAMS, type Team } from '../../storage/mapDocument';
import { Modal } from '../Modal';
import { teamLabel, typeLabel } from '../creatures/labels';
import { useCampaignStore } from '../state/campaignStore';
import { useEditorStore } from '../state/editorStore';
import { useEncounterStore } from '../state/encounterStore';
import { useLibraryStore } from '../state/libraryStore';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useViewStore } from '../state/viewStore';
import { useT } from '../useT';

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'begegnung';
}

export function EncounterDialog() {
  const open = useEncounterStore((s) => s.open);
  if (!open) return null;
  return <EncounterEditor />;
}

function EncounterEditor() {
  const t = useT();
  const id = useId();
  const draft = useEncounterStore((s) => s.draft);
  const update = useEncounterStore.getState().update;
  const pcs = useLibraryStore((s) => s.pcs);
  const homebrew = useLibraryStore((s) => s.homebrew);
  const portraits = useLibraryStore((s) => s.portraits);
  const campaign = useCampaignStore((s) => s.campaign);
  const [srd, setSrd] = useState<Creature[]>([]);
  const [query, setQuery] = useState('');
  const [memberName, setMemberName] = useState('');
  const [memberLevel, setMemberLevel] = useState('1');

  useEffect(() => {
    void useLibraryStore.getState().load();
    let alive = true;
    void loadCreatures().then((c) => alive && setSrd(c));
    return () => {
      alive = false;
    };
  }, []);

  const creatures = useMemo(
    () => new Map<string, Creature>([...srd, ...homebrew].map((c) => [c.id, c])),
    [srd, homebrew],
  );
  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('de');
    if (!q) return [];
    return [...creatures.values()]
      .filter((c) => c.name.toLocaleLowerCase('de').includes(q))
      .slice(0, 8);
  }, [query, creatures]);
  const rating = rateEncounter(draft, creatures);
  const notice = useNoticeStore.getState().push;

  const set = (patch: Partial<Encounter>) => update((e) => ({ ...e, ...patch }));
  const addGroup = (c: Creature) =>
    update((e) => {
      const hit = e.groups.find((g) => g.source === c.id && g.team === 'enemy');
      if (hit)
        return {
          ...e,
          groups: e.groups.map((g) => (g === hit ? { ...g, count: g.count + 1 } : g)),
        };
      if (e.groups.length >= ENCOUNTER_GROUPS_MAX) return e;
      return {
        ...e,
        groups: [...e.groups, { source: c.id, name: c.name, count: 1, team: 'enemy' as Team }],
      };
    });

  const place = () => {
    const map = useMapStore.getState();
    const doc = map.doc;
    if (!doc) return notice('error', t('encounter.noMap'));
    const view = useViewStore.getState();
    const at = view.cursorCell ?? {
      x: Math.floor(doc.grid.cols / 2),
      y: Math.floor(doc.grid.rows / 2),
    };
    // Eigene Bilder (Bibliothek) einbetten
    const embedded = new Map<string, string>();
    const image = (source: string) => {
      const c = creatures.get(source);
      const url = c && 'homebrew' in c ? (c as { image?: string }).image : portraits[source];
      if (!url) return undefined;
      const known = embedded.get(source);
      if (known) return known;
      const img = dataUrlToBytes(url);
      if (!img) return undefined;
      const path = `tokens/${crypto.randomUUID()}.${img.ext}`;
      map.addAsset(path, img.bytes);
      embedded.set(source, path);
      return path;
    };
    const r = spawnEncounter(doc, draft, creatures, at, image);
    const reason = map.run(r.result, 'action.encounterPlace');
    if (reason)
      return notice('error', t(reason === 'locked' ? 'notice.layerLocked' : 'encounter.noSpace'));
    useEditorStore.getState().setSelection(r.ids);
    notice('info', t('encounter.placed', { count: r.ids.length }));
    useEncounterStore.getState().close();
  };

  const exportMd = async () => {
    const md = encounterMarkdown(draft, creatures, t);
    const saved = await getFileAccess().exportText(
      md,
      `${safeName(draft.name)}.md`,
      t('log.filterName'),
      'md',
    );
    if (saved) notice('info', t('export.done', { file: saved }));
  };
  const exportPdf = async () => {
    const pdf = markdownToPdf(encounterMarkdown(draft, creatures, t), draft.name);
    const saved = await getFileAccess().exportBytes(
      pdf,
      `${safeName(draft.name)}.pdf`,
      t('export.filterPdf'),
      'pdf',
      'application/pdf',
    );
    if (saved) notice('info', t('export.done', { file: saved }));
  };

  return (
    <Modal title={t('encounter.heading')} onClose={() => useEncounterStore.getState().close()} wide>
      <div className="encounter">
        <div className="field">
          <label htmlFor={`${id}-name`}>{t('encounter.name')}</label>
          <input
            id={`${id}-name`}
            value={draft.name}
            maxLength={120}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>

        <fieldset className="panel-fieldset">
          <legend>{t('encounter.party')}</legend>
          {pcs.length > 0 && (
            <div className="encounter-pcs">
              {pcs.map((pc) => {
                const inParty = draft.party.some((m) => m.name === pc.name);
                return (
                  <label key={pc.id} className="panel-check">
                    <input
                      type="checkbox"
                      checked={inParty}
                      onChange={(e) =>
                        set({
                          party: e.target.checked
                            ? [...draft.party, { name: pc.name, level: pc.level }]
                            : draft.party.filter((m) => m.name !== pc.name),
                        })
                      }
                    />
                    {pc.name} ({t('encounter.levelN', { level: pc.level })})
                  </label>
                );
              })}
            </div>
          )}
          <ul className="encounter-list">
            {draft.party.map((m, i) => (
              <li key={`${m.name}-${i}`}>
                <span>{m.name}</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  aria-label={t('encounter.levelOf', { name: m.name })}
                  value={m.level}
                  onChange={(e) =>
                    set({
                      party: draft.party.map((x, j) =>
                        j === i
                          ? { ...x, level: Math.min(20, Math.max(1, Number(e.target.value) || 1)) }
                          : x,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="btn btn-small"
                  aria-label={t('encounter.remove', { name: m.name })}
                  onClick={() => set({ party: draft.party.filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="field-inline">
            <input
              aria-label={t('encounter.memberName')}
              placeholder={t('encounter.memberName')}
              value={memberName}
              maxLength={60}
              onChange={(e) => setMemberName(e.target.value)}
            />
            <input
              type="number"
              min={1}
              max={20}
              aria-label={t('encounter.memberLevel')}
              value={memberLevel}
              onChange={(e) => setMemberLevel(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              onClick={() => {
                const name =
                  memberName.trim() || t('encounter.memberDefault', { n: draft.party.length + 1 });
                const level = Math.min(20, Math.max(1, Number(memberLevel) || 1));
                set({ party: [...draft.party, { name, level }] });
                setMemberName('');
              }}
            >
              {t('encounter.addMember')}
            </button>
          </div>
        </fieldset>

        <fieldset className="panel-fieldset">
          <legend>{t('encounter.monsters')}</legend>
          <input
            type="search"
            aria-label={t('encounter.search')}
            placeholder={t('encounter.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {results.length > 0 && (
            <ul className="encounter-results">
              {results.map((c) => (
                <li key={c.id}>
                  <button type="button" className="btn btn-small" onClick={() => addGroup(c)}>
                    + {c.name}
                  </button>
                  <span className="muted small">
                    {t('creatures.crValue', { cr: formatCr(c.cr) })} · {c.xp} XP ·{' '}
                    {typeLabel(t, c.type)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <ul className="encounter-list">
            {draft.groups.map((g, i) => {
              const c = creatures.get(g.source);
              return (
                <li key={`${g.source}-${i}`}>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    aria-label={t('encounter.countOf', { name: g.name })}
                    value={g.count}
                    onChange={(e) =>
                      set({
                        groups: draft.groups.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                count: Math.min(50, Math.max(1, Number(e.target.value) || 1)),
                              }
                            : x,
                        ),
                      })
                    }
                  />
                  <span>
                    {g.name}
                    {c && (
                      <span className="muted small">
                        {' '}
                        · {t('creatures.crValue', { cr: formatCr(c.cr) })} · {c.xp * g.count} XP
                      </span>
                    )}
                  </span>
                  <select
                    aria-label={t('encounter.sideOf', { name: g.name })}
                    value={g.team}
                    onChange={(e) =>
                      set({
                        groups: draft.groups.map((x, j) =>
                          j === i ? { ...x, team: e.target.value as Team } : x,
                        ),
                      })
                    }
                  >
                    {TEAMS.map((tm) => (
                      <option key={tm} value={tm}>
                        {teamLabel(t, tm)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-small"
                    aria-label={t('encounter.remove', { name: g.name })}
                    onClick={() => set({ groups: draft.groups.filter((_, j) => j !== i) })}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <section className={`encounter-rating difficulty-${rating.difficulty}`} aria-live="polite">
          <p>
            <strong>
              {t('encounter.difficulty')}: {t(`difficulty.${rating.difficulty}` as MessageKey)}
            </strong>
          </p>
          <p className="small">
            {t('encounter.summary', {
              total: rating.totalXp,
              adjusted: rating.adjustedXp,
              multiplier: rating.multiplier,
              per: rating.xpPerCharacter,
            })}
          </p>
          <p className="small">
            {DIFFICULTIES.map(
              (d) => `${t(`difficulty.${d}` as MessageKey)} ${rating.thresholds[d]}`,
            ).join(' · ')}
          </p>
          <p className="small muted">{t('encounter.dmgNote')}</p>
        </section>

        <div className="field">
          <label htmlFor={`${id}-notes`}>{t('encounter.notes')}</label>
          <textarea
            id={`${id}-notes`}
            rows={3}
            maxLength={5000}
            value={draft.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => void exportMd()}>
            {t('encounter.exportMd')}
          </button>
          <button type="button" className="btn" onClick={() => void exportPdf()}>
            {t('encounter.exportPdf')}
          </button>
          {campaign && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                useCampaignStore.getState().saveEncounter(draft);
                notice('info', t('encounter.saved', { name: draft.name }));
              }}
            >
              {t('encounter.saveToCampaign')}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!draft.groups.length}
            onClick={place}
          >
            {t('encounter.place')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
