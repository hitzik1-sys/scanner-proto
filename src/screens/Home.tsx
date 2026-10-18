import { useTranslation } from 'react-i18next';
import type { CvStatus } from '../App';
import FilePicker from '../components/FilePicker';

interface Props {
  cvStatus: CvStatus;
  onRetry: () => void;
  onCamera: () => void;
  onFiles: (files: Blob[]) => void;
}

export default function Home({ cvStatus, onRetry, onCamera, onFiles }: Props) {
  const { t } = useTranslation();
  return (
    <main className="page home">
      <p className="hint">{t('home.hint')}</p>
      <div className="buttons col">
        <button className="primary big" onClick={onCamera}>
          {t('home.scan')}
        </button>
        <FilePicker onFiles={onFiles}>{t('home.gallery')}</FilePicker>
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
      <p className="footer-link">
        <a href={`${import.meta.env.BASE_URL}prototype/`}>{t('home.prototype')}</a>
      </p>
    </main>
  );
}
