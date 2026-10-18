import { useTranslation } from 'react-i18next';
import { driveViewUrl } from '../google/drive';
import type { IndexDoc } from '../lib/docIndex';
import { displayDate } from '../lib/files';
import type { Snippet } from '../lib/search';

interface Props {
  doc: IndexDoc;
  snippet?: Snippet | null;
}

/** קטע מהטקסט, עם המילים שנמצאו מסומנות */
function SnippetText({ snippet }: { snippet: Snippet }) {
  const parts: JSX.Element[] = [];
  let at = 0;
  snippet.marks.forEach(([s, e], i) => {
    if (s > at) parts.push(<span key={`t${i}`}>{snippet.text.slice(at, s)}</span>);
    parts.push(<mark key={`m${i}`}>{snippet.text.slice(s, e)}</mark>);
    at = e;
  });
  if (at < snippet.text.length) parts.push(<span key="end">{snippet.text.slice(at)}</span>);
  return <p className="snippet">{parts}</p>;
}

/** מסמך ברשימה: שם, תאריך, תגיות, קטע מהטקסט, וכפתור פתיחה בדרייב */
export default function DocCard({ doc, snippet }: Props) {
  const { t } = useTranslation();
  return (
    <li className="doc-card">
      <div className="doc-head">
        <strong className="doc-title">{doc.title}</strong>
        <span className="doc-date">{displayDate(doc.date)}</span>
      </div>
      {doc.tags.length > 0 && (
        <div className="doc-tags">
          {doc.tags.map((tag) => (
            <span key={tag} className="badge">
              {tag}
            </span>
          ))}
        </div>
      )}
      {snippet && <SnippetText snippet={snippet} />}
      <div className="doc-foot">
        <span className="status">
          {doc.ocrStatus === 'pending'
            ? t('search.ocrPending')
            : doc.ocrStatus === 'failed'
              ? t('search.ocrFailed')
              : t('search.pages', { count: doc.pages })}
        </span>
        <a className="button small" href={driveViewUrl(doc.id)} target="_blank" rel="noopener">
          {t('search.open')}
        </a>
      </div>
    </li>
  );
}
