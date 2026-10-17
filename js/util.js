export const $ = (sel, root = document) => root.querySelector(sel);

// מצב משותף בין הלשוניות
export const state = {
  pages: [],        // עמודים סרוקים (canvas)
  pdfBlob: null,
  pdfName: null,
};

export function dateStamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export const ms = t0 => Math.round(performance.now() - t0);

export const kb = bytes => `${Math.round(bytes / 1024)}KB`;

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.85) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

export function logTo(el, msg, kind = '') {
  const line = document.createElement('div');
  line.className = `log-line ${kind}`;
  const t = new Date().toLocaleTimeString('he-IL', { hour12: false });
  line.textContent = `${t}  ${msg}`;
  el.append(line);
  el.scrollTop = el.scrollHeight;
}

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`טעינה נכשלה: ${src}`));
    document.head.append(s);
  });
}

export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

// ===== סיכום תוצאות, נשמר בדפדפן כדי שיהיה אפשר להעתיק בסוף =====
const REPORT_KEY = 'proto-report';

export function report(test, ok, detail = '') {
  const list = readReport();
  list.push({ at: new Date().toISOString(), test, ok, detail });
  try { localStorage.setItem(REPORT_KEY, JSON.stringify(list.slice(-200))); } catch {}
  document.dispatchEvent(new Event('report-changed'));
}

export function readReport() {
  try { return JSON.parse(localStorage.getItem(REPORT_KEY) || '[]'); } catch { return []; }
}

export function clearReport() {
  try { localStorage.removeItem(REPORT_KEY); } catch {}
  document.dispatchEvent(new Event('report-changed'));
}
