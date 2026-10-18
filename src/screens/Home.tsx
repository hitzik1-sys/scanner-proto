import { useTranslation } from 'react-i18next';
import type { CvStatus } from '../App';
import DocCard from '../components/DocCard';
import FilePicker from '../components/FilePicker';
import { useLibrary } from '../library';
import { searchDocs } from '../lib/search';

interface Props {
  cvStatus: CvStatus;
  onRetry: () => void;
  onCamera: () => void;
  onFiles: (files: Blob[]) => void;
  onSearch: () => void;
}

const RECENT = 5;

export default function Home({ cvStatus, onRetry, onCamera, onFiles, onSearch }: Props) {
  const { t } = useTranslation();
  const lib = useLibrary();
  const recent = searchDocs(lib.docs, '', { tags: [], period: 'all' }).slice(0, RECENT);

  return (
    <main className="page home">
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

      {recent.length > 0 && (
        <section>
          <h3 className="section-title">{t('home.recent')}</h3>
          <ul className="doc-list">
            {recent.map((r) => (
              <DocCard key={r.doc.id} doc={r.doc} />
            ))}
          </ul>
        </section>
      )}

      <p className="footer-link">
        <a href={`${import.meta.env.BASE_URL}prototype/`}>{t('home.prototype')}</a>
      </p>
    </main>
  );
}
