import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import FilePicker from '../components/FilePicker';
import { pdfFileName } from '../lib/files';
import type { Page } from '../types';

interface Props {
  pages: Page[];
  title: string;
  onTitle: (title: string) => void;
  onEdit: (index: number) => void;
  onCreate: () => Promise<void>;
  onMoreCamera: () => void;
  onMoreFiles: (files: Blob[]) => void;
  onDiscard: () => void;
}

/** רשימת כל העמודים: עריכה חוזרת, הוספת עמודים, שם המסמך ויצירת PDF */
export default function Review({ pages, title, onTitle, onEdit, onCreate, onMoreCamera, onMoreFiles, onDiscard }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await onCreate();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="page review">
      <p className="status">{t('review.count', { count: pages.length })}</p>
      <p className="hint">{t('review.hint')}</p>
      <div className="thumbs">
        {pages.map((p, i) => (
          <button key={p.id} className="thumb" aria-label={t('review.editAria', { n: i + 1 })} onClick={() => onEdit(i)}>
            {p.thumb && <img src={p.thumb} alt="" />}
            <span>{i + 1}</span>
          </button>
        ))}
      </div>

      <label className="field">
        {t('review.title')}
        <input value={title} placeholder={t('review.titlePlaceholder')} onChange={(e) => onTitle(e.target.value)} />
      </label>
      <p className="status">
        {t('review.fileName')} <bdi dir="ltr">{pdfFileName(title)}</bdi>
      </p>

      {error && <p className="status error">{t('error.generic', { message: error })}</p>}

      <div className="buttons col">
        <button className="primary big" onClick={() => void create()} disabled={busy}>
          {busy ? t('review.creating') : t('review.create')}
        </button>
        <button onClick={onMoreCamera} disabled={busy}>
          {t('review.moreCamera')}
        </button>
        <FilePicker onFiles={onMoreFiles}>{t('review.moreGallery')}</FilePicker>
        <button
          className="danger-text"
          disabled={busy}
          onClick={() => {
            if (confirm(t('review.confirmDiscard'))) onDiscard();
          }}
        >
          {t('review.discard')}
        </button>
      </div>
    </main>
  );
}
