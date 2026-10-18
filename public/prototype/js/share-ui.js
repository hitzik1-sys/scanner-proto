import { $, dateStamp, kb, logTo, report } from './util.js';
import { buildPdf } from './pdf.js';
import { makeSamplePage } from './sample.js';
import * as drive from './drive.js';

const log = (msg, kind) => logTo($('#share-log'), msg, kind);
let folder = null;

export function initShare() {
  $('#btn-share-setup').onclick = () => guarded('#btn-share-setup', setupFolder);
  $('#btn-share-grant').onclick = () => guarded('#btn-share-grant', grant);
  $('#btn-share-revoke').onclick = () => guarded('#btn-share-revoke', revoke);
  $('#btn-pick-folder').onclick = () => guarded('#btn-pick-folder', testFolder);
  $('#btn-pick-index').onclick = () => guarded('#btn-pick-index', testIndex);
}

async function guarded(sel, fn) {
  const btn = $(sel);
  btn.disabled = true;
  try { await fn(); } catch (e) { log(e.message, 'fail'); } finally { btn.disabled = false; }
}

// ===== צד המשתף =====

async function setupFolder() {
  folder = await drive.ensureFolder(drive.TEST_FOLDER_NAME);
  log(`תיקייה: ${folder.name}`, 'ok');
  let kids = await drive.listChildren(folder.id);
  let pdfs = kids.filter(f => f.mimeType === 'application/pdf');
  if (!pdfs.length) {
    const pdf = await buildPdf([makeSamplePage()]);
    await drive.uploadFile(pdf, `${dateStamp()}_מסמך דוגמה.pdf`, { parents: [folder.id] });
    log('הועלה מסמך דוגמה', 'ok');
    kids = await drive.listChildren(folder.id);
    pdfs = kids.filter(f => f.mimeType === 'application/pdf');
  }

  let ocr = {};
  try { ocr = JSON.parse(localStorage.getItem('proto-ocr') || '{}'); } catch {}
  const index = {
    version: 1,
    owner: drive.currentUser()?.emailAddress || '',
    updatedAt: new Date().toISOString(),
    docs: pdfs.map(f => ({
      id: f.id,
      name: f.name,
      date: f.createdTime.slice(0, 10),
      title: f.name.replace(/^\d{8}_/, '').replace(/\.pdf$/i, ''),
      tags: ['בדיקה'],
      ocrText: ocr[f.id] || '',
      createdAt: f.createdTime,
    })),
  };
  const blob = new Blob([JSON.stringify(index, null, 2)], { type: 'application/json' });
  const existing = kids.find(f => f.name === '_index.json');
  if (existing) await drive.updateContent(existing.id, blob);
  else await drive.uploadFile(blob, '_index.json', { parents: [folder.id] });
  log(`_index.json נכתב: ${index.docs.length} מסמכים, ${kb(blob.size)}`, 'ok');

  const el = $('#share-folder');
  el.replaceChildren();
  const a = document.createElement('a');
  a.href = folder.webViewLink;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = `פתח את "${folder.name}" בדרייב`;
  el.append(a, document.createTextNode(` · ${pdfs.length} קבצי PDF`));
  report('הכנת תיקייה + אינדקס (משתף)', true, `${pdfs.length} PDF, אינדקס ${kb(blob.size)}`);
}

async function grant() {
  const email = $('#share-email').value.trim();
  if (!email) { alert('הקלד את המייל של בן המשפחה.'); return; }
  if (!folder) await setupFolder();
  try {
    await drive.shareWith(folder.id, email);
    log(`שותף לצפייה עם ${email}. גוגל שולחת לו מייל.`, 'ok');
    report('שיתוף תיקייה לצפייה', true, '');
  } catch (e) {
    log(e.message, 'fail');
    report('שיתוף תיקייה לצפייה', false, e.message);
  }
}

async function revoke() {
  const email = $('#share-email').value.trim();
  if (!email) { alert('הקלד את המייל.'); return; }
  folder = folder || await drive.findFolder(drive.TEST_FOLDER_NAME);
  if (!folder) { log('לא נמצאה תיקיית בדיקה', 'fail'); return; }
  const removed = await drive.unshare(folder.id, email);
  log(removed ? `השיתוף עם ${email} בוטל` : `${email} לא נמצא ברשימת השיתוף`, removed ? 'ok' : 'fail');
  report('ביטול שיתוף', removed, '');
}

