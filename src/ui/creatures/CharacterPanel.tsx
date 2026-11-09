/** Spielercharaktere der lokalen Bibliothek: anlegen, bearbeiten, löschen, auf die Karte setzen. */
import { useEffect, useState } from 'react';
import type { TokenTemplate } from '../../editor/tokens';
import { getFileAccess } from '../../storage/fileAccess';
import type { PlayerCharacter } from '../../storage/library';
import type { Team } from '../../storage/mapDocument';
import { setTool } from '../map/editorTools';
import { useEditorStore } from '../state/editorStore';
import { useLibraryStore } from '../state/libraryStore';
import { useNoticeStore } from '../state/noticeStore';
import { useT } from '../useT';
import { PlaceControls } from './CreaturePanel';
import { PcDialog } from './PcDialog';

export function pcTemplate(pc: PlayerCharacter, team: Team = 'player'): TokenTemplate {
  return {
    name: pc.name,
    kind: 'pc',
    source: pc.id,
    size: pc.size,
    team,
    hpMax: pc.hpMax,
    ac: pc.ac,
    speed: pc.speed,
    reach: 5,
    initiativeBonus: pc.initiativeBonus,
    passivePerception: pc.passivePerception,
    darkvision: pc.darkvision,
    pc: { className: pc.className, level: pc.level },
  };
}

export function CharacterPanel() {
  const t = useT();
  const pcs = useLibraryStore((s) => s.pcs);
  const status = useLibraryStore((s) => s.status);
  const error = useLibraryStore((s) => s.error);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlayerCharacter | 'new' | null>(null);

  useEffect(() => {
    void useLibraryStore.getState().load();
  }, []);

  const current = pcs.find((p) => p.id === selected) ?? null;

  const place = (pc: PlayerCharacter, team: Team) => {
    useEditorStore.getState().setSpawn({
      template: pcTemplate(pc, team),
      count: 1,
      ...(pc.image ? { imageData: pc.image } : {}),
    });
    setTool('select');
  };

  const remove = async (pc: PlayerCharacter) => {
    const ok = await getFileAccess().confirm(
      t('creatures.deleteConfirm', { name: pc.name }),
      t('confirm.title'),
      t('creatures.delete'),
      t('common.cancel'),
    );
    if (!ok) return;
    try {
      await useLibraryStore.getState().removePc(pc.id);
      setSelected(null);
    } catch (e) {
      useNoticeStore.getState().push('error', t('creatures.saveError', { error: String(e) }));
    }
  };

  return (
    <div className="creature-panel">
      {status === 'error' && (
        <p className="small error-text" role="alert">
          {t('creatures.libraryError', { error: error ?? '' })}
        </p>
      )}
      {status === 'ready' && !pcs.length && <p className="muted small">{t('pcs.empty')}</p>}
      <ul className="creature-list" role="listbox" aria-label={t('side.characters')}>
        {pcs.map((pc) => (
          <li
            key={pc.id}
            role="option"
            aria-selected={pc.id === selected}
            tabIndex={pc.id === (selected ?? pcs[0]?.id) ? 0 : -1}
            className={pc.id === selected ? 'creature-item selected' : 'creature-item'}
            onClick={() => setSelected(pc.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSelected(pc.id);
              }
            }}
          >
            <span className="creature-name">
              {pc.image && <img className="token-thumb small" src={pc.image} alt="" />}
              {pc.name}
            </span>
            <span className="muted small">
              {[pc.className, t('pcs.level', { level: pc.level })].filter(Boolean).join(' · ')} ·{' '}
              {t('token.stats', {
                ac: pc.ac,
                speed: pc.speed,
                init: pc.initiativeBonus,
                pp: pc.passivePerception,
              })}
            </span>
          </li>
        ))}
      </ul>
      {current && (
        <div className="creature-actions" role="group" aria-label={current.name}>
          <strong>{current.name}</strong>
          <div className="field-inline">
            <button type="button" className="btn" onClick={() => setEditing(current)}>
              {t('creatures.edit')}
            </button>
            <button type="button" className="btn" onClick={() => void remove(current)}>
              {t('creatures.delete')}
            </button>
          </div>
          <PlaceControls
            defaultTeam="player"
            allowCount={false}
            onPlace={(_n, team) => place(current, team)}
          />
        </div>
      )}
      <button type="button" className="btn library-import" onClick={() => setEditing('new')}>
        {t('pcs.new')}
      </button>
      {editing && (
        <PcDialog initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
