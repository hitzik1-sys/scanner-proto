// התחברות לגוגל עם Google Identity Services (token client).
// אישור הגישה נשמר רק בזיכרון של הדף, לשעה, ומתחדש כשצריך. אין שרת.

import { GOOGLE, SCOPES } from '../config';

const GIS_URL = 'https://accounts.google.com/gsi/client';
const USER_KEY = 'google-user';

export interface GoogleUser {
  email: string;
  name: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any;
  }
}

let gisReady: Promise<void> | null = null;
let tokenClient: any = null;
let accessToken: string | null = null;
let expiresAt = 0;
const listeners = new Set<() => void>();

function loadGis(): Promise<void> {
  if (gisReady) return gisReady;
  gisReady = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = GIS_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisReady = null;
      reject(new Error('לא הצלחתי להתחבר לגוגל. בדוק חיבור לאינטרנט.'));
    };
    document.head.append(s);
  });
  return gisReady;
}

/** טוענים מראש, כדי שחלון ההתחברות ייפתח מיד בלחיצה (דפדפנים חוסמים חלון שנפתח באיחור) */
export function preloadGoogle(): void {
  void loadGis().catch(() => {});
}

/** המשתמש שהתחבר בפעם האחרונה במכשיר הזה, אם יש */
export function savedUser(): GoogleUser | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function onAuthChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn());

async function requestToken(prompt: '' | 'consent' | 'select_account'): Promise<string> {
  await loadGis();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE.clientId,
      scope: SCOPES.join(' '),
      include_granted_scopes: true,
      callback: () => {},
    });
  }
  const saved = savedUser();
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp: any) => {
      if (resp.error) {
        reject(new Error(resp.error_description || resp.error));
        return;
      }
      // המשתמש יכול לבטל חלק מההרשאות במסך האישור של גוגל
      const missing = SCOPES.filter((s) => !window.google.accounts.oauth2.hasGrantedAllScopes(resp, s));
      if (missing.length) {
        reject(new Error('לא כל ההרשאות אושרו. צריך לאשר את כולן במסך של גוגל.'));
        return;
      }
      accessToken = resp.access_token;
      expiresAt = Date.now() + (Number(resp.expires_in) - 60) * 1000;
      resolve(resp.access_token);
    };
    tokenClient.error_callback = (err: any) =>
      reject(new Error(err?.type === 'popup_closed' ? 'חלון ההתחברות נסגר' : err?.message || 'ההתחברות נכשלה'));
    tokenClient.requestAccessToken({ prompt, login_hint: saved?.email });
  });
}

export async function signIn(): Promise<GoogleUser> {
  await requestToken(savedUser() ? '' : 'select_account');
  // המייל נלקח מ-Drive, כדי לא לבקש הרשאה נוספת רק בשבילו
  const r = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(`לא הצלחתי לקרוא את פרטי החשבון (${r.status})`);
  const a = await r.json();
  const user: GoogleUser = { email: a.user.emailAddress, name: a.user.displayName || a.user.emailAddress };
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  notify();
  return user;
}

export async function signOut(): Promise<void> {
  if (accessToken && window.google?.accounts?.oauth2) {
    await new Promise<void>((r) => window.google.accounts.oauth2.revoke(accessToken, () => r()));
  }
  accessToken = null;
  expiresAt = 0;
  localStorage.removeItem(USER_KEY);
  notify();
}

/**
 * יש אישור גישה בתוקף, בלי לפתוח חלון. עבודה ברקע (סנכרון, זיהוי טקסט) רצה רק כשזה true,
 * כי דפדפנים חוסמים חלון התחברות שלא נפתח מלחיצה של המשתמש.
 */
export function hasValidToken(): boolean {
  return !!accessToken && Date.now() < expiresAt;
}

/** אישור גישה בתוקף. אם פג, מבקש חדש (בדרך כלל בלי שהמשתמש יצטרך לעשות כלום) */
export async function getToken(): Promise<string> {
  if (accessToken && Date.now() < expiresAt) return accessToken;
  if (!savedUser()) await signIn();
  else await requestToken('');
  return accessToken!;
}

/** קריאה ל-API של גוגל עם אישור הגישה, ושגיאה ברורה אם נכשלה */
export async function googleFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    let msg = `${r.status}`;
    try {
      const j = await r.json();
      msg += `: ${j.error?.message || JSON.stringify(j)}`;
    } catch {
      /* גוף התשובה לא JSON */
    }
    throw new Error(msg);
  }
  return r;
}
