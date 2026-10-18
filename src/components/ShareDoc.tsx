import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../SettingsContext';
import RecipientPicker, { emailRecipients, initialChoices, whatsappRecipients, type Choices } from './RecipientPicker';
import { sendMail } from '../google/gmail';
import { getToken } from '../google/auth';
import { shareFile } from '../lib/files';
import { fillTemplate } from '../lib/settings';
import type { IndexDoc } from '../lib/docIndex';

interface Props {
  doc: IndexDoc;
  /** הקובץ, אחרי שירד מהדרייב (null = עוד יורד) */
  blob: Blob | null;
  loadError: string | null;
  onSettings?: () => void;
}

type StepState = { text: string; ok: boolean | null };

/** שליחת מסמך שמור: לאנשי קשר מהרשימה (מייל / וואטסאפ), או בחלון השיתוף */
export default function ShareDoc({ doc, blob, loadError, onSettings }: Props) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const contacts = settings.contacts;
  const [choices, setChoices] = useState<Choices>(() => initialChoices(contacts, false));
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [whatsappBox, setWhatsappBox] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const emailTo = emailRecipients(contacts, choices);
  const whatsappTo = whatsappRecipients(contacts, choices);

  const share = async () => {
    if (!blob) return;
    setMessage(null);
    try {
      const r = await shareFile(blob, doc.name);
      if (r === 'downloaded') setMessage(t('done.downloaded'));
    } catch (e) {
      setMessage(t('done.shareFailed', { message: (e as Error).message }));
    }
  };

  const done = () => {
    setSentIds((cur) => new Set([...cur, ...emailTo.map((c) => c.id), ...whatsappTo.map((c) => c.id)]));
    setChoices(initialChoices(contacts, false));
  };

  const send = async () => {
    if (!blob) return;
    // וואטסאפ בלבד: ישר לחלון השיתוף, בתוך הלחיצה
    if (emailTo.length === 0) {
      await share();
      done();
      return;
    }
    setBusy(true);
    const names = emailTo.map((c) => c.name).join(', ');
    const log = [...steps, { text: t('send.step.emailing', { names }), ok: null } as StepState];
    setSteps(log);
    try {
      await getToken();
      await sendMail({
        to: emailTo.map((c) => c.email),
        subject: fillTemplate(settings.emailSubject, doc.name),
        body: fillTemplate(settings.emailBody, doc.name),
        attachment: { name: doc.name, blob },
      });
      log[log.length - 1] = { text: t('send.step.emailed', { names }), ok: true };
    } catch (e) {
      log[log.length - 1] = { text: t('send.step.emailFailed', { message: (e as Error).message }), ok: false };
    }
    setSteps([...log]);
    setWhatsappBox(whatsappTo.map((c) => c.name));
    done();
    setBusy(false);
  };

  if (loadError) return <p className="status error">{t('share.loadFailed', { message: loadError })}</p>;

  return (
    <div className="share-doc">
      {!blob && <p className="status">{t('share.loading')}</p>}
      <h4>{sentIds.size ? t('send.moreRecipients') : t('send.recipients')}</h4>
      <RecipientPicker
        contacts={contacts}
        choices={choices}
        onChange={setChoices}
        disabled={busy || !blob}
        sentIds={sentIds}
        onSettings={onSettings}
      />

      {steps.length > 0 && (
        <ul className="steps" aria-live="polite">
          {steps.map((s, i) => (
            <li key={i} className={s.ok === null ? 'pending' : s.ok ? 'ok' : 'fail'}>
              {s.ok === null ? '…' : s.ok ? '✓' : '✗'} {s.text}
            </li>
          ))}
        </ul>
      )}

      {whatsappBox.length > 0 && (
        <div className="card whatsapp-box">
          <p>
            <strong>{t('send.whatsappTo')}</strong> {whatsappBox.join(', ')}
          </p>
          <button
            className="primary"
            onClick={() => {
              void share();
              setWhatsappBox([]);
            }}
          >
            {t('send.openWhatsapp')}
          </button>
        </div>
      )}

      {message && <p className="status">{message}</p>}

      <div className="buttons">
        {contacts.length > 0 && (
          <button
            className="primary"
            onClick={() => void send()}
            disabled={busy || !blob || (emailTo.length === 0 && whatsappTo.length === 0)}
          >
            {busy ? t('send.working') : emailTo.length === 0 && whatsappTo.length > 0 ? t('send.openWhatsapp') : t('share.send')}
          </button>
        )}
        <button onClick={() => void share()} disabled={!blob}>
          {t('send.shareManually')}
        </button>
      </div>
    </div>
  );
}
