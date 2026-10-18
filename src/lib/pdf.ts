import { canvasToBlob } from './files';

const A4_WIDTH_PT = 595.28;

/** מקטין עמוד שהצד הארוך שלו גדול מ-maxSide (לאיכות נמוכה = קובץ קטן) */
function fit(c: HTMLCanvasElement, maxSide: number): HTMLCanvasElement {
  const k = maxSide / Math.max(c.width, c.height);
  if (k >= 1) return c;
  const out = document.createElement('canvas');
  out.width = Math.round(c.width * k);
  out.height = Math.round(c.height * k);
  out.getContext('2d')!.drawImage(c, 0, 0, out.width, out.height);
  return out;
}

/** כל עמוד נשמר כתמונת JPEG ברוחב A4, הגובה לפי יחס התמונה */
export async function buildPdf(
  canvases: HTMLCanvasElement[],
  { jpeg = 0.82, maxSide = 2200 }: { jpeg?: number; maxSide?: number } = {},
): Promise<Blob> {
  // pdf-lib גדול (כ-500KB), ולכן נטען רק כשיוצרים PDF ולא בפתיחת האפליקציה
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  for (const original of canvases) {
    const c = fit(original, maxSide);
    const blob = await canvasToBlob(c, 'image/jpeg', jpeg);
    const img = await pdf.embedJpg(await blob.arrayBuffer());
    const h = (A4_WIDTH_PT * c.height) / c.width;
    const page = pdf.addPage([A4_WIDTH_PT, h]);
    page.drawImage(img, { x: 0, y: 0, width: A4_WIDTH_PT, height: h });
  }
  const bytes = await pdf.save();
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}
