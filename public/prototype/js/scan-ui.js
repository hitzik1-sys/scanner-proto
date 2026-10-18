import { $, state, dateStamp, ms, kb, downloadBlob, canvasToBlob, report } from './util.js';
import { loadOpenCV, detectQuad, fullQuad, warpQuad, enhance, rotate90 } from './cv.js';
import { buildPdf } from './pdf.js';
import { makeSamplePhoto } from './sample.js';

const STEPS = ['start', 'camera', 'crop', 'result', 'review', 'pages'];
const MAX_PHOTO_SIDE = 3000;

let stream = null;
let loopTimer = null;
let lastQuad = null;
let stableSince = 0;
let autoMode = false;
let capturing = false;
let armed = true;        // מצב אוטומטי: אחרי צילום מחכים שהדף יוחלף
let shotQuad = null;
let detectTimes = [];
let camStart = 0;        // מאיזה עמוד התחיל הצילום הנוכחי

let cropSource = null;   // canvas בגודל מלא
let cropQuad = null;     // 4 נקודות בקואורדינטות המקור
let cropView = { s: 1 }; // יחס תצוגה
let dragIdx = null;

let resultBase = null;   // אחרי יישור, לפני פילטר
let lastFilter = 'gray'; // הפילטר האחרון שנבחר, ברירת מחדל לעמוד הבא

// כל העמודים של המסמך הנוכחי. התמונה המקורית נשמרת כקובץ דחוס (blob)
// כדי לחסוך זיכרון, ומפוענחת מחדש רק כשעורכים את העמוד.
// { blob, quad, filter, rotation, out (canvas סופי), thumb }
let batch = [];
let editIdx = 0;
let seqEnd = 0;          // עריכה ברצף: עד איזה עמוד (לא כולל)
let single = false;      // עריכת עמוד בודד מתוך רשימת העמודים
let openToken = 0;

function step(name) {
  for (const s of STEPS) $(`#scan-${s}`).hidden = s !== name;
  if (name === 'review') renderReview();
}

export function initScan() {
  const t0 = performance.now();
  loadOpenCV().then(() => {
    const t = ms(t0);
    $('#cv-status').textContent = `OpenCV מוכן (${(t / 1000).toFixed(1)} שניות)`;
    $('#btn-camera').disabled = false;
    $('#btn-sample').disabled = false;
    report('טעינת OpenCV', true, `${t}ms`);
  }).catch(e => {
    $('#cv-status').textContent = e.message;
    report('טעינת OpenCV', false, e.message);
  });

  $('#btn-camera').onclick = openCamera;
  $('#btn-more-camera').onclick = openCamera;
  $('#file-input').onchange = addFiles;
  $('#file-input-more').onchange = addFiles;
  $('#btn-sample').onclick = async () => {
    const blob = await canvasToBlob(makeSamplePhoto(), 'image/jpeg', 0.92);
    startSequence(addPages([blob]));
  };

  $('#btn-capture').onclick = capture;
  $('#btn-auto-mode').onclick = () => setAutoMode(!autoMode);
  $('#btn-cam-done').onclick = cameraDone;

  $('#btn-redetect').onclick = () => {
    const t = performance.now();
    const q = detectQuad(cropSource, 1000);
    cropQuad = q || fullQuad(cropSource, 0.05);
    $('#crop-stat').textContent = q ? `זוהה מחדש (${ms(t)}ms)` : 'לא זוהה דף, סמן ידנית';
    drawCrop();
  };
  $('#btn-crop-full').onclick = () => { cropQuad = fullQuad(cropSource); drawCrop(); };
  $('#btn-crop-ok').onclick = applyCrop;
  for (const b of document.querySelectorAll('.btn-delete-page')) b.onclick = deletePage;

  $('#filter').onchange = () => renderResult();
  $('#btn-rotate').onclick = () => { batch[editIdx].rotation++; renderResult(); };
  $('#btn-back-crop').onclick = () => { step('crop'); drawCrop(); };
  $('#btn-page-next').onclick = nextPage;

  $('#btn-finish').onclick = finish;
  $('#btn-discard').onclick = () => { if (confirm('לבטל את כל העמודים שנסרקו?')) newScan(); };

  $('#btn-share-pdf').onclick = sharePdf;
  $('#btn-download-pdf').onclick = () => downloadBlob(state.pdfBlob, state.pdfName);
  $('#btn-edit-pages').onclick = () => step('review');
  $('#btn-to-ocr').onclick = () => window.app.showTab('ocr', { fromScan: true });
  $('#btn-new-scan').onclick = newScan;

  setupCropPointer();
  window.addEventListener('resize', () => { if (!$('#scan-crop').hidden) drawCrop(); });
  // סיבוב הטלפון משנה את המקום הפנוי ואת מידות הווידאו
  new ResizeObserver(fitVideo).observe($('.cam-stage'));
  $('#video').addEventListener('resize', fitVideo);
}