// ===== צד המקבל =====

function result(ok, text, link) {
  const li = document.createElement('li');
  li.className = ok ? 'ok' : 'fail';
  li.textContent = `${ok ? '✓' : '✗'} ${text}`;
  if (link) {
    const a = document.createElement('a');
    a.href = link;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = ' · פתח בדרייב';
    li.append(a);
  }
  $('#share-results').append(li);
}

async function readIndex(fileId) {
  const blob = await drive.download(fileId);
  return JSON.parse(await blob.text());
}

async function tryPdf(id, name, testName) {
  try {
    const blob = await drive.download(id);
    result(true, `הורדת PDF דרך האפליקציה: ${name} (${kb(blob.size)})`);
    report(testName, true, kb(blob.size));
    return true;
  } catch (e) {
    result(false, `הורדת PDF דרך האפליקציה נכשלה: ${e.message}`, `https://drive.google.com/file/d/${id}/view`);
    report(testName, false, e.message);
    return false;
  }
}

async function testFolder() {
  const picked = await drive.pick('folder');
  if (!picked.length) { log('הבחירה בוטלה'); return; }
  const f = picked[0];
  $('#share-results').replaceChildren();
  log(`נבחרה תיקייה: ${f.name}`);

  let kids = [];
  try {
    kids = await drive.listChildren(f.id);
    const ok = kids.length > 0;
    result(ok, ok ? `רשימת הקבצים בתיקייה: ${kids.length} קבצים` : 'הרשימה ריקה: אין לאפליקציה גישה לתוכן התיקייה');
    report('מקבל: רשימת קבצים בתיקייה שנבחרה', ok, `${kids.length} קבצים`);
  } catch (e) {
    result(false, `רשימת הקבצים נכשלה: ${e.message}`);
    report('מקבל: רשימת קבצים בתיקייה שנבחרה', false, e.message);
  }

  const idx = kids.find(k => k.name === '_index.json');
  if (idx) {
    try {
      const index = await readIndex(idx.id);
      result(true, `קריאת האינדקס: ${index.docs.length} מסמכים של ${index.owner}`);
      report('מקבל: קריאת אינדקס מתוך תיקייה', true, `${index.docs.length} מסמכים`);
    } catch (e) {
      result(false, `קריאת האינדקס נכשלה: ${e.message}`);
      report('מקבל: קריאת אינדקס מתוך תיקייה', false, e.message);
    }
  } else if (kids.length) {
    result(false, 'האינדקס לא נמצא בתיקייה');
  }

  const pdf = kids.find(k => k.mimeType === 'application/pdf');
  if (pdf) await tryPdf(pdf.id, pdf.name, 'מקבל: הורדת PDF מתוך תיקייה');

  if (!kids.length) log('נסה עכשיו את "בחר את קובץ האינדקס", זו החלופה.');
}

async function testIndex() {
  const picked = await drive.pick('index');
  if (!picked.length) { log('הבחירה בוטלה'); return; }
  const f = picked[0];
  $('#share-results').replaceChildren();
  log(`נבחר קובץ: ${f.name}`);

  let index;
  try {
    index = await readIndex(f.id);
    result(true, `קריאת האינדקס: ${index.docs.length} מסמכים של ${index.owner}`);
    report('מקבל: קריאת אינדקס שנבחר ישירות', true, `${index.docs.length} מסמכים`);
  } catch (e) {
    result(false, `קריאת האינדקס נכשלה: ${e.message}`);
    report('מקבל: קריאת אינדקס שנבחר ישירות', false, e.message);
    return;
  }

  const withText = index.docs.filter(d => d.ocrText).length;
  result(true, `${withText} מתוך ${index.docs.length} מסמכים כוללים טקסט מזוהה לחיפוש`);

  const doc = index.docs[0];
  if (doc) {
    const ok = await tryPdf(doc.id, doc.name, 'מקבל: הורדת PDF לפי מזהה מהאינדקס');
    if (!ok) {
      result(true, 'צפוי: האפליקציה לא בחרה את הקובץ הזה. הקישור לדרייב עובד דרך ההרשאה של המשתמש עצמו.',
        `https://drive.google.com/file/d/${doc.id}/view`);
    }
  }
}
