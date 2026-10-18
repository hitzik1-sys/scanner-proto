import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import FilePicker from '../components/FilePicker';
import { parseLocalDate, pdfFileName } from '../lib/files';
import type { PdfQuality } from '../lib/settings';
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
  /** רמה מתקדמת: סידור עמודים, תאריך בשם הקובץ ואיכות */
  advanced: boolean;
  docDate: string;
  onDocDate: (date: string) => void;
  quality: PdfQuality;
  onQuality: (q: PdfQuality) => void;
  onMove: (from: number, to: number) => void;
}

const QUALITIES: PdfQuality[] = ['high', 'medium', 'low'];

/** רשימת כל העמודים: עריכה חוזרת, הוספת עמודים, שם המסמך ויצירת PDF */
export default function Review({
  pages,
  title,
  onTitle,
  onEdit,
  onCreate,
  onMoreCamera,
  onMoreFiles,
  onDiscard,
  advanced,
  docDate,
  onDocDate,
  quality,
  onQuality,
  onMove,
}: Props) {
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
          <div key={p.id} className="thumb-cell">
            <button className="thumb" aria-label={t('review.editAria', { n: i + 1 })} onClick={() => onEdit(i)}>
              {p.thumb && <img src={p.thumb} alt="" />}
              <span>{i + 1}</span>
            </button>
            {advanced && pages.length > 1 && (
              <div className="move">
                {/* בעברית העמוד הראשון מימין, ולכן "קודם" הוא חץ ימינה */}
                <button
                  onClick={() => onMove(i, i - 1)}
                  disabled={i === 0}
                  aria-label={t('review.moveEarlier', { n: i + 1 })}
                >
                  →
                </button>
                <button
                  onClick={() => onMove(i, i + 1)}
                  disabled={i === pages.length - 1}
                  aria-label={t('review.moveLater', { n: i + 1 })}
                >
                  ←
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <label className="field">
        {t('review.title')}
        <input value={title} placeholder={t('review.titlePlaceholder')} onChange={(e) => onTitle(e.target.value)} />
      </label>

      {advanced && (
        <>
          <label className="field">
            {t('review.date')}
            <input
              type="date"
              dir="ltr"
              value={docDate}
              max="2100-12-31"
              onChange={(e) => e.target.value && onDocDate(e.target.value)}
            />
          </label>
          <div className="field">
            {t('review.quality')}
            <div className="segmented" role="radiogroup" aria-label={t('review.quality')}>
              {QUALITIES.map((q) => (
                <button key={q} role="radio" aria-checked={quality === q} className={quality === q ? 'on' : ''} onClick={() => onQuality(q)}>
                  {t(`quality.${q}`)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <p className="status">
        {t('review.fileName')} <bdi dir="ltr">{pdfFileName(title, parseLocalDate(docDate))}</bdi>
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