function newScan() {
  batch = [];
  state.pages = []; state.pdfBlob = null; state.pdfName = null;
  $('#doc-title').value = '';
  step('start');
}

// מוסיף עמודים לסוף המסמך ומחזיר את המיקום של הראשון שבהם
function addPages(blobs) {
  const from = batch.length;
  for (const blob of blobs) batch.push({ blob, quad: null, filter: null, rotation: 0, out: null, thumb: null });
  return from;
}

async function addFiles(e) {
  const files = [...e.target.files];
  e.target.value = '';
  if (!files.length) return;
  report('בחירה מהגלריה', true, `${files.length} תמונות`);
  await loadOpenCV();
  startSequence(addPages(files));
}

async function decode(blob) {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const c = toCanvas(bmp);
  bmp.close?.();
  return c;
}

function toCanvas(src) {
  const w0 = src.width, h0 = src.height;
  const k = Math.min(1, MAX_PHOTO_SIDE / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * k);
  c.height = Math.round(h0 * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// ===== מצלמה =====

async function openCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
  } catch (e) {
    alert(`אין גישה למצלמה: ${e.message}`);
    report('פתיחת מצלמה', false, e.message);
    return;
  }
  const v = $('#video');
  v.srcObject = stream;
  await v.play();
  detectTimes = [];
  capturing = false;
  camStart = batch.length;
  step('camera');
  fitVideo();
  const s = stream.getVideoTracks()[0].getSettings();
  report('פתיחת מצלמה', true, `${s.width}x${s.height}`);
  setAutoMode(false);
}

// הווידאו בגודל המקסימלי שנכנס במקום הפנוי, בלי לעוות ובלי לחתוך
function fitVideo() {
  const v = $('#video');
  const stage = $('.cam-stage');
  if (!v.videoWidth || $('#scan-camera').hidden) return;
  const k = Math.min(stage.clientWidth / v.videoWidth, stage.clientHeight / v.videoHeight);
  v.style.width = `${Math.floor(v.videoWidth * k)}px`;
  v.style.height = `${Math.floor(v.videoHeight * k)}px`;
}

// מצב ידני (ברירת מחדל): המשתמש לוחץ "צלם", והזיהוי קורה רק אחרי הצילום.
// מצב אוטומטי: זיהוי חי של הדף וצילום אוטומטי כשהוא יציב.
function setAutoMode(on) {
  autoMode = on;
  clearTimeout(loopTimer);
  lastQuad = null;
  stableSince = 0;
  armed = true;
  const ov = $('#overlay');
  ov.getContext('2d').clearRect(0, 0, ov.width, ov.height);
  $('#btn-auto-mode').textContent = on ? 'מצב ידני' : 'מצב אוטומטי';
  updateCamStatus();
  if (on) tick();
}

function shotCount() { return batch.length - camStart; }

function updateCamStatus(extra) {
  const n = shotCount();
  $('#btn-cam-done').textContent = n ? `סיום (${n})` : 'ביטול';
  const hint = autoMode ? 'מחפש דף…' : 'כוון את המצלמה אל המסמך ולחץ "צלם"';
  $('#det-stat').textContent = (n ? `צולמו ${n} עמודים · ` : '') + (extra || hint);
}

// סיום צילום: עוברים לעריכת כל העמודים שצולמו, אחד אחרי השני
function cameraDone() {
  const n = shotCount();
  stopCamera();
  if (n) {
    report('צילום כמה עמודים ברצף', true, `${n} עמודים`);
    startSequence(camStart);
  } else step(batch.length ? 'review' : 'start');
}

function stopCamera() {
  clearTimeout(loopTimer);
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
  if (detectTimes.length) {
    const avg = Math.round(detectTimes.reduce((a, b) => a + b, 0) / detectTimes.length);
    report('זיהוי חי במצלמה', true, `ממוצע ${avg}ms לפריים (${detectTimes.length} פריימים)`);
  }
}

