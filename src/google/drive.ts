// גוגל דרייב: תיקיית המסמכים, העלאת PDF, קובץ האינדקס, וגיבוי ההגדרות בתיקייה הנסתרת.

import { googleFetch } from './auth';
import { addToIndex, emptyIndex, type DocIndex, type IndexDoc } from '../lib/docIndex';

const API = 'https://www.googleapis.com/drive/v3/';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const INDEX_NAME = '_index.json';
const SETTINGS_NAME = 'settings.json';

interface DriveFile {
  id: string;
  name: string;
  webViewLink?: string;
}

const q = (s: string) => encodeURIComponent(s);
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  return (await googleFetch(url, init)).json();
}

async function findOne(query: string, spaces = 'drive'): Promise<DriveFile | null> {
  const res = await json<{ files: DriveFile[] }>(
    `${API}files?q=${q(`${query} and trashed=false`)}&spaces=${spaces}&fields=files(id,name,webViewLink)&pageSize=1`,
  );
  return res.files[0] ?? null;
}

async function upload(blob: Blob, meta: Record<string, unknown>): Promise<DriveFile> {
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  form.append('file', blob);
  return json<DriveFile>(`${UPLOAD}?uploadType=multipart&fields=id,name,webViewLink`, { method: 'POST', body: form });
}

async function replaceContent(fileId: string, blob: Blob): Promise<void> {
  await googleFetch(`${UPLOAD}/${fileId}?uploadType=media`, {
    method: 'PATCH',
    body: blob,
    headers: { 'Content-Type': blob.type },
  });
}

/** מוצא את תיקיית המסמכים לפי שם, או יוצר אותה. האפליקציה רואה רק תיקייה שהיא עצמה יצרה */
export async function ensureFolder(name: string): Promise<DriveFile> {
  const found = await findOne(`name='${esc(name)}' and mimeType='${FOLDER_MIME}'`);
  if (found) return found;
  return json<DriveFile>(`${API}files?fields=id,name,webViewLink`, {
    method: 'POST',
    body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
    headers: { 'Content-Type': 'application/json' },
  });
}

/** תגיות נשמרות גם בתיאור הקובץ, כדי שאפשר יהיה לחפש אותן גם מתוך Google Drive עצמו */
export function tagsDescription(tags: string[]): string {
  return tags.map((t) => `#${t.replace(/\s+/g, '_')}`).join(' ');
}

export async function uploadPdf(folderId: string, blob: Blob, name: string, tags: string[]): Promise<DriveFile> {
  return upload(blob, { name, parents: [folderId], mimeType: 'application/pdf', description: tagsDescription(tags) });
}

/** מוסיף את המסמך לקובץ האינדקס שבתיקייה (או יוצר אותו) */
export async function recordInIndex(folderId: string, owner: string, doc: IndexDoc): Promise<void> {
  const existing = await findOne(`name='${INDEX_NAME}' and '${folderId}' in parents`);
  let index: DocIndex = emptyIndex(owner);
  if (existing) {
    try {
      index = await json<DocIndex>(`${API}files/${existing.id}?alt=media`);
    } catch {
      index = emptyIndex(owner); // קובץ פגום: מתחילים מחדש, ה-PDF עצמם לא נפגעים
    }
  }
  const next = addToIndex(index, doc, owner);
  const blob = new Blob([JSON.stringify(next, null, 2)], { type: 'application/json' });
  // עדכון התוכן שומר על אותו מזהה קובץ, כך שבני משפחה שבחרו בו ממשיכים לקבל עדכונים
  if (existing) await replaceContent(existing.id, blob);
  else await upload(blob, { name: INDEX_NAME, parents: [folderId], mimeType: 'application/json' });
}

// ===== גיבוי הגדרות בתיקייה הנסתרת של האפליקציה (appDataFolder) =====

export async function readRemoteSettings<T>(): Promise<T | null> {
  const f = await findOne(`name='${SETTINGS_NAME}'`, 'appDataFolder');
  if (!f) return null;
  return json<T>(`${API}files/${f.id}?alt=media`);
}

export async function writeRemoteSettings(settings: unknown): Promise<void> {
  const blob = new Blob([JSON.stringify(settings)], { type: 'application/json' });
  const f = await findOne(`name='${SETTINGS_NAME}'`, 'appDataFolder');
  if (f) await replaceContent(f.id, blob);
  else await upload(blob, { name: SETTINGS_NAME, parents: ['appDataFolder'], mimeType: 'application/json' });
}
