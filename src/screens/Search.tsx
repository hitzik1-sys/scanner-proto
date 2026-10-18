import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import DocCard from '../components/DocCard';
import { useSettings } from '../SettingsContext';
import { getToken, hasValidToken } from '../google/auth';
import { useGoogleUser } from '../google/useGoogleUser';
import { allTags, searchDocs, type Period } from '../lib/search';
import { syncLibrary, useLibrary } from '../library';

interface Props {
  onSettings: () => void;
}

const PERIODS: Period[] = ['all', '30d', 'year', 'lastYear'];

/** חיפוש במסמכים: בשם, בתגיות ובטקסט שזוהה. רץ בטלפון, גם בלי אינטרנט */
export default function Search({ onSettings }: Props) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const user = useGoogleUser();
  const lib = useLibrary();
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [period, setPeriod] = useState<Period>('all');
  const [authError, setAuthError] = useState<string | null>(null);

  // אם כבר יש אישור גישה בתוקף, מסנכרנים בשקט. אחרת מחכים ללחיצה על "רענן"
  useEffect(() => {
    if (user && hasValidToken()) void syncLibrary(settings.driveFolder);
  }, [user, settings.driveFolder]);

  const refresh = async () => {
    setAuthError(null);
    try {
      await getToken();
      await syncLibrary(settings.driveFolder);
    } catch (e) {
      setAuthError((e as Error).message);
    }
  };

  const tagList = useMemo(() => allTags(lib.docs), [lib.docs]);
  const results = useMemo(() => searchDocs(lib.docs, query, { tags, period }), [lib.docs, query, tags, period]);

  const toggleTag = (tag: string) => setTags((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]));

  const lastSync = lib.lastSync
    ? new Date(lib.lastSync).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
    : null;

  return (
    <main className="page search">
      <input
        className="search-input"
        type="search"
        enterKeyHint="search"
        autoFocus
        value={query}
        placeholder={t('search.placeholder')}
        aria-label={t('search.placeholder')}
        onChange={(e) => setQuery(e.target.value)}
      />

      {tagList.length > 0 && (
        <div className="chips filter-chips">
          {tagList.map((tag) => (
            <button
              key={tag}
              className={tags.includes(tag) ? 'chip on' : 'chip'}
              aria-pressed={tags.includes(tag)}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="segmented periods" role="radiogroup" aria-label={t('search.period')}>
        {PERIODS.map((p) => (
          <button key={p} role="radio" aria-checked={period === p} className={period === p ? 'on' : ''} onClick={() => setPeriod(p)}>
            {t(`search.periods.${p}`)}
          </button>
        ))}
      </div>

      <div className="sync-bar">
        {!user ? (
          <span className="status">
            {t('search.signIn')}{' '}
            <button className="link" onClick={onSettings}>
              {t('search.toSettings')}
            </button>
          </span>
        ) : (
          <>
            <span className="status">
              {lib.syncing
                ? t('search.syncing')
                : lastSync
                  ? t('search.lastSync', { when: lastSync })
                  : t('search.neverSynced')}
              {lib.ocrLeft > 0 &&
                ` · ${lib.ocrRunning ? t('search.ocrRunning', { count: lib.ocrLeft }) : t('search.ocrWaiting', { count: lib.ocrLeft })}`}
            </span>
            <button className="small" onClick={() => void refresh()} disabled={lib.syncing}>
              {t('search.refresh')}
            </button>
          </>
        )}
      </div>
      {(authError || lib.error) && <p className="status error">{authError || lib.error}</p>}

      {lib.docs.length === 0 ? (
        <p className="hint empty">{user ? t('search.noDocs') : ''}</p>
      ) : (
        <>
          <p className="status">{t('search.count', { count: results.length })}</p>
          <ul className="doc-list">
            {results.map((r) => (
              <DocCard key={r.doc.id} doc={r.doc} snippet={r.snippet} advanced={settings.advanced} />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