function tick() {
  if (!stream || !autoMode) return;
  const v = $('#video');
  const ov = $('#overlay');
  if (v.videoWidth && !capturing) {
    const t0 = performance.now();
    const q = detectQuad(v, 480);
    const dt = ms(t0);
    detectTimes.push(dt);

    const dpr = window.devicePixelRatio || 1;
    ov.width = v.clientWidth * dpr;
    ov.height = v.clientHeight * dpr;
    const s = ov.width / v.videoWidth;
    const x = ov.getContext('2d');
    x.clearRect(0, 0, ov.width, ov.height);

    const stable = q && lastQuad && maxShift(q, lastQuad) < 0.02 * Math.hypot(v.videoWidth, v.videoHeight);
    if (q) {
      x.beginPath();
      q.forEach((p, i) => (i ? x.lineTo(p.x * s, p.y * s) : x.moveTo(p.x * s, p.y * s)));
      x.closePath();
      x.fillStyle = stable ? 'rgba(46,160,67,.25)' : 'rgba(31,95,191,.2)';
      x.fill();
      x.lineWidth = 3 * dpr;
      x.strokeStyle = stable ? '#2ea043' : '#5b9bff';
      x.stroke();
    }

    // אחרי צילום, לא מצלמים שוב עד שהדף זז או הוחלף
    if (!armed && (!q || maxShift(q, shotQuad) > 0.15 * Math.hypot(v.videoWidth, v.videoHeight))) armed = true;
    const now = performance.now();
    if (stable && armed) { if (!stableSince) stableSince = now; } else stableSince = 0;
    const left = stableSince ? Math.max(0, 1500 - (now - stableSince)) : null;
    updateCamStatus(`זיהוי: ${dt}ms לפריים · `
      + (!armed ? 'צולם. החלף לדף הבא' : q ? (stable ? 'הדף יציב' : 'נמצא דף') : 'מחפש דף…')
      + (left !== null ? ` · מצלם בעוד ${(left / 1000).toFixed(1)}` : ''));
    lastQuad = q;
    if (stableSince && now - stableSince > 1500) { capture(); }
  }
  loopTimer = setTimeout(tick, 150);
}

function maxShift(a, b) {
  return Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));
}

// המצלמה נשארת פתוחה אחרי כל צילום, כדי לצלם את כל העמודים ברצף
async function capture() {
  if (capturing || !stream) return;
  capturing = true;
  const v = $('#video');
  let blob = null;
  let how = 'פריים מהווידאו';
  try {
    if ('ImageCapture' in window) {
      blob = await new ImageCapture(stream.getVideoTracks()[0]).takePhoto();
      how = 'צילום מלא (takePhoto)';
    }
  } catch { blob = null; }
  if (!blob) {
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    blob = await canvasToBlob(c, 'image/jpeg', 0.92);
  }
  addPages([blob]);
  if (shotCount() === 1) report('צילום', true, how);
  shotQuad = lastQuad;
  armed = !autoMode;
  stableSince = 0;
  const stage = $('.cam-stage');
  stage.classList.remove('flash');
  void stage.offsetWidth;
  stage.classList.add('flash');
  updateCamStatus(autoMode ? 'צולם. החלף לדף הבא' : 'צולם. אפשר לצלם את העמוד הבא');
  capturing = false;
}

// ===== עריכת העמודים, אחד אחרי השני =====

function startSequence(from) {
  single = false;
  seqEnd = batch.length;
  openPage(from);
}

function editSingle(i) {
  single = true;
  openPage(i);
}

function pageLabel() {
  const t = `עמוד ${editIdx + 1} מתוך ${batch.length}`;
  for (const el of document.querySelectorAll('.page-of')) el.textContent = single ? `עריכת ${t}` : t;
  $('#btn-page-next').textContent = single ? 'שמור' : editIdx + 1 >= seqEnd ? 'סיום' : 'הבא ←';
}

