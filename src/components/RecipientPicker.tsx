import { useTranslation } from 'react-i18next';
import type { Contact } from '../lib/settings';

export interface Choice {
  selected: boolean;
  email: boolean;
  whatsapp: boolean;
}
export type Choices = Record<string, Choice>;

/** בחירה התחלתית: מייל למי שיש לו מייל, וואטסאפ למי שסומן. preselect = לסמן מראש מי שמוגדר כך */
export function initialChoices(contacts: Contact[], preselect: boolean): Choices {
  return Object.fromEntries(
    contacts.map((c) => [c.id, { selected: preselect && c.preselected, email: !!c.email, whatsapp: c.whatsapp }]),
  );
}

export function emailRecipients(contacts: Contact[], choices: Choices): Contact[] {
  return contacts.filter((c) => choices[c.id]?.selected && choices[c.id].email && c.email);
}

export function whatsappRecipients(contacts: Contact[], choices: Choices): Contact[] {
  return contacts.filter((c) => choices[c.id]?.selected && choices[c.id].whatsapp);
}

interface Props {
  contacts: Contact[];
  choices: Choices;
  onChange: (choices: Choices) => void;
  disabled?: boolean;
  /** אנשי קשר שכבר קיבלו את המסמך (מסומנים ב"✓ נשלח") */
  sentIds?: Set<string>;
  onSettings?: () => void;
}

/** רשימת אנשי הקשר: סימון, ולכל אחד מייל ו/או וואטסאפ */
export default function RecipientPicker({ contacts, choices, onChange, disabled, sentIds, onSettings }: Props) {
  const { t } = useTranslation();
  const set = (id: string, patch: Partial<Choice>) => onChange({ ...choices, [id]: { ...choices[id], ...patch } });

  if (contacts.length === 0) {
    return (
      <p className="hint">
        {t('send.noContacts')}{' '}
        {onSettings && (
          <button className="link" onClick={onSettings}>
            {t('send.addContacts')}
          </button>
        )}
      </p>
    );
  }

  return (
    <ul className="recipient-list">
      {contacts.map((c) => {
        const ch = choices[c.id] ?? { selected: false, email: !!c.email, whatsapp: c.whatsapp };
        return (
          <li key={c.id} className={ch.selected ? 'on' : ''}>
            <label className="check">
              <input
                type="checkbox"
                checked={ch.selected}
                onChange={(e) => set(c.id, { selected: e.target.checked })}
                disabled={disabled}
              />
              {c.name}
              {sentIds?.has(c.id) && <span className="sent-badge">{t('send.sent')}</span>}
            </label>
            <div className="channels">
              <button
                className={ch.email ? 'channel on' : 'channel'}
                aria-pressed={ch.email}
                disabled={disabled || !c.email || !ch.selected}
                onClick={() => set(c.id, { email: !ch.email })}
              >
                ✉ {t('send.email')}
              </button>
              <button
                className={ch.whatsapp ? 'channel on' : 'channel'}
                aria-pressed={ch.whatsapp}
                disabled={disabled || !ch.selected}
                onClick={() => set(c.id, { whatsapp: !ch.whatsapp })}
              >
                💬 {t('send.whatsapp')}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
