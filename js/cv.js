// עיבוד תמונה עם OpenCV.js: זיהוי פינות הדף, יישור פרספקטיבה ופילטרים.
// הערה: האובייקט cv של OpenCV מכיל then, ולכן לא מעבירים אותו ל-resolve
// (זה גורם ללולאה אינסופית). משתמשים תמיד ב-window.cv.

const OPENCV_URL = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js';
let ready = null;

export function loadOpenCV() {
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    const isReady = () => !!(window.cv && window.cv.Mat);
    const s = document.createElement('script');
    s.src = OPENCV_URL;
    s.async = true;
    s.onerror = () => reject(new Error('טעינת OpenCV נכשלה (בדוק חיבור לאינטרנט)'));
    s.onload = () => {
      if (isReady()) { resolve(true); return; }
      const cv0 = window.cv;
      if (cv0 instanceof Promise) {
        cv0.then(mod => { window.cv = mod; resolve(true); });
        return;
      }
      if (cv0) cv0.onRuntimeInitialized = () => resolve(true);
      // רשת ביטחון לגרסאות שמתנהגות אחרת
      const iv = setInterval(() => { if (isReady()) { clearInterval(iv); resolve(true); } }, 100);
      setTimeout(() => { clearInterval(iv); if (!isReady()) reject(new Error('OpenCV לא אותחל')); }, 60_000);
    };
    document.head.append(s);
  });
  return ready;
}

const tmp = document.createElement('canvas');

function sourceSize(src) {
  return {
    w: src.videoWidth || src.naturalWidth || src.width,
    h: src.videoHeight || src.naturalHeight || src.height,
  };
}

// מחזיר 4 נקודות [שמאל-עליון, ימין-עליון, ימין-תחתון, שמאל-תחתון] בקואורדינטות המקור, או null
export function detectQuad(source, maxDim = 640) {
  const cv = window.cv;
  const { w: sw, h: sh } = sourceSize(source);
  if (!sw || !sh) return null;
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const w = Math.round(sw * scale), h = Math.round(sh * scale);
  tmp.width = w; tmp.height = h;
  tmp.getContext('2d', { willReadFrequently: true }).drawImage(source, 0, 0, w, h);

  const src = cv.imread(tmp);
  const gray = new cv.Mat();
  const bin = new cv.Mat();
  let quad = null;
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);

    // ניסיון 1: קצוות (Canny) + סגירת חורים
    cv.Canny(gray, bin, 40, 120);
    const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, k);
    k.delete();
    quad = largestQuad(bin, w * h);

    // ניסיון 2: סף אוטומטי (דף בהיר על רקע כהה)
    if (!quad) {
      cv.threshold(gray, bin, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
      quad = largestQuad(bin, w * h);
    }
  } finally {
    src.delete(); gray.delete(); bin.delete();
  }
  return quad ? orderPoints(quad.map(p => ({ x: p.x / scale, y: p.y / scale }))) : null;
}

function largestQuad(bin, imgArea) {
  const cv = window.cv;
  const contours = new cv.MatVector();
  const hier = new cv.Mat();
  cv.findContours(bin, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  let best = null;
  let bestArea = imgArea * 0.12; // דף חייב לתפוס לפחות 12% מהתמונה
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const area = cv.contourArea(c);
    if (area > bestArea && area < imgArea * 0.98) {
      const hull = new cv.Mat();
      cv.convexHull(c, hull);
      const peri = cv.arcLength(hull, true);
      for (const eps of [0.02, 0.03, 0.05]) {
        const approx = new cv.Mat();
        cv.approxPolyDP(hull, approx, eps * peri, true);
        if (approx.rows === 4) {
          best = [];
          for (let j = 0; j < 4; j++) best.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] });
          bestArea = area;
          approx.delete();
          break;
        }
        approx.delete();
      }
      hull.delete();
    }
    c.delete();
  }
  contours.delete(); hier.delete();
  return best;
}

// סידור לפי זווית סביב המרכז, כך שזה עובד גם כשהדף מסובב
export function orderPoints(pts) {
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const sorted = [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  // אחרי המיון: עם כיוון השעון החל מהשמאלית-עליונה (סכום x+y הקטן)
  let start = 0;
  sorted.forEach((p, i) => { if (p.x + p.y < sorted[start].x + sorted[start].y) start = i; });
  return [0, 1, 2, 3].map(i => ({ ...sorted[(start + i) % 4] }));
}

export function fullQuad(source, inset = 0) {
  const { w, h } = sourceSize(source);
  const dx = w * inset, dy = h * inset;
  return [{ x: dx, y: dy }, { x: w - dx, y: dy }, { x: w - dx, y: h - dy }, { x: dx, y: h - dy }];
}

export function warpQuad(srcCanvas, quad, maxSide = 2200) {
  const cv = window.cv;
  const [tl, tr, br, bl] = quad;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let w = Math.max(dist(tl, tr), dist(bl, br));
  let h = Math.max(dist(tl, bl), dist(tr, br));
  const k = Math.min(1, maxSide / Math.max(w, h));
  w = Math.max(1, Math.round(w * k));
  h = Math.max(1, Math.round(h * k));

  const src = cv.imread(srcCanvas);
  const dst = new cv.Mat();
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
  const M = cv.getPerspectiveTransform(from, to);
  cv.warpPerspective(src, dst, M, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
  const out = document.createElement('canvas');
  cv.imshow(out, dst);
  [src, dst, from, to, M].forEach(m => m.delete());
  return out;
}

// color: ללא שינוי · gray: הסרת צללים ושיפור ניגודיות · bw: שחור-לבן אדפטיבי
export function enhance(input, mode) {
  if (mode === 'color') return input;
  const cv = window.cv;
  const src = cv.imread(input);
  const gray = new cv.Mat();
  const out = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  if (mode === 'gray') {
    // מעריכים את הרקע (הנייר + הצל) ומחלקים בו, כך שהצל נעלם
    const bg = new cv.Mat();
    const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(15, 15));
    cv.dilate(gray, bg, k);
    cv.medianBlur(bg, bg, 21);
    cv.divide(gray, bg, out, 255);
    cv.normalize(out, out, 0, 255, cv.NORM_MINMAX);
    k.delete(); bg.delete();
  } else {
    cv.adaptiveThreshold(gray, out, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 15);
  }
  const canvas = document.createElement('canvas');
  cv.imshow(canvas, out);
  src.delete(); gray.delete(); out.delete();
  return canvas;
}

export function rotate90(input, times) {
  const t = ((times % 4) + 4) % 4;
  if (t === 0) return input;
  const c = document.createElement('canvas');
  const swap = t % 2 === 1;
  c.width = swap ? input.height : input.width;
  c.height = swap ? input.width : input.height;
  const x = c.getContext('2d');
  x.translate(c.width / 2, c.height / 2);
  x.rotate(t * Math.PI / 2);
  x.drawImage(input, -input.width / 2, -input.height / 2);
  return c;
}
