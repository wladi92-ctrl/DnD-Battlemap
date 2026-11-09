import { useEffect } from 'react';
import { useNoticeStore, type Notice } from './state/noticeStore';
import { useT } from './useT';

const INFO_TIMEOUT_MS = 4000;

export function Notices() {
  const t = useT();
  const notices = useNoticeStore((s) => s.notices);
  return (
    <section className="notices" aria-label={t('notice.region')} aria-live="polite">
      {notices.map((n) => (
        <NoticeItem key={n.id} notice={n} />
      ))}
    </section>
  );
}

function NoticeItem({ notice }: { notice: Notice }) {
  const t = useT();
  const dismiss = useNoticeStore((s) => s.dismiss);
  useEffect(() => {
    if (notice.kind !== 'info') return;
    const timer = setTimeout(() => dismiss(notice.id), INFO_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [notice, dismiss]);

  return (
    <div
      className={`notice notice-${notice.kind}`}
      role={notice.kind === 'error' ? 'alert' : 'status'}
    >
      <div>
        <p>{notice.text}</p>
        {notice.details.length > 0 && (
          <ul className="notice-details">
            {notice.details.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        className="notice-close"
        aria-label={t('common.close')}
        onClick={() => dismiss(notice.id)}
      >
        ×
      </button>
    </div>
  );
}
