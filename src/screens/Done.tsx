import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadBlob, kb, shareFile } from '../lib/files';
import type { Page, PdfResult } from '../types';

interface Props {
  pdf: PdfResult;
  pages: Page[];
  onEdit: () => void;
  onNew: () => void;
}

/** המסמך מוכן: שיתוף דרך חלון השיתוף של הטלפון, או שמירה בטלפון */
export default function Done({ pdf, pages, onEdit, onNew }: Props) {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);

  const share = async () => {
    setMessage(null);
    try {
      const r = await shareFile(pdf.blob, pdf.name);
      if (r === 'downloaded') setMessage(t('done.downloaded'));
    } catch (e) {
      setMessage(t('done.shareFailed', { message: (e as Error).message }));
    }
  };

  return (
    <main className="page done">
      <h2>{t('done.ready')}</h2>
      <p className="file-name">
        <bdi dir="ltr">{pdf.name}</bdi>
      </p>
      <p className="status">{t('done.info', { count: pdf.pages, size: kb(pdf.blob.size) })}</p>
      <div className="thumbs small">
        {pages.map((p) => p.thumb && <img key={p.id} src={p.thumb} alt="" />)}
      </div>
      {message && <p className="status">{message}</p>}
      <div className="buttons col">
        <button className="primary big" onClick={() => void share()}>
          {t('done.share')}
        </button>
        <button onClick={() => downloadBlob(pdf.blob, pdf.name)}>{t('done.download')}</button>
        <button onClick={onEdit}>{t('done.edit')}</button>
        <button onClick={onNew}>{t('done.new')}</button>
      </div>
    </main>
  );
}
