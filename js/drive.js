// חיבור לגוגל דרייב עם הרשאת drive.file בלבד:
// האפליקציה רואה רק קבצים שהיא יצרה או שהמשתמש בחר בבורר.

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3/';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const TEST_FOLDER_NAME = 'מסמכים סרוקים (בדיקה)';

let cfg = {};
let tokenClient = null;
let accessToken = null;
let expiresAt = 0;
let user = null;

export function configure(c) {
  cfg = c;
  tokenClient = null;
}

export const currentUser = () => user;

function waitFor(test, what, timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (test()) { resolve(); return; }
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (test()) { clearInterval(iv); resolve(); }
      else if (Date.now() - t0 > timeout) { clearInterval(iv); reject(new Error(`${what} לא נטען`)); }
    }, 100);
  });
}

export async function signIn({ selectAccount = false } = {}) {
  if (!cfg.clientId) throw new Error('חסר Client ID. מלא אותו בלשונית "הגדרות".');
  await waitFor(() => window.google?.accounts?.oauth2, 'Google Identity Services');
  if (!tokenClient) {
    tokenClient = google.accounts.oauth2.initTokenClient({ client_id: cfg.clientId, scope: SCOPE, callback: () => {} });
  }
  await new Promise((resolve, reject) => {
    tokenClient.callback = resp => {
      if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
      accessToken = resp.access_token;
      expiresAt = Date.now() + (Number(resp.expires_in) - 60) * 1000;
      resolve();
    };
    tokenClient.error_callback = err => reject(new Error(err.message || err.type || 'ההתחברות בוטלה'));
    tokenClient.requestAccessToken({ prompt: selectAccount ? 'select_account' : '' });
  });
  const about = await api('about?fields=user(emailAddress,displayName)');
  user = about.user;
  document.dispatchEvent(new Event('auth-changed'));
  return user;
}

export async function signOut() {
  if (accessToken && window.google?.accounts?.oauth2) {
    await new Promise(r => google.accounts.oauth2.revoke(accessToken, r));
  }
  accessToken = null;
  expiresAt = 0;
  user = null;
  document.dispatchEvent(new Event('auth-changed'));
}

export async function ensureToken() {
  if (accessToken && Date.now() < expiresAt) return accessToken;
  await signIn();
  return accessToken;
}

