import { $, state, dateStamp, ms, kb, downloadBlob, report } from './util.js';
import { loadOpenCV, detectQuad, fullQuad, warpQuad, enhance, rotate90 } from './cv.js';
import { buildPdf } from './pdf.js';
import { makeSamplePhoto } from './sample.js';

const STEPS = ['start', 'camera', 'crop', 'result', 'pages'];
const MAX_PHOTO_SIDE = 3000;

let stream = null;
let loopTimer = null;
let lastQuad = null;
let stableSince = 0;
let capturing = false;
let detectTimes = [];

let cropSource = null;   // canvas בגודל מלא
let cropQuad = null;     // 4 נקודות בקואורדינטות המקור
let cropView = { s: 1 }; // יחס תצוגה
let dragIdx = null;
let cropDetected = false;

let resultBase = null;   // אחרי יישור, לפני פילטר
let rotation = 0;
let currentPage = null;

function step(name) {
  for (const s of STEPS) $(`#scan-${s}`).hidden = s !== name;
  if (name === 'start') updatePageCount();
}

function updatePageCount() {
  const n = state.pages.length;
  $('#page-count').textContent = n ? `${n} עמודים במסמך הנוכחי. סרוק את העמוד הבא.` : '';
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
  $('#file-input').onchange = async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    await loadOpenCV();
    const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
    startCrop(toCanvas(bmp), 'גלריה');
  };
  $('#btn-sample').onclick = () => startCrop(makeSamplePhoto(), 'דוגמה');

  $('#btn-capture').onclick = capture;
  $('#btn-cam-cancel').onclick = () => { stopCamera(); step(state.pages.length ? 'start' : 'start'); };

  $('#btn-redetect').onclick = () => {
    const t = performance.now();
    const q = detectQuad(cropSource, 1000);
    cropQuad = q || fullQuad(cropSource, 0.05);
    $('#crop-stat').textContent = q ? `זוהה מחדש (${ms(t)}ms)` : 'לא זוהה דף, סמן ידנית';
    drawCrop();
  };
  $('#btn-crop-full').onclick = () => { cropQuad = fullQuad(cropSource); drawCrop(); };
  $('#btn-crop-cancel').onclick = () => step('start');
  $('#btn-crop-ok').onclick = applyCrop;

  $('#filter').onchange = renderResult;
  $('#btn-rotate').onclick = () => { rotation++; renderResult(); };
  $('#btn-retake').onclick = () => step('start');
  $('#btn-add-page').onclick = () => { addCurrentPage(); step('start'); };
  $('#btn-finish').onclick = finish;

  $('#btn-share-pdf').onclick = sharePdf;
  $('#btn-download-pdf').onclick = () => downloadBlob(state.pdfBlob, state.pdfName);
  $('#btn-to-ocr').onclick = () => window.app.showTab('ocr', { fromScan: true });
  $('#btn-new-scan').onclick = () => {
    state.pages = []; state.pdfBlob = null; state.pdfName = null;
    $('#doc-title').value = '';
    step('start');
  };

  setupCropPointer();
  window.addEventListener('resize', () => { if (!$('#scan-crop').hidden) drawCrop(); });
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
  lastQuad = null;
  stableSince = 0;
  capturing = false;
  step('camera');
  const s = stream.getVideoTracks()[0].getSettings();
  report('פתיחת מצלמה', true, `${s.width}x${s.height}`);
  tick();
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
  if (!stream) return;
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

    const now = performance.now();
    if (stable) { if (!stableSince) stableSince = now; } else stableSince = 0;
    const auto = $('#auto-capture').checked;
    const left = stableSince ? Math.max(0, 1500 - (now - stableSince)) : null;
    $('#det-stat').textContent = `זיהוי: ${dt}ms לפריים · ${q ? (stable ? 'הדף יציב' : 'נמצא דף') : 'מחפש דף…'}`
      + (auto && left !== null ? ` · מצלם בעוד ${(left / 1000).toFixed(1)}` : '');
    lastQuad = q;
    if (auto && stableSince && now - stableSince > 1500) { capture(); return; }
  }
  loopTimer = setTimeout(tick, 150);
}

function maxShift(a, b) {
  return Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));
}

async function capture() {
  if (capturing || !stream) return;
  capturing = true;
  const v = $('#video');
  let canvas = null;
  let how = 'פריים מהווידאו';
  try {
    if ('ImageCapture' in window) {
      const ic = new ImageCapture(stream.getVideoTracks()[0]);
      const blob = await ic.takePhoto();
      const bmp = await createImageBitmap(blob);
      canvas = toCanvas(bmp);
      how = 'צילום מלא (takePhoto)';
    }
  } catch { canvas = null; }
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d').drawImage(v, 0, 0);
  }
  stopCamera();
  startCrop(canvas, `מצלמה, ${how}`);
}

// ===== חיתוך =====

function startCrop(canvas, origin) {
  cropSource = canvas;
  const t0 = performance.now();
  const q = detectQuad(canvas, 1000);
  const dt = ms(t0);
  cropDetected = !!q;
  cropQuad = q || fullQuad(canvas, 0.05);
  $('#crop-stat').textContent = `${canvas.width}x${canvas.height} · ${q ? `דף זוהה (${dt}ms)` : 'לא זוהה דף, סמן ידנית'}`;
  report(`זיהוי פינות (${origin})`, cropDetected, `${canvas.width}x${canvas.height}, ${dt}ms`);
  step('crop');
  drawCrop();
}

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
  const t0 = performance.now();
  resultBase = warpQuad(cropSource, cropQuad);
  rotation = 0;
  const warpMs = ms(t0);
  step('result');
  renderResult(warpMs);
}

function renderResult(warpMs) {
  const t0 = performance.now();
  const mode = $('#filter').value;
  currentPage = rotate90(enhance(resultBase, mode), rotation);
  const wrap = $('#result-wrap');
  wrap.replaceChildren(currentPage);
  $('#result-stat').textContent = `${currentPage.width}x${currentPage.height}`
    + (typeof warpMs === 'number' ? ` · יישור ${warpMs}ms` : '')
    + ` · פילטר ${ms(t0)}ms`;
}

function addCurrentPage() {
  if (currentPage) state.pages.push(currentPage);
  currentPage = null;
}

async function finish() {
  addCurrentPage();
  if (!state.pages.length) return;
  const btn = $('#btn-finish');
  btn.disabled = true;
  try {
    const t0 = performance.now();
    state.pdfBlob = await buildPdf(state.pages);
    const title = $('#doc-title').value.trim() || 'סריקה';
    state.pdfName = `${dateStamp()}_${title}.pdf`;
    const dt = ms(t0);
    $('#pdf-stat').textContent = `${state.pdfName} · ${state.pages.length} עמודים · ${kb(state.pdfBlob.size)} · נוצר ב־${dt}ms`;
    report('יצירת PDF', true, `${state.pages.length} עמודים, ${kb(state.pdfBlob.size)}, ${dt}ms`);
    const thumbs = $('#thumbs');
    thumbs.replaceChildren(...state.pages.map(p => {
      const img = document.createElement('img');
      img.src = p.toDataURL('image/jpeg', 0.5);
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
