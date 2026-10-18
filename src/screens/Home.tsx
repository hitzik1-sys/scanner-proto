import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CvStatus } from '../App';
import DocCard from '../components/DocCard';
import FilePicker from '../components/FilePicker';
import { useSettings } from '../SettingsContext';
import { useLibrary } from '../library';
import { newestScannedFirst } from '../lib/search';

interface Props {
  cvStatus: CvStatus;
  onRetry: () => void;
  onCamera: () => void;
  onFiles: (files: Blob[]) => void;
  onSearch: () => void;
  onSettings: () => void;
  /** סריקה שעוד לא נשלחה: כמה עמודים יש בה, או 0 */
  pendingPages: number;
  onContinue: () => void;
  onDiscard: () => void;
}

// כמה מסמכים נטענים בכל פעם שמגיעים לסוף הרשימה
const PAGE_SIZE = 10;

export default function Home({
  cvStatus,
  onRetry,
  onCamera,
  onFiles,
  onSearch,
  onSettings,
  pendingPages,
  onContinue,
  onDiscard,
}: Props) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const lib = useLibrary();
  const docs = useMemo(() => newestScannedFirst(lib.docs), [lib.docs]);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = visible < docs.length;

  // כשהסוף של הרשימה נכנס למסך, טוענים עוד מסמכים
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible((v) => v + PAGE_SIZE);
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, visible]);

  return (
    <main className="page home">
      {pendingPages > 0 && (
        <section className="card continue-box">
          <p>{t('home.pending', { count: pendingPages })}</p>
          <div className="buttons">
            <button className="primary" onClick={onContinue}>
              {t('home.continue')}
            </button>
            <button
              onClick={() => {
                if (confirm(t('review.confirmDiscard'))) onDiscard();
              }}
            >
              {t('review.discard')}
            </button>
          </div>
        </section>
      )}

      <p className="hint">{t('home.hint')}</p>
      <div className="buttons col">
        <button className="primary big" onClick={onCamera}>
          {t('home.scan')}
        </button>
        <FilePicker onFiles={onFiles}>{t('home.gallery')}</FilePicker>
        <button onClick={onSearch}>{t('home.search')}</button>
      </div>
      {cvStatus === 'loading' && <p className="status">{t('home.loading')}</p>}
      {cvStatus === 'failed' && (
        <p className="status error">
          {t('home.loadFailed')}{' '}
          <button className="link" onClick={onRetry}>
            {t('home.retry')}
          </button>
        </p>
      )}

      {docs.length > 0 && (
        <section>
          <h3 className="section-title">{t('home.myDocs', { count: docs.length })}</h3>
          <ul className="doc-list">
            {docs.slice(0, visible).map((d) => (
              <DocCard key={d.id} doc={d} advanced={settings.advanced} onSettings={onSettings} />
            ))}
          </ul>
          {hasMore && (
            <div ref={sentinel} className="load-more">
              <button onClick={() => setVisible((v) => v + PAGE_SIZE)}>{t('home.more')}</button>
            </div>
          )}
        </section>
      )}

      <p className="footer-link">
        <a href={`${import.meta.env.BASE_URL}prototype/`}>{t('home.prototype')}</a>
      </p>
    </main>
  );
}
