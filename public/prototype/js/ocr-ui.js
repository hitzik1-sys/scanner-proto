import { $, state, dateStamp, ms, kb, logTo, loadScript, report } from './util.js';
import { buildPdf } from './pdf.js';
import { makeSamplePage } from './sample.js';
import * as drive from './drive.js';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

// המסמך שנבדק כרגע
const src = { blob: null, name: null, images: [], label: '' };

const log = (msg, kind) => logTo($('#ocr-log'), msg, kind);

export function initOcr() {
  $('#btn-ocr-from-scan').onclick = useScan;
  $('#btn-ocr-sample').onclick = async () => {
    const page = makeSamplePage();
    setSource(await buildPdf([page]), `${dateStamp()}_מסמך דוגמה.pdf`, [page], 'מסמך דוגמה (טקסט מודפס נקי)');
  };
  $('#ocr-file').onchange = async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.type === 'application/pdf') {
      setSource(f, f.name, [], `קובץ: ${f.name} (Tesseract לא זמין ל-PDF בבדיקה הזו)`);
    } else {
      const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      setSource(await buildPdf([c]), `${dateStamp()}_${f.name.replace(/\.\w+$/, '')}.pdf`, [c], `תמונה: ${f.name}`);
    }
  };
  $('#btn-ocr-drive').onclick = runDrive;
  $('#btn-ocr-tess').onclick = runTesseract;
}

export function onShowOcr(opts = {}) {
  if (opts.fromScan || (!src.blob && state.pdfBlob)) useScan();
}

function useScan() {
  if (!state.pdfBlob) { alert('אין עדיין PDF מהסריקה. סרוק מסמך בלשונית 1.'); return; }
  setSource(state.pdfBlob, state.pdfName, [...state.pages], `מהסריקה: ${state.pdfName}`);
}

function setSource(blob, name, images, label) {
  Object.assign(src, { blob, name, images, label });
  $('#ocr-source').textContent = `${label} · ${kb(blob.size)}`;
  $('#btn-ocr-tess').disabled = !images.length;
}

const hebrewCount = t => (t.match(/[א-ת]/g) || []).length;

async function runDrive() {
  if (!src.blob) { alert('בחר קודם מסמך.'); return; }
  const btn = $('#btn-ocr-drive');
  btn.disabled = true;
  $('#ocr-drive-text').value = '';
  try {
    const tAll = performance.now();
    let t = performance.now();
    const folder = await drive.ensureFolder(drive.TEST_FOLDER_NAME);
    log(`תיקייה: ${folder.name}`);
    const up = await drive.uploadFile(src.blob, src.name, { parents: [folder.id] });
    log(`הועלה ${src.name} (${ms(t)}ms)`, 'ok');

    t = performance.now();
    log('ממיר עם זיהוי עברית…');
    const { text, method } = await drive.ocrToText(up.id, src.blob, src.name);
    const total = ms(tAll);
    log(`זיהוי הסתיים (${ms(t)}ms) · שיטה: ${method}`, 'ok');

    $('#ocr-drive-text').value = text;
    const heb = hebrewCount(text);
    $('#ocr-drive-stat').textContent = `${total}ms סה"כ · ${text.length} תווים · ${heb} אותיות עבריות`;
    report('OCR דרך דרייב', heb > 0, `${src.label}; ${total}ms; ${text.length} תווים; ${heb} עבריות; ${method}`);

    // נשמר כדי שבדיקת השיתוף תכלול טקסט אמיתי באינדקס
    saveOcrText(up.id, text);
  } catch (e) {
    log(e.message, 'fail');
    report('OCR דרך דרייב', false, e.message);
  } finally {
    btn.disabled = false;
  }
}

function saveOcrText(id, text) {
  try {
    const map = JSON.parse(localStorage.getItem('proto-ocr') || '{}');
    map[id] = text.slice(0, 20000);
    localStorage.setItem('proto-ocr', JSON.stringify(map));
  } catch {}
}

async function runTesseract() {
  if (!src.images.length) return;
  const btn = $('#btn-ocr-tess');
  btn.disabled = true;
  $('#ocr-tess-text').value = '';
  try {
    let t = performance.now();
    if (!window.Tesseract) {
      log('טוען Tesseract…');
      await loadScript(TESSERACT_URL);
    }
    const worker = await Tesseract.createWorker('heb', 1, {
      logger: m => { if (m.status) $('#ocr-tess-stat').textContent = `${m.status} ${Math.round((m.progress || 0) * 100)}%`; },
    });
    const loadMs = ms(t);
    log(`Tesseract + עברית נטענו (${loadMs}ms)`, 'ok');
    t = performance.now();
    const texts = [];
    for (const [i, img] of src.images.entries()) {
      const { data } = await worker.recognize(img);
      texts.push(data.text.trim());
      log(`עמוד ${i + 1}: ${Math.round(data.confidence)}% ביטחון`);
    }
    await worker.terminate();
    const text = texts.join('\n\n');
    const runMs = ms(t);
    const heb = hebrewCount(text);
    $('#ocr-tess-text').value = text;
    $('#ocr-tess-stat').textContent = `טעינה ${loadMs}ms · זיהוי ${runMs}ms · ${heb} אותיות עבריות`;
    report('OCR עם Tesseract בטלפון', heb > 0, `${src.label}; טעינה ${loadMs}ms; זיהוי ${runMs}ms; ${heb} עבריות`);
  } catch (e) {
    log(e.message, 'fail');
    report('OCR עם Tesseract בטלפון', false, e.message);
  } finally {
    btn.disabled = false;
  }
}