async function openPage(i) {
  editIdx = i;
  const page = batch[i];
  const token = ++openToken;
  pageLabel();
  $('#crop-stat').textContent = 'טוען…';
  const canvas = await decode(page.blob);
  if (token !== openToken) return;
  cropSource = canvas;
  if (page.quad) {
    cropQuad = page.quad.map(p => ({ ...p }));
    $('#crop-stat').textContent = `${canvas.width}x${canvas.height}`;
  } else {
    const t0 = performance.now();
    const q = detectQuad(canvas, 1000);
    const dt = ms(t0);
    cropQuad = q || fullQuad(canvas, 0.05);
    $('#crop-stat').textContent = `${canvas.width}x${canvas.height} · ${q ? `דף זוהה (${dt}ms)` : 'לא זוהה דף, סמן ידנית'}`;
    report('זיהוי פינות', !!q, `${canvas.width}x${canvas.height}, ${dt}ms`);
  }
  step('crop');
  drawCrop();
}

function nextPage() {
  if (single || editIdx + 1 >= seqEnd) { step('review'); return; }
  openPage(editIdx + 1);
}

function deletePage() {
  if (!confirm(`למחוק את עמוד ${editIdx + 1}?`)) return;
  batch.splice(editIdx, 1);
  if (!batch.length) { newScan(); return; }
  if (single) { step('review'); return; }
  seqEnd--;
  if (editIdx >= seqEnd) step('review');
  else openPage(editIdx);
}

// ===== חיתוך =====

function drawCrop() {
  const c = $('#crop-canvas');
  const dpr = window.devicePixelRatio || 1;
  const maxW = c.parentElement.clientWidth;
  const maxH = window.innerHeight * 0.62;
  const s = Math.min(maxW / cropSource.width, maxH / cropSource.height);
  const cssW = Math.round(cropSource.width * s), cssH = Math.round(cropSource.height * s);
  c.style.width = `${cssW}px`;
  c.style.height = `${cssH}px`;
  c.width = cssW * dpr;
  c.height = cssH * dpr;
  cropView = { s: s * dpr, dpr };
  const k = cropView.s;
  const x = c.getContext('2d');
  x.drawImage(cropSource, 0, 0, c.width, c.height);

  // החשכה מחוץ לדף
  x.beginPath();
  x.rect(0, 0, c.width, c.height);
  cropQuad.forEach((p, i) => (i ? x.lineTo(p.x * k, p.y * k) : x.moveTo(p.x * k, p.y * k)));
  x.closePath();
  x.fillStyle = 'rgba(0,0,0,.45)';
  x.fill('evenodd');

  x.beginPath();
  cropQuad.forEach((p, i) => (i ? x.lineTo(p.x * k, p.y * k) : x.moveTo(p.x * k, p.y * k)));
  x.closePath();
  x.lineWidth = 2.5 * dpr;
  x.strokeStyle = '#5b9bff';
  x.stroke();

  cropQuad.forEach((p, i) => {
    x.beginPath();
    x.arc(p.x * k, p.y * k, (i === dragIdx ? 16 : 12) * dpr, 0, Math.PI * 2);
    x.fillStyle = 'rgba(255,255,255,.85)';
    x.fill();
    x.lineWidth = 3 * dpr;
    x.strokeStyle = '#1f5fbf';
    x.stroke();
  });

  if (dragIdx !== null) drawLoupe(x, cropQuad[dragIdx], dpr);
}

// זכוכית מגדלת בפינה הנגדית לאצבע
function drawLoupe(x, p, dpr) {
  const c = x.canvas;
  const r = 60 * dpr;
  const zoom = 2.5;
  const k = cropView.s;
  const onLeft = p.x * k > c.width / 2;
  const cx = onLeft ? r + 10 * dpr : c.width - r - 10 * dpr;
  const cy = r + 10 * dpr;
  const srcR = r / (k * zoom);
  x.save();
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.clip();
  x.fillStyle = '#000';
  x.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  x.drawImage(cropSource, p.x - srcR, p.y - srcR, srcR * 2, srcR * 2, cx - r, cy - r, 2 * r, 2 * r);
  x.strokeStyle = '#ff3b30';
  x.lineWidth = 1.5 * dpr;
  x.beginPath();
  x.moveTo(cx - 12 * dpr, cy); x.lineTo(cx + 12 * dpr, cy);
  x.moveTo(cx, cy - 12 * dpr); x.lineTo(cx, cy + 12 * dpr);
  x.stroke();
  x.restore();
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.lineWidth = 3 * dpr;
  x.strokeStyle = '#fff';
  x.stroke();
}

