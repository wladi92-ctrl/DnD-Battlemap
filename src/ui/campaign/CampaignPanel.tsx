/**
 * Reiter „Kampagne“: Kampagne beginnen/öffnen; Szenen (wechseln, umbenennen, sortieren,
 * entfernen, neu, Karte importieren), Verknüpfungen der aktiven Szene, Notizen, Begegnungen
 * und Handouts (in der Spieleransicht zeigen).
 */
import { useId, useState } from 'react';
import { newEncounter } from '../../editor/encounter';
import { getFileAccess } from '../../storage/fileAccess';
import { looksLikeImage, extensionOf } from '../../storage/assets';
import { decodeProject } from '../../storage/projectFile';
import { activeLinks, useCampaignStore } from '../state/campaignStore';
import { useEncounterStore } from '../state/encounterStore';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useViewStore } from '../state/viewStore';
import { useT } from '../useT';
import { reportError, useFileActions } from '../map/useFileActions';

const HANDOUT_IMAGE_MAX = 20 * 1024 * 1024;

export function CampaignPanel() {
  const campaign = useCampaignStore((s) => s.campaign);
  return campaign ? <CampaignEditor /> : <CampaignStart />;
}

function CampaignStart() {
  const t = useT();
  const id = useId();
  const hasMap = useMapStore((s) => s.doc !== null);
  const [name, setName] = useState('');
  const { openMap } = useFileActions();
  return (
    <div className="campaign-panel">
      <p className="small muted">{t('campaign.intro')}</p>
      <div className="field">
        <label htmlFor={`${id}-name`}>{t('campaign.name')}</label>
        <input
          id={`${id}-name`}
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => useCampaignStore.getState().start(name.trim() || t('campaign.defaultName'))}
      >
        {t('campaign.start')}
      </button>
      <p className="small muted">{hasMap ? t('campaign.startHintMap') : t('campaign.startHint')}</p>
      <button type="button" className="btn" onClick={() => void openMap()}>
        {t('campaign.open')}
      </button>
    </div>
  );
}

