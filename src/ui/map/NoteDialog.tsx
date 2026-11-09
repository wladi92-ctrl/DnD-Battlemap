/** GM-Notiz an einem Feld anlegen, ändern oder löschen. */
import { useId, useState, type FormEvent } from 'react';
import { upsertNote } from '../../editor/ops';
import { NOTE_MAX } from '../../storage/mapDocument';
import { Modal } from '../Modal';
import { useEditorStore } from '../state/editorStore';
import { useMapStore } from '../state/mapStore';
import { useNoticeStore } from '../state/noticeStore';
import { useT } from '../useT';

export function NoteDialog() {
  const cell = useEditorStore((s) => s.noteCell);
  const doc = useMapStore((s) => s.doc);
  if (!cell || !doc) return null;
  const existing = doc.notes.find((n) => n.x === cell.x && n.y === cell.y);
  return (
    <NoteForm
      key={`${cell.x},${cell.y}`}
      x={cell.x}
      y={cell.y}
      initial={existing?.text ?? ''}
      exists={Boolean(existing)}
    />
  );
}

function NoteForm({
  x,
  y,
  initial,
  exists,
}: {
  x: number;
  y: number;
  initial: string;
  exists: boolean;
}) {
  const t = useT();
  const id = useId();
  const [text, setText] = useState(initial);
  const close = () => useEditorStore.getState().setNoteCell(null);

  const save = (value: string) => {
    const doc = useMapStore.getState().doc;
    if (!doc) return;
    const reason = useMapStore
      .getState()
      .run(
        upsertNote(doc, { x, y, text: value }),
        value.trim() ? 'action.note' : 'action.noteDelete',
      );
    if (reason === 'locked') useNoticeStore.getState().push('info', t('notice.layerLocked'));
    close();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save(text);
  };

  return (
    <Modal title={t('note.heading', { x: x + 1, y: y + 1 })} onClose={close}>
      <form onSubmit={submit}>
        <label htmlFor={`${id}-text`} className="small muted">
          {t('note.hint')}
        </label>
        <textarea
          id={`${id}-text`}
          rows={6}
          maxLength={NOTE_MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(text);
          }}
        />
        <div className="modal-actions">
          {exists && (
            <button type="button" className="btn" onClick={() => save('')}>
              {t('note.delete')}
            </button>
          )}
          <button type="button" className="btn" onClick={close}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary">
            {t('note.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