function setupCropPointer() {
  const c = $('#crop-canvas');
  const toSrc = e => {
    const r = c.getBoundingClientRect();
    return {
      x: Math.min(cropSource.width, Math.max(0, (e.clientX - r.left) / r.width * cropSource.width)),
      y: Math.min(cropSource.height, Math.max(0, (e.clientY - r.top) / r.height * cropSource.height)),
    };
  };
  c.addEventListener('pointerdown', e => {
    const p = toSrc(e);
    const cssScale = cropView.s / cropView.dpr;
    let best = null, bestD = 40; // רדיוס תפיסה, בפיקסלי מסך
    cropQuad.forEach((q, i) => {
      const d = Math.hypot(q.x - p.x, q.y - p.y) * cssScale;
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best === null) return;
    dragIdx = best;
    c.setPointerCapture(e.pointerId);
    e.preventDefault();
    drawCrop();
  });
  c.addEventListener('pointermove', e => {
    if (dragIdx === null) return;
    cropQuad[dragIdx] = toSrc(e);
    drawCrop();
  });
  const end = () => { if (dragIdx !== null) { dragIdx = null; drawCrop(); } };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
}

function applyCrop() {
  const page = batch[editIdx];
  const t0 = performance.now();
  page.quad = cropQuad.map(p => ({ ...p }));
  resultBase = warpQuad(cropSource, cropQuad);
  const warpMs = ms(t0);
  $('#filter').value = page.filter || lastFilter;
  step('result');
  renderResult(warpMs);
}

function renderResult(warpMs) {
  const page = batch[editIdx];
  const t0 = performance.now();
  page.filter = lastFilter = $('#filter').value;
  page.out = rotate90(enhance(resultBase, page.filter), page.rotation);
  page.thumb = makeThumb(page.out);
  $('#result-wrap').replaceChildren(page.out);
  $('#result-stat').textContent = `${page.out.width}x${page.out.height}`
    + (typeof warpMs === 'number' ? ` · יישור ${warpMs}ms` : '')
    + ` · פילטר ${ms(t0)}ms`;
}

function makeThumb(c) {
  const t = document.createElement('canvas');
  const k = 240 / c.height;
  t.width = Math.round(c.width * k);
  t.height = 240;
  t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.7);
}

// ===== רשימת העמודים =====

function renderReview() {
  $('#review-stat').textContent = `${batch.length} עמודים במסמך`;
  $('#review-thumbs').replaceChildren(...batch.map((p, i) => {
    const b = document.createElement('button');
    b.className = 'thumb';
    b.setAttribute('aria-label', `ערוך את עמוד ${i + 1}`);
    if (p.thumb) {
      const img = document.createElement('img');
      img.src = p.thumb;
      b.append(img);
    }
    const n = document.createElement('span');
    n.textContent = i + 1;
    b.append(n);
    b.onclick = () => editSingle(i);
    return b;
  }));
}

async function finish() {
  if (!batch.length) return;
  const btn = $('#btn-finish');
  btn.disabled = true;
  try {
    state.pages = batch.map(p => p.out).filter(Boolean);
    const t0 = performance.now();
    state.pdfBlob = await buildPdf(state.pages);
    const title = $('#doc-title').value.trim() || 'סריקה';
    state.pdfName = `${dateStamp()}_${title}.pdf`;
    const dt = ms(t0);
    $('#pdf-stat').textContent = `${state.pdfName} · ${state.pages.length} עמודים · ${kb(state.pdfBlob.size)} · נוצר ב־${dt}ms`;
    report('יצירת PDF', true, `${state.pages.length} עמודים, ${kb(state.pdfBlob.size)}, ${dt}ms`);
    $('#thumbs').replaceChildren(...batch.filter(p => p.thumb).map(p => {
      const img = document.createElement('img');
      img.src = p.thumb;
      return img;
    }));
    step('pages');
  } catch (e) {
    report('יצירת PDF', false, e.message);
    alert(e.message);
  } finally {
    btn.disabled = false;
  }
}

async function sharePdf() {
  const file = new File([state.pdfBlob], state.pdfName, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: state.pdfName });
      report('שיתוף קובץ דרך חלון השיתוף', true, '');
    } catch (e) {
      if (e.name !== 'AbortError') report('שיתוף קובץ דרך חלון השיתוף', false, e.message);
    }
  } else {
    report('שיתוף קובץ דרך חלון השיתוף', false, 'הדפדפן לא תומך בשיתוף קבצים, הורדה במקום');
    downloadBlob(state.pdfBlob, state.pdfName);
  }
}
