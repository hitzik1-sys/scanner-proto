import { $, readReport, clearReport } from './util.js';
import * as drive from './drive.js';
import { initScan } from './scan-ui.js';
import { initOcr, onShowOcr } from './ocr-ui.js';
import { initShare } from './share-ui.js';

const CONFIG_KEY = 'proto-config';

function loadConfig() {
  const defaults = window.PROTO_CONFIG || {};
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}'); } catch {}
  return {
    clientId: saved.clientId || defaults.clientId || '',
    apiKey: saved.apiKey || defaults.apiKey || '',
    appId: saved.appId || defaults.appId || '',
  };
}

function showTab(name, opts) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach(t => { t.hidden = t.id !== `tab-${name}`; });
  if (name === 'ocr') onShowOcr(opts);
  if (name === 'setup') renderReport();
  window.scrollTo(0, 0);
}
window.app = { showTab };

function initSetup() {
  const cfg = loadConfig();
  $('#cfg-client').value = cfg.clientId;
  $('#cfg-key').value = cfg.apiKey;
  $('#cfg-app').value = cfg.appId;
  $('#cfg-origin').textContent = location.origin;
  drive.configure(cfg);

  $('#btn-cfg-save').onclick = () => {
    const c = {
      clientId: $('#cfg-client').value.trim(),
      apiKey: $('#cfg-key').value.trim(),
      appId: $('#cfg-app').value.trim(),
    };
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); } catch {}
    drive.configure(c);
    alert('נשמר');
  };

  $('#btn-report-copy').onclick = async () => {
    const text = reportText();
    try { await navigator.clipboard.writeText(text); alert('הסיכום הועתק. אפשר להדביק אותו בשיחה.'); }
    catch { alert('ההעתקה נכשלה. סמן את הטקסט ידנית.'); }
  };
  $('#btn-report-clear').onclick = () => { if (confirm('לנקות את הסיכום?')) clearReport(); };
  document.addEventListener('report-changed', renderReport);
}

function reportText() {
  const lines = readReport().map(r =>
    `${r.ok ? '✓' : '✗'} ${r.test}${r.detail ? ` — ${r.detail}` : ''}`);
  return [
    `מכשיר: ${navigator.userAgent}`,
    `מסך: ${screen.width}x${screen.height} @${window.devicePixelRatio}`,
    '',
    ...lines,
  ].join('\n');
}

function renderReport() {
  $('#report').textContent = readReport().length ? reportText() : 'עדיין לא הורצו בדיקות.';
}

function initAuth() {
  const btn = $('#btn-auth');
  const render = () => {
    const u = drive.currentUser();
    $('#auth-user').textContent = u ? u.emailAddress : '';
    btn.textContent = u ? 'החלף חשבון' : 'התחבר עם גוגל';
  };
  btn.onclick = async () => {
    try {
      if (drive.currentUser()) {
        await drive.signOut();
        await drive.signIn({ selectAccount: true });
      } else {
        await drive.signIn({ selectAccount: true });
      }
    } catch (e) {
      alert(e.message);
    }
  };
  document.addEventListener('auth-changed', render);
  render();
}

document.querySelectorAll('.tabs button').forEach(b => { b.onclick = () => showTab(b.dataset.tab); });
initSetup();
initAuth();
initScan();
initOcr();
initShare();
if (!loadConfig().clientId) $('#auth-user').textContent = 'חסר Client ID';
