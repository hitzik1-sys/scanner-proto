import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../SettingsContext';
import RecipientPicker, {
  emailRecipients,
  initialChoices,
  whatsappRecipients,
  type Choices,
} from '../components/RecipientPicker';
import { getToken, savedUser } from '../google/auth';
import { ensureFolder, recordInIndex, uploadPdf } from '../google/drive';
import { sendMail } from '../google/gmail';
import { normalizeTags, type IndexDoc } from '../lib/docIndex';
import { downloadBlob, kb, shareFile } from '../lib/files';
import { addToLibrary } from '../library';
import { fillTemplate } from '../lib/settings';
import type { Page, PdfResult } from '../types';

interface Props {
  pdf: PdfResult;
  pages: Page[];
  title: string;
  /** YYYY-MM-DD: תאריך המסמך, כמו בשם הקובץ */
  docDate: string;
  onEdit: () => void;
  onNew: () => void;
  onSettings: () => void;
  /** נקרא אחרי שליחה ראשונה, כדי שחזרה למסך הראשי תתחיל סריקה חדשה */
  onFinished: () => void;
}

type StepState = { text: string; ok: boolean | null };

/**
 * "שמור ושלח": שמירה בדרייב עם תגיות, מייל אוטומטי ותזכורת לוואטסאפ.
 * אחרי השליחה אפשר לשלוח לעוד נמענים (בלי לשמור שוב בדרייב).
 */
