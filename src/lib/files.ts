const MAX_PHOTO_SIDE = 3000;

/** תאריך בפורמט YYYYMMDD, לפי השעון המקומי */
export function dateStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** תאריך בפורמט YYYY-MM-DD לפי השעון המקומי (toISOString נותן תאריך של UTC, שיכול להיות של אתמול) */
export function localDate(d = new Date()): string {
  const s = dateStamp(d);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
}

/** YYYY-MM-DD → Date בשעון המקומי (בצהריים, כדי שמעבר שעון לא יזיז יום) */
export function parseLocalDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

/** מעביר עמוד ממקום למקום, ומחזיר רשימה חדשה */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

/** תאריך לתצוגה, למשל 19.10.2026 */
export function displayDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d}.${m}.${y}`;
}

/**
 * שם קובץ בפורמט YYYYMMDD_טקסט.pdf, למשל 20261017_חשבון_חשמל.pdf.
 * תווים שאסורים בשמות קבצים מוסרים, וכל רצף של רווחים (או קווים תחתונים)
 * הופך לקו תחתון אחד. כשאין טקסט, השם הוא "סריקה".
 */
export function pdfFileName(title: string, d = new Date()): string {
  const clean = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/[\s_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
    .replace(/_+$/, '');
  return `${dateStamp(d)}_${clean || 'סריקה'}.pdf`;
}

export function kb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('יצירת תמונה נכשלה'))), type, quality),
  );
}

/** מקטין תמונה גדולה מדי, כדי לא לחרוג מהזיכרון של הטלפון */
export function toCanvas(src: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement {
  const k = Math.min(1, MAX_PHOTO_SIDE / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * k);
  c.height = Math.round(src.height * k);
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** תמונה דרך <img>: הדפדפן מסובב לפי נתוני הסיבוב שבתמונה (EXIF) */
function decodeWithImg(blob: Blob): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(toCanvas(Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight })));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('לא הצלחתי לקרוא את התמונה'));
    };
    img.src = url;
  });
}

export async function decodeImage(blob: Blob): Promise<HTMLCanvasElement> {
  try {
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const c = toCanvas(bmp);
    bmp.close();
    return c;
  } catch {
    // Safari ישן לא תומך באפשרויות של createImageBitmap
    return decodeWithImg(blob);
  }
}

export function makeThumb(c: HTMLCanvasElement, height = 240): string {
  const t = document.createElement('canvas');
  const k = height / c.height;
  t.width = Math.max(1, Math.round(c.width * k));
  t.height = height;
  t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.7);
}

export function downloadBlob(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export type ShareResult = 'shared' | 'cancelled' | 'downloaded';

/** פותח את חלון השיתוף של הטלפון עם הקובץ. אם אין תמיכה, מוריד את הקובץ */
export async function shareFile(blob: Blob, name: string): Promise<ShareResult> {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      throw e;
    }
  }
  downloadBlob(blob, name);
  return 'downloaded';
}