async function api(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const token = await ensureToken();
  const url = path.startsWith('http') ? path : API + path;
  const r = await fetch(url, { method, body, headers: { Authorization: `Bearer ${token}`, ...headers } });
  if (!r.ok) {
    let msg = `${r.status}`;
    try { const j = await r.json(); msg += `: ${j.error?.message || JSON.stringify(j)}`; } catch {}
    const e = new Error(msg);
    e.status = r.status;
    throw e;
  }
  if (raw) return r;
  if (r.status === 204) return null;
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

const json = (method, obj) => ({ method, body: JSON.stringify(obj), headers: { 'Content-Type': 'application/json' } });
const q = s => encodeURIComponent(s);
const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export async function uploadFile(blob, name, { mimeType, parents, query = '' } = {}) {
  const meta = { name };
  if (mimeType) meta.mimeType = mimeType;
  if (parents) meta.parents = parents;
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  form.append('file', blob);
  return api(`${UPLOAD}?uploadType=multipart&fields=id,name,webViewLink,size${query}`, { method: 'POST', body: form });
}

export async function updateContent(fileId, blob) {
  return api(`${UPLOAD}/${fileId}?uploadType=media&fields=id,name`, { method: 'PATCH', body: blob, headers: { 'Content-Type': blob.type } });
}

export async function findFolder(name) {
  const res = await api(`files?q=${q(`name='${esc(name)}' and mimeType='${FOLDER_MIME}' and trashed=false`)}&fields=files(id,name,webViewLink)`);
  return res.files[0] || null;
}

export async function createFolder(name) {
  return api('files?fields=id,name,webViewLink', json('POST', { name, mimeType: FOLDER_MIME }));
}

export async function ensureFolder(name) {
  return (await findFolder(name)) || createFolder(name);
}

export async function listChildren(folderId) {
  const res = await api(`files?q=${q(`'${folderId}' in parents and trashed=false`)}`
    + '&fields=files(id,name,mimeType,size,webViewLink,createdTime)&orderBy=createdTime desc&pageSize=100'
    + '&supportsAllDrives=true&includeItemsFromAllDrives=true');
  return res.files;
}

export async function getMeta(fileId) {
  return api(`files/${fileId}?fields=id,name,mimeType,size,webViewLink,owners(emailAddress)&supportsAllDrives=true`);
}

export async function download(fileId) {
  const r = await api(`files/${fileId}?alt=media&supportsAllDrives=true`, { raw: true });
  return r.blob();
}

// זיהוי טקסט: העתקה של ה-PDF למסמך Google Docs עם OCR בעברית, ייצוא כטקסט, מחיקת העותק.
// אם ההעתקה לא נתמכת, מעלים את הקובץ מחדש עם המרה.
export async function ocrToText(fileId, blob, name) {
  let docId;
  let method;
  try {
    const copy = await api(`files/${fileId}/copy?ocrLanguage=he&fields=id`,
      json('POST', { name: `_ocr_${name}`, mimeType: 'application/vnd.google-apps.document' }));
    docId = copy.id;
    method = 'העתקה עם המרה';
  } catch (e) {
    const up = await uploadFile(blob, `_ocr_${name}`, { mimeType: 'application/vnd.google-apps.document', query: '&ocrLanguage=he' });
    docId = up.id;
    method = `העלאה עם המרה (ההעתקה נכשלה: ${e.message})`;
  }
  try {
    const text = await api(`files/${docId}/export?mimeType=text/plain`);
    return { text: String(text).replace(/^﻿/, '').trim(), method };
  } finally {
    await api(`files/${docId}`, { method: 'DELETE' }).catch(() => {});
  }
}

export async function shareWith(fileId, email) {
  return api(`files/${fileId}/permissions?sendNotificationEmail=true&fields=id,emailAddress,role`,
    json('POST', { role: 'reader', type: 'user', emailAddress: email }));
}

export async function unshare(fileId, email) {
  const res = await api(`files/${fileId}/permissions?fields=permissions(id,emailAddress,role)`);
  const p = res.permissions.find(x => (x.emailAddress || '').toLowerCase() === email.toLowerCase());
  if (!p) return false;
  await api(`files/${fileId}/permissions/${p.id}`, { method: 'DELETE' });
  return true;
}

// ===== Google Picker =====

let pickerLoaded = null;

function loadPicker() {
  if (!pickerLoaded) {
    pickerLoaded = waitFor(() => window.gapi, 'Google API')
      .then(() => new Promise(resolve => gapi.load('picker', { callback: resolve })));
  }
  return pickerLoaded;
}

// kind: 'folder' | 'index'. מחזיר מערך של מסמכים שנבחרו ({id, name, mimeType, ...})
export async function pick(kind) {
  if (!cfg.apiKey || !cfg.appId) throw new Error('חסרים API key או App ID בלשונית "הגדרות".');
  const token = await ensureToken();
  await loadPicker();
  return new Promise(resolve => {
    const P = google.picker;
    const builder = new P.PickerBuilder()
      .setOAuthToken(token)
      .setDeveloperKey(cfg.apiKey)
      .setAppId(cfg.appId)
      .setLocale('iw')
      .setTitle(kind === 'folder' ? 'בחר את התיקייה ששותפה איתך' : 'בחר את קובץ _index.json')
      .setCallback(data => {
        const action = data[P.Response.ACTION];
        if (action === P.Action.PICKED) resolve(data[P.Response.DOCUMENTS]);
        else if (action === P.Action.CANCEL) resolve([]);
      });
    if (kind === 'folder') {
      builder.addView(new P.DocsView(P.ViewId.FOLDERS).setSelectFolderEnabled(true).setOwnedByMe(false));
      builder.addView(new P.DocsView(P.ViewId.FOLDERS).setSelectFolderEnabled(true));
    } else {
      builder.addView(new P.DocsView(P.ViewId.DOCS).setOwnedByMe(false).setQuery('_index.json'));
      builder.addView(new P.DocsView(P.ViewId.DOCS).setQuery('_index.json'));
    }
    builder.build().setVisible(true);
  });
}