function CampaignEditor() {
  const t = useT();
  const id = useId();
  const c = useCampaignStore((s) => s.campaign);
  const shown = useCampaignStore((s) => s.shownHandout);
  const currentName = useMapStore((s) => s.doc?.name);
  const store = useCampaignStore.getState();
  const notice = useNoticeStore.getState().push;
  const [linkTarget, setLinkTarget] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [notes, setNotes] = useState(c?.notes ?? '');
  const [hTitle, setHTitle] = useState('');
  const [hText, setHText] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  if (!c) return null;
  const names = new Map(
    c.scenes.map((s) => [s.id, s.id === c.current ? (currentName ?? s.name) : s.name]),
  );
  const links = activeLinks(c);
  const others = c.scenes.filter((s) => s.id !== c.current);
  const target = linkTarget && others.some((s) => s.id === linkTarget) ? linkTarget : others[0]?.id;

  const go = (sceneId: string) => {
    // Name nach dem Wechsel aus der geladenen Karte (auch für eben angelegte Szenen).
    if (store.switchScene(sceneId))
      notice('info', t('campaign.switched', { name: useMapStore.getState().doc?.name ?? '' }));
  };

  const importMap = async () => {
    try {
      const file = await getFileAccess().openProject(
        t('campaign.importMap'),
        t('file.filterName'),
        ['dndmap'],
      );
      if (!file) return;
      const { doc, assets } = decodeProject(file.bytes);
      if (store.addSceneFromMap(doc, assets))
        notice('info', t('campaign.sceneAdded', { name: doc.name }));
    } catch (e) {
      reportError(t, e);
    }
  };

  const addLink = () => {
    const view = useViewStore.getState();
    const cell = view.cursorCell;
    if (!cell) return notice('error', t('campaign.linkNeedsCell'));
    if (!target) return;
    if (store.addLink({ x: cell.x, y: cell.y, target, label: linkLabel.trim() }))
      notice('info', t('campaign.linkAdded', { name: names.get(target) ?? '' }));
    setLinkLabel('');
  };

  const addHandout = async (withImage: boolean) => {
    let image: { name: string; bytes: Uint8Array } | undefined;
    if (withImage) {
      const file = await getFileAccess().openFile(
        t('campaign.handoutImage'),
        t('import.filterName'),
        ['png', 'jpg', 'jpeg', 'webp'],
      );
      if (!file) return;
      const ext = extensionOf(file.name);
      if (file.bytes.length > HANDOUT_IMAGE_MAX || !looksLikeImage(file.bytes, ext))
        return notice('error', t('campaign.handoutBadImage'));
      image = { name: file.name, bytes: file.bytes };
    }
    const title = hTitle.trim() || (image ? image.name : t('campaign.handoutDefault'));
    if (store.addHandout({ title, text: hText }, image)) {
      setHTitle('');
      setHText('');
    }
  };

  return (
    <div className="campaign-panel">
      <h3>{c.name}</h3>

      <section aria-labelledby={`${id}-scenes`}>
        <h4 id={`${id}-scenes`}>{t('campaign.scenes', { count: c.scenes.length })}</h4>
        <ul className="campaign-list">
          {c.scenes.map((s, i) => {
            const active = s.id === c.current;
            const name = names.get(s.id) ?? s.name;
            return (
              <li key={s.id} className={active ? 'active' : undefined}>
                {renaming?.id === s.id ? (
                  <input
                    aria-label={t('campaign.renameScene')}
                    value={renaming.name}
                    maxLength={120}
                    autoFocus
                    onChange={(e) => setRenaming({ id: s.id, name: e.target.value })}
                    onBlur={() => {
                      store.renameScene(s.id, renaming.name);
                      setRenaming(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="link-button"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => !active && go(s.id)}
                    title={active ? t('campaign.activeScene') : t('campaign.switchTo', { name })}
                  >
                    {active ? '▶ ' : ''}
                    {name}
                  </button>
                )}
                <span className="campaign-list-actions">
                  <button
                    type="button"
                    className="btn btn-small"
                    aria-label={t('campaign.renameSceneOf', { name })}
                    onClick={() => setRenaming({ id: s.id, name })}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    aria-label={t('campaign.moveUp', { name })}
                    disabled={i === 0}
                    onClick={() => store.moveScene(s.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    aria-label={t('campaign.moveDown', { name })}
                    disabled={i === c.scenes.length - 1}
                    onClick={() => store.moveScene(s.id, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    aria-label={t('campaign.removeScene', { name })}
                    disabled={active}
                    onClick={async () => {
                      const ok = await getFileAccess().confirm(
                        t('campaign.removeSceneConfirm', { name }),
                        t('confirm.title'),
                        t('campaign.remove'),
                        t('common.cancel'),
                      );
                      if (ok) store.removeScene(s.id);
                    }}
                  >
                    ×
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="button-grid">
          <button
            type="button"
            className="btn"
            onClick={() => {
              const sid = store.addScene({
                name: t('campaign.sceneN', { n: c.scenes.length + 1 }),
                cols: 30,
                rows: 20,
              });
              if (sid) go(sid);
            }}
          >
            {t('campaign.newScene')}
          </button>
          <button type="button" className="btn" onClick={() => void importMap()}>
            {t('campaign.importMap')}
          </button>
        </div>
      </section>

      <section aria-labelledby={`${id}-links`}>
        <h4 id={`${id}-links`}>{t('campaign.links')}</h4>
        {links.length ? (
          <ul className="campaign-list">
            {links.map((l) => (
              <li key={l.id}>
                <span>
                  ({l.x + 1}, {l.y + 1}) → {names.get(l.target)}
                  {l.label ? ` – ${l.label}` : ''}
                </span>
                <span className="campaign-list-actions">
                  <button type="button" className="btn btn-small" onClick={() => go(l.target)}>
                    {t('campaign.follow')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    aria-label={t('campaign.removeLink')}
                    onClick={() => store.removeLink(l.id)}
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">{t('campaign.noLinks')}</p>
        )}
        {others.length > 0 ? (
          <>
            <div className="field">
              <label htmlFor={`${id}-target`}>{t('campaign.linkTarget')}</label>
              <select
                id={`${id}-target`}
                value={target}
                onChange={(e) => setLinkTarget(e.target.value)}
              >
                {others.map((s) => (
                  <option key={s.id} value={s.id}>
                    {names.get(s.id)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-label`}>{t('campaign.linkLabel')}</label>
              <input
                id={`${id}-label`}
                value={linkLabel}
                maxLength={120}
                onChange={(e) => setLinkLabel(e.target.value)}
              />
            </div>
            <button type="button" className="btn" onClick={addLink}>
              {t('campaign.addLink')}
            </button>
            <p className="small muted">{t('campaign.linkHint')}</p>
          </>
        ) : (
          <p className="small muted">{t('campaign.linkNeedsScenes')}</p>
        )}
      </section>

      <section aria-labelledby={`${id}-notes-h`}>
        <h4 id={`${id}-notes-h`}>{t('campaign.notes')}</h4>
        <textarea
          aria-labelledby={`${id}-notes-h`}
          rows={5}
          value={notes}
          maxLength={50_000}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => store.setNotes(notes)}
        />
      </section>

      <section aria-labelledby={`${id}-enc`}>
        <h4 id={`${id}-enc`}>{t('campaign.encounters')}</h4>
        <ul className="campaign-list">
          {c.encounters.map((e) => (
            <li key={e.id}>
              <span>{e.name}</span>
              <span className="campaign-list-actions">
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => useEncounterStore.getState().show(structuredClone(e))}
                >
                  {t('campaign.openEncounter')}
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  aria-label={t('campaign.removeEncounter', { name: e.name })}
                  onClick={() => store.removeEncounter(e.id)}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn"
          onClick={() =>
            useEncounterStore.getState().show(newEncounter(t('encounter.defaultName')))
          }
        >
          {t('encounter.open')}
        </button>
      </section>

      <section aria-labelledby={`${id}-handouts`}>
        <h4 id={`${id}-handouts`}>{t('campaign.handouts')}</h4>
        <ul className="campaign-list">
          {c.handouts.map((h) => (
            <li key={h.id} className={shown === h.id ? 'active' : undefined}>
              <span>
                {h.title}
                {h.image ? ' 🖼' : ''}
              </span>
              <span className="campaign-list-actions">
                <button
                  type="button"
                  className="btn btn-small"
                  aria-pressed={shown === h.id}
                  onClick={() => store.showHandout(shown === h.id ? null : h.id)}
                >
                  {shown === h.id ? t('campaign.hideHandout') : t('campaign.showHandout')}
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  aria-label={t('campaign.removeHandout', { name: h.title })}
                  onClick={() => store.removeHandout(h.id)}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
        <div className="field">
          <label htmlFor={`${id}-ht`}>{t('campaign.handoutTitle')}</label>
          <input
            id={`${id}-ht`}
            value={hTitle}
            maxLength={120}
            onChange={(e) => setHTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-hx`}>{t('campaign.handoutText')}</label>
          <textarea
            id={`${id}-hx`}
            rows={3}
            value={hText}
            onChange={(e) => setHText(e.target.value)}
          />
        </div>
        <div className="button-grid">
          <button
            type="button"
            className="btn"
            disabled={!hTitle.trim() && !hText.trim()}
            onClick={() => void addHandout(false)}
          >
            {t('campaign.addTextHandout')}
          </button>
          <button type="button" className="btn" onClick={() => void addHandout(true)}>
            {t('campaign.addImageHandout')}
          </button>
        </div>
      </section>
    </div>
  );
}
