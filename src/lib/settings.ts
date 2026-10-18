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

export type PdfQuality = 'high' | 'medium' | 'low';
export type CameraStart = 'manual' | 'auto';
/** system = לפי הגדרת הטלפון */
export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  updatedAt: string;
  /** רמה מתקדמת: מציגה אפשרויות נוספות. כבוי = הממשק הפשוט */
  advanced: boolean;
  pdfQuality: PdfQuality;
  cameraStart: CameraStart;
  /** מצב יום / לילה */
  theme: Theme;
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
  advanced: false,
  pdfQuality: 'medium',
  cameraStart: 'manual',
  theme: 'system',
  saveToDrive: true,
  driveFolder: 'מסמכים סרוקים',
  quickTags: ['חשבונות', 'בריאות', 'ביטוח', 'רכב', 'לימודים'],
  contacts: [],
  emailSubject: 'מסמך: {name}',
  emailBody: 'מצורף מסמך שנסרק.\n\nנשלח מסורק מסמכים.',
};

const KEY = 'settings';

/** משלים שדות חסרים (למשל אחרי עדכון גרסה שהוסיף הגדרה חדשה) ומסנן ערכים פגומים */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;
  const s: Settings = { ...DEFAULT_SETTINGS, ...r };
  s.advanced = r.advanced === true;
  if (!['high', 'medium', 'low'].includes(s.pdfQuality)) s.pdfQuality = DEFAULT_SETTINGS.pdfQuality;
  if (!['manual', 'auto'].includes(s.cameraStart)) s.cameraStart = DEFAULT_SETTINGS.cameraStart;
  if (!['system', 'light', 'dark'].includes(s.theme)) s.theme = DEFAULT_SETTINGS.theme;
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

/** איכות JPEG וגודל מקסימלי לעמוד ב-PDF. נמוכה = קובץ קטן לשליחה מהירה */
export function pdfQualityParams(q: PdfQuality): { jpeg: number; maxSide: number } {
  return { high: { jpeg: 0.92, maxSide: 2200 }, medium: { jpeg: 0.82, maxSide: 2200 }, low: { jpeg: 0.6, maxSide: 1400 } }[q];
}

/** מחיל את מצב היום / הלילה על הדף (המשתנים ב-styles.css) */
export function applyTheme(theme: Theme): void {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function fillTemplate(template: string, name: string): string {
  return template.replace(/\{name\}/g, name);
}
