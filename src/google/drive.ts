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

/** מוצא את תיקיית המסמכים לפי שם. האפליקציה רואה רק תיקייה שהיא עצמה יצרה */
export async function findFolder(name: string): Promise<DriveFile | null> {
  return findOne(`name='${esc(name)}' and mimeType='${FOLDER_MIME}'`);
}

/** מוצא את תיקיית המסמכים, או יוצר אותה */
export async function ensureFolder(name: string): Promise<DriveFile> {
  const found = await findFolder(name);
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

async function findIndexFile(folderId: string): Promise<DriveFile | null> {
  return findOne(`name='${INDEX_NAME}' and '${folderId}' in parents`);
}

/** קורא את קובץ האינדקס שבתיקייה. אם אין (או שהוא פגום), מחזיר אינדקס ריק */
export async function readIndex(folderId: string, owner: string): Promise<DocIndex> {
  const f = await findIndexFile(folderId);
  if (!f) return emptyIndex(owner);
  try {
    const index = await json<DocIndex>(`${API}files/${f.id}?alt=media`);
    return Array.isArray(index?.docs) ? index : emptyIndex(owner);
  } catch {
    return emptyIndex(owner); // קובץ פגום: מתחילים מחדש, ה-PDF עצמם לא נפגעים
  }
}

/**
 * קורא, משנה וכותב את קובץ האינדקס. הקריאה צמודה לכתיבה, כדי לא לדרוס
 * שינוי שנעשה בינתיים ממכשיר אחר.
 */
export async function updateIndex(
  folderId: string,
  owner: string,
  change: (index: DocIndex) => DocIndex,
): Promise<DocIndex> {
  const f = await findIndexFile(folderId);
  let index = emptyIndex(owner);
  if (f) {
    try {
      const cur = await json<DocIndex>(`${API}files/${f.id}?alt=media`);
      if (Array.isArray(cur?.docs)) index = cur;
    } catch {
      /* קובץ פגום: נכתב מחדש */
    }
  }
  const next = change(index);
  const blob = new Blob([JSON.stringify(next, null, 2)], { type: 'application/json' });
  // עדכון התוכן שומר על אותו מזהה קובץ, כך שבני משפחה שבחרו בו ממשיכים לקבל עדכונים
  if (f) await replaceContent(f.id, blob);
  else await upload(blob, { name: INDEX_NAME, parents: [folderId], mimeType: 'application/json' });
  return next;
}

/** מוסיף את המסמך לקובץ האינדקס שבתיקייה (או יוצר אותו) */
export async function recordInIndex(folderId: string, owner: string, doc: IndexDoc): Promise<DocIndex> {
  return updateIndex(folderId, owner, (index) => addToIndex(index, doc, owner));
}

const MAX_OCR_TEXT = 20_000;

/**
 * זיהוי טקסט בעברית: העתקה של ה-PDF למסמך Google Docs עם OCR, ייצוא כטקסט, ומחיקת העותק.
 * זמן טיפוסי: 13-15 שניות למסמך. גוגל מזהה רק 10 עמודים ראשונים, ועד 2MB.
 */
export async function recognizeText(fileId: string, name: string): Promise<string> {
  const copy = await json<{ id: string }>(`${API}files/${fileId}/copy?ocrLanguage=he&fields=id`, {
    method: 'POST',
    body: JSON.stringify({ name: `_ocr_${name}`, mimeType: 'application/vnd.google-apps.document' }),
    headers: { 'Content-Type': 'application/json' },
  });
  try {
    const r = await googleFetch(`${API}files/${copy.id}/export?mimeType=text/plain`);
    return (await r.text()).replace(/^﻿/, '').trim().slice(0, MAX_OCR_TEXT);
  } finally {
    await googleFetch(`${API}files/${copy.id}`, { method: 'DELETE' }).catch(() => {});
  }
}

/** מוריד קובץ מהדרייב (רק קבצים שהאפליקציה יצרה, בגלל הרשאת drive.file) */
export async function downloadFile(fileId: string): Promise<Blob> {
  const r = await googleFetch(`${API}files/${fileId}?alt=media`);
  const blob = await r.blob();
  return blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
}

/** שינוי שם ותיאור (תגיות) של קובץ בדרייב */
export async function updateFileMeta(fileId: string, meta: { name?: string; description?: string }): Promise<void> {
  await googleFetch(`${API}files/${fileId}`, {
    method: 'PATCH',
    body: JSON.stringify(meta),
    headers: { 'Content-Type': 'application/json' },
  });
}

/** העברה לאשפה של הדרייב (אפשר לשחזר משם 30 יום). לא מחיקה סופית */
export async function trashFile(fileId: string): Promise<void> {
  await googleFetch(`${API}files/${fileId}`, {
    method: 'PATCH',
    body: JSON.stringify({ trashed: true }),
    headers: { 'Content-Type': 'application/json' },
  });
}

export function driveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
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
