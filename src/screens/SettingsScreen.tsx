import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../SettingsContext';
import { signIn, signOut } from '../google/auth';
import { useGoogleUser } from '../google/useGoogleUser';
import { isValidEmail } from '../lib/mime';
import { normalizeTags } from '../lib/docIndex';
import type { Contact } from '../lib/settings';

interface Props {
  onBack: () => void;
}

const blankContact = (): Contact => ({ id: crypto.randomUUID(), name: '', email: '', whatsapp: false, preselected: false });

export default function SettingsScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const user = useGoogleUser();
  const [authError, setAuthError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const [newTag, setNewTag] = useState('');

  const connect = async () => {
    setAuthError(null);
    try {
      await signIn();
    } catch (e) {
      setAuthError((e as Error).message);
    }
  };

  const saveContact = () => {
    if (!editing) return;
    const c = { ...editing, name: editing.name.trim(), email: editing.email.trim() };
    if (!c.name) return setContactError(t('settings.contacts.needName'));
    if (c.email && !isValidEmail(c.email)) return setContactError(t('settings.contacts.badEmail'));
    if (!c.email && !c.whatsapp) return setContactError(t('settings.contacts.needChannel'));
    const exists = settings.contacts.some((x) => x.id === c.id);
    update({ contacts: exists ? settings.contacts.map((x) => (x.id === c.id ? c : x)) : [...settings.contacts, c] });
    setEditing(null);
    setContactError(null);
  };

  const removeContact = (c: Contact) => {
    if (confirm(t('settings.contacts.confirmDelete', { name: c.name }))) {
      update({ contacts: settings.contacts.filter((x) => x.id !== c.id) });
    }
  };

  const addTag = () => {
    const tags = normalizeTags([...settings.quickTags, newTag]);
    update({ quickTags: tags });
    setNewTag('');
  };

  return (
    <main className="page settings">
      <h2>{t('settings.title')}</h2>

      <section className="card">
        <h3>{t('settings.theme.title')}</h3>
        <div className="segmented" role="radiogroup" aria-label={t('settings.theme.title')}>
          {(['light', 'dark', 'system'] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={settings.theme === m}
              className={settings.theme === m ? 'on' : ''}
              onClick={() => update({ theme: m })}
            >
              {t(`settings.theme.${m}`)}
            </button>
          ))}
        </div>
        <p className="hint">{t('settings.theme.hint')}</p>
      </section>

      <section className="card">
        <h3>{t('settings.level.title')}</h3>
        <label className="check">
          <input type="checkbox" checked={settings.advanced} onChange={(e) => update({ advanced: e.target.checked })} />
          {t('settings.level.advanced')}
        </label>
        <p className="hint">{t('settings.level.hint')}</p>
        {settings.advanced && (
          <>
            <div className="field">
              {t('settings.level.quality')}
              <div className="segmented" role="radiogroup" aria-label={t('settings.level.quality')}>
                {(['high', 'medium', 'low'] as const).map((q) => (
                  <button
                    key={q}
                    role="radio"
                    aria-checked={settings.pdfQuality === q}
                    className={settings.pdfQuality === q ? 'on' : ''}
                    onClick={() => update({ pdfQuality: q })}
                  >
                    {t(`quality.${q}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              {t('settings.level.camera')}
              <div className="segmented" role="radiogroup" aria-label={t('settings.level.camera')}>
                {(['manual', 'auto'] as const).map((m) => (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={settings.cameraStart === m}
                    className={settings.cameraStart === m ? 'on' : ''}
                    onClick={() => update({ cameraStart: m })}
                  >
                    {t(`settings.level.camera_${m}`)}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h3>{t('settings.google.title')}</h3>
        {user ? (
          <>
            <p>
              {t('settings.google.connected')} <bdi dir="ltr">{user.email}</bdi>
            </p>
            <button onClick={() => void signOut()}>{t('settings.google.disconnect')}</button>
          </>
        ) : (
          <>
            <p className="hint">{t('settings.google.why')}</p>
            <button className="primary" onClick={() => void connect()}>
              {t('settings.google.connect')}
            </button>
          </>
        )}
        {authError && <p className="status error">{authError}</p>}
      </section>

      <section className="card">
        <h3>{t('settings.contacts.title')}</h3>
        <p className="hint">{t('settings.contacts.hint')}</p>
        {settings.contacts.length === 0 && !editing && <p className="status">{t('settings.contacts.empty')}</p>}
        <ul className="contact-list">
          {settings.contacts.map((c) => (
            <li key={c.id}>
              <div className="contact-main">
                <strong>{c.name}</strong>
                <span className="contact-tags">
                  {c.email && <bdi dir="ltr">{c.email}</bdi>}
                  {c.whatsapp && <span className="badge">{t('settings.contacts.whatsapp')}</span>}
                  {c.preselected && <span className="badge">{t('settings.contacts.preselected')}</span>}
                </span>
              </div>
              <div className="contact-actions">
                <button onClick={() => setEditing({ ...c })}>{t('settings.edit')}</button>
                <button className="danger-text" onClick={() => removeContact(c)}>
                  {t('settings.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>

        {editing ? (
          <div className="contact-form">
            <label className="field">
              {t('settings.contacts.name')}
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label className="field">
              {t('settings.contacts.email')}
              <input
                type="email"
                dir="ltr"
                inputMode="email"
                autoComplete="email"
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={editing.whatsapp}
                onChange={(e) => setEditing({ ...editing, whatsapp: e.target.checked })}
              />
              {t('settings.contacts.whatsappLong')}
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={editing.preselected}
                onChange={(e) => setEditing({ ...editing, preselected: e.target.checked })}
              />
              {t('settings.contacts.preselectedLong')}
            </label>
            {contactError && <p className="status error">{contactError}</p>}
            <div className="buttons">
              <button className="primary" onClick={saveContact}>
                {t('settings.save')}
              </button>
              <button
                onClick={() => {
                  setEditing(null);
                  setContactError(null);
                }}
              >
                {t('settings.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditing(blankContact())}>{t('settings.contacts.add')}</button>
        )}
      </section>

      <section className="card">
        <h3>{t('settings.drive.title')}</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.saveToDrive}
            onChange={(e) => update({ saveToDrive: e.target.checked })}
          />
          {t('settings.drive.save')}
        </label>
        <label className="field">
          {t('settings.drive.folder')}
          <input
            value={settings.driveFolder}
            onChange={(e) => update({ driveFolder: e.target.value })}
            onBlur={(e) => !e.target.value.trim() && update({ driveFolder: 'מסמכים סרוקים' })}
          />
        </label>
      </section>

      <section className="card">
        <h3>{t('settings.tags.title')}</h3>
        <p className="hint">{t('settings.tags.hint')}</p>
        <div className="chips">
          {settings.quickTags.map((tag) => (
            <span key={tag} className="chip on">
              {tag}
              <button
                className="chip-x"
                aria-label={t('settings.tags.remove', { tag })}
                onClick={() => update({ quickTags: settings.quickTags.filter((x) => x !== tag) })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="inline-add">
          <input
            value={newTag}
            placeholder={t('settings.tags.placeholder')}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && newTag.trim() && addTag()}
          />
          <button onClick={addTag} disabled={!newTag.trim()}>
            {t('settings.tags.add')}
          </button>
        </div>
      </section>

      <section className="card">
        <h3>{t('settings.email.title')}</h3>
        <label className="field">
          {t('settings.email.subject')}
          <input value={settings.emailSubject} onChange={(e) => update({ emailSubject: e.target.value })} />
        </label>
        <label className="field">
          {t('settings.email.body')}
          <textarea rows={4} value={settings.emailBody} onChange={(e) => update({ emailBody: e.target.value })} />
        </label>
        <p className="hint">{t('settings.email.hint')}</p>
      </section>

      <div className="buttons">
        <button className="primary" onClick={onBack}>
          {t('settings.back')}
        </button>
      </div>
    </main>
  );
}
