// הגדרות אישיות של המשתמש. נשמרות בטלפון, ומגובות בתיקייה הנסתרת בדרייב שלו
// (לא משותפות עם בני משפחה). בשני מקומות שונים: הגרסה שעודכנה אחרונה מנצחת.

export interface Contact {
  id: string;
  name: string;
  /** ריק = לא שולחים לו במייל */
  email: string;
  /** מופיע בתזכורת "לשלוח בוואטסאפ ל:" */
  whatsapp: boolean;
  /** מסומן מראש בכל שליחה */
  preselected: boolean;
}

export interface Settings {
  updatedAt: string;
  saveToDrive: boolean;
  driveFolder: string;
  quickTags: string[];
  contacts: Contact[];
  /** {name} = שם הקובץ */
  emailSubject: string;
  emailBody: string;
}

export const DEFAULT_SETTINGS: Settings = {
  updatedAt: new Date(0).toISOString(),
  saveToDrive: true,
  driveFolder: 'מסמכים סרוקים',
  quickTags: ['חשבונות', 'בריאות', 'ביטוח', 'רכב', 'לימודים'],
  contacts: [],
  emailSubject: 'מסמך: {name}',
  emailBody: 'מצורף מסמך שנסרק.\n\nנשלח מהסורק מסמכים של המשפחה.',
};

const KEY = 'settings';

/** משלים שדות חסרים (למשל אחרי עדכון גרסה שהוסיף הגדרה חדשה) ומסנן ערכים פגומים */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;
  const s: Settings = { ...DEFAULT_SETTINGS, ...r };
  s.quickTags = Array.isArray(r.quickTags) ? r.quickTags.filter((t) => typeof t === 'string') : DEFAULT_SETTINGS.quickTags;
  s.contacts = Array.isArray(r.contacts)
    ? r.contacts
        .filter((c) => c && typeof c.name === 'string')
        .map((c) => ({
          id: String(c.id || crypto.randomUUID()),
          name: c.name,
          email: typeof c.email === 'string' ? c.email : '',
          whatsapp: !!c.whatsapp,
          preselected: !!c.preselected,
        }))
    : [];
  return s;
}

export function loadLocalSettings(): Settings {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(KEY) || 'null'));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveLocalSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* מצב גלישה פרטית: ההגדרות יישמרו רק בדרייב */
  }
}

/** איזו גרסה חדשה יותר: של הטלפון או של הגיבוי בדרייב */
export function newerSettings(local: Settings, remote: Settings | null): 'local' | 'remote' | 'same' {
  if (!remote) return 'local';
  const a = Date.parse(local.updatedAt) || 0;
  const b = Date.parse(remote.updatedAt) || 0;
  return a === b ? 'same' : a > b ? 'local' : 'remote';
}

export function fillTemplate(template: string, name: string): string {
  return template.replace(/\{name\}/g, name);
}