export default function SaveSend({ pdf, pages, title, docDate, onEdit, onNew, onSettings, onFinished }: Props) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const contacts = settings.contacts;
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [toDrive, setToDrive] = useState(settings.saveToDrive);
  const [savedToDrive, setSavedToDrive] = useState(false);
  const [choices, setChoices] = useState<Choices>(() => initialChoices(contacts, true));
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [finished, setFinished] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const allTags = useMemo(() => normalizeTags([...settings.quickTags, ...tags]), [settings.quickTags, tags]);
  const [chosenTags, setChosenTags] = useState<string[]>([]);

  const emailTo = emailRecipients(contacts, choices);
  const whatsappTo = whatsappRecipients(contacts, choices);
  const drive = toDrive && !savedToDrive;
  const nothingToDo = !drive && emailTo.length === 0;

  const toggleTag = (tag: string) =>
    setChosenTags((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]));

  const addCustomTag = () => {
    const [tag] = normalizeTags([customTag]);
    if (!tag) return;
    setTags((cur) => normalizeTags([...cur, tag]));
    setChosenTags((cur) => normalizeTags([...cur, tag]));
    setCustomTag('');
  };

  // תזכורת לוואטסאפ אחרי שמירה ומייל. בוואטסאפ בלבד חלון השיתוף כבר נפתח, אין צורך
  const [whatsappBox, setWhatsappBox] = useState(false);

  const finish = (showWhatsappBox: boolean) => {
    setSentIds((cur) => new Set([...cur, ...emailTo.map((c) => c.id), ...whatsappTo.map((c) => c.id)]));
    setWhatsappBox(showWhatsappBox && whatsappTo.length > 0);
    setFinished(true);
    onFinished();
  };

  const run = async () => {
    setBusy(true);
    setMessage(null);
    const log: StepState[] = [...steps];
    const push = (s: StepState) => {
      log.push(s);
      setSteps([...log]);
    };
    const replaceLast = (s: StepState) => {
      log[log.length - 1] = s;
      setSteps([...log]);
    };
    try {
      // קודם ההתחברות: חלון של גוגל חייב להיפתח מיד אחרי הלחיצה
      await getToken();
      const owner = savedUser()?.email ?? '';

      if (drive) {
        push({ text: t('send.step.saving'), ok: null });
        try {
          const folder = await ensureFolder(settings.driveFolder.trim() || 'מסמכים סרוקים');
          const file = await uploadPdf(folder.id, pdf.blob, pdf.name, chosenTags);
          const doc: IndexDoc = {
            id: file.id,
            name: pdf.name,
            date: docDate,
            title: title.trim() || t('send.untitled'),
            tags: chosenTags,
            pages: pdf.pages,
            ocrText: '',
            ocrStatus: 'pending',
            createdAt: new Date().toISOString(),
          };
          await recordInIndex(folder.id, owner, doc);
          // נכנס מיד לחיפוש, וזיהוי הטקסט מתחיל ברקע
          void addToLibrary(doc, folder.id);
          setSavedToDrive(true);
          replaceLast({ text: t('send.step.saved', { folder: folder.name }), ok: true });
        } catch (e) {
          replaceLast({ text: t('send.step.saveFailed', { message: (e as Error).message }), ok: false });
        }
      }

      if (emailTo.length) {
        const names = emailTo.map((c) => c.name).join(', ');
        push({ text: t('send.step.emailing', { names }), ok: null });
        try {
          await sendMail({
            to: emailTo.map((c) => c.email),
            subject: fillTemplate(settings.emailSubject, pdf.name),
            body: fillTemplate(settings.emailBody, pdf.name),
            attachment: { name: pdf.name, blob: pdf.blob },
          });
          replaceLast({ text: t('send.step.emailed', { names }), ok: true });
        } catch (e) {
          replaceLast({ text: t('send.step.emailFailed', { message: (e as Error).message }), ok: false });
        }
      }
      finish(true);
    } catch (e) {
      // ההתחברות עצמה נכשלה או בוטלה
      push({ text: t('send.step.authFailed', { message: (e as Error).message }), ok: false });
    } finally {
      setBusy(false);
    }
  };

  /** וואטסאפ בלבד: אין צורך בגוגל, פותחים ישר את חלון השיתוף */
  const whatsappOnly = async () => {
    await share();
    finish(false);
  };

  /** סבב נוסף: אף אחד לא מסומן מראש, ובלי שמירה נוספת בדרייב */
  const sendMore = () => {
    setChoices(initialChoices(contacts, false));
    setWhatsappBox(false);
    setFinished(false);
    setMessage(null);
  };

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
    <main className="page send">
      <h2>{t('done.ready')}</h2>
      <p className="file-name">
        <bdi dir="ltr">{pdf.name}</bdi>
      </p>
      <p className="status">{t('done.info', { count: pdf.pages, size: kb(pdf.blob.size) })}</p>
      <div className="thumbs small">{pages.map((p) => p.thumb && <img key={p.id} src={p.thumb} alt="" />)}</div>

      {!finished && (
        <>
          {!savedToDrive && (
            <>
              <section className="card">
                <h3>{t('send.tags')}</h3>
                <div className="chips">
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      className={chosenTags.includes(tag) ? 'chip on' : 'chip'}
                      aria-pressed={chosenTags.includes(tag)}
                      onClick={() => toggleTag(tag)}
                      disabled={busy}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <div className="inline-add">
                  <input
                    value={customTag}
                    placeholder={t('send.newTag')}
                    onChange={(e) => setCustomTag(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
                    disabled={busy}
                  />
                  <button onClick={addCustomTag} disabled={busy || !customTag.trim()}>
                    {t('settings.tags.add')}
                  </button>
                </div>
              </section>

              <section className="card">
                <label className="check">
                  <input type="checkbox" checked={toDrive} onChange={(e) => setToDrive(e.target.checked)} disabled={busy} />
                  {t('send.toDrive', { folder: settings.driveFolder })}
                </label>
              </section>
            </>
          )}

          <section className="card">
            <h3>{sentIds.size ? t('send.moreRecipients') : t('send.recipients')}</h3>
            <RecipientPicker
              contacts={contacts}
              choices={choices}
              onChange={setChoices}
              disabled={busy}
              sentIds={sentIds}
              onSettings={onSettings}
            />
          </section>

          {whatsappTo.length > 0 && (
            <p className="hint">
              {t('send.whatsappPreview', { names: whatsappTo.map((c) => c.name).join(', ') })}
            </p>
          )}
          {!savedUser() && !nothingToDo && <p className="hint">{t('send.willSignIn')}</p>}

          <div className="buttons col">
            {nothingToDo ? (
              <button className="primary big" onClick={() => void whatsappOnly()} disabled={whatsappTo.length === 0}>
                {t('send.openWhatsapp')}
              </button>
            ) : (
              <button className="primary big" onClick={() => void run()} disabled={busy}>
                {busy ? t('send.working') : savedToDrive ? t('send.goMore') : t('send.go')}
              </button>
            )}
          </div>
        </>
      )}

      {steps.length > 0 && (
        <ul className="steps" aria-live="polite">
          {steps.map((s, i) => (
            <li key={i} className={s.ok === null ? 'pending' : s.ok ? 'ok' : 'fail'}>
              {s.ok === null ? '…' : s.ok ? '✓' : '✗'} {s.text}
            </li>
          ))}
        </ul>
      )}

      {finished && whatsappBox && (
        <section className="card whatsapp-box">
          <p>
            <strong>{t('send.whatsappTo')}</strong> {whatsappTo.map((c) => c.name).join(', ')}
          </p>
          <p className="hint">{t('send.whatsappHint')}</p>
          <button className="primary" onClick={() => void share()}>
            {t('send.openWhatsapp')}
          </button>
        </section>
      )}

      {message && <p className="status">{message}</p>}

      <div className="buttons col">
        {finished && contacts.length > 0 && (
          <button className="primary" onClick={sendMore}>
            {t('send.sendMore')}
          </button>
        )}
        <button onClick={() => void share()}>{t('send.shareManually')}</button>
        <button onClick={() => downloadBlob(pdf.blob, pdf.name)}>{t('done.download')}</button>
        {!finished && !savedToDrive && <button onClick={onEdit}>{t('done.edit')}</button>}
        <button onClick={onNew}>{t('done.new')}</button>
      </div>
    </main>
  );
}
