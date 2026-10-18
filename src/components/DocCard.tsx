import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getToken } from '../google/auth';
import { driveViewUrl } from '../google/drive';
import { normalizeTags, type IndexDoc } from '../lib/docIndex';
import { displayDate } from '../lib/files';
import type { Snippet } from '../lib/search';
import { deleteDoc, editDoc } from '../library';

interface Props {
  doc: IndexDoc;
  snippet?: Snippet | null;
  /** רמה מתקדמת: כפתור "פרטים" עם הטקסט שזוהה, עריכה ומחיקה */
  advanced?: boolean;
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
export default function DocCard({ doc, snippet, advanced = false }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(doc.title);
  const [tagsText, setTagsText] = useState(doc.tags.join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await getToken(); // מתוך הלחיצה, כדי שחלון ההתחברות (אם צריך) לא ייחסם
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      await editDoc(doc, title, normalizeTags(tagsText.split(/[,،]/)));
      setEditing(false);
    });

  const remove = () => {
    if (confirm(t('doc.confirmDelete', { title: doc.title }))) void run(() => deleteDoc(doc));
  };

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
        <span className="doc-actions">
          {advanced && (
            <button className="small" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? t('doc.close') : t('doc.details')}
            </button>
          )}
          <a className="button small" href={driveViewUrl(doc.id)} target="_blank" rel="noopener">
            {t('search.open')}
          </a>
        </span>
      </div>

      {advanced && open && (
        <div className="doc-details">
          <p className="status">
            {t('doc.file')} <bdi dir="ltr">{doc.name}</bdi>
          </p>

          {editing ? (
            <>
              <label className="field">
                {t('doc.title')}
                <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
              </label>
              <label className="field">
                {t('doc.tags')}
                <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} disabled={busy} />
              </label>
              <div className="buttons">
                <button className="primary" onClick={() => void save()} disabled={busy || !title.trim()}>
                  {busy ? t('send.working') : t('settings.save')}
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setTitle(doc.title);
                    setTagsText(doc.tags.join(', '));
                  }}
                  disabled={busy}
                >
                  {t('settings.cancel')}
                </button>
              </div>
            </>
          ) : (
            <>
              <h4>{t('doc.text')}</h4>
              <pre className="ocr-text" dir="auto">
                {doc.ocrStatus === 'done' ? doc.ocrText || t('doc.noText') : t('search.ocrPending')}
              </pre>
              <div className="buttons">
                <button onClick={() => setEditing(true)} disabled={busy}>
                  {t('doc.edit')}
                </button>
                <button className="danger-text" onClick={remove} disabled={busy}>
                  {busy ? t('send.working') : t('doc.delete')}
                </button>
              </div>
            </>
          )}
          {error && <p className="status error">{error}</p>}
        </div>
      )}
    </li>
  );
}
