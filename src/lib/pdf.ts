import { canvasToBlob } from './files';

const A4_WIDTH_PT = 595.28;

/** כל עמוד נשמר כתמונת JPEG ברוחב A4, הגובה לפי יחס התמונה */
export async function buildPdf(canvases: HTMLCanvasElement[], quality = 0.82): Promise<Blob> {
  // pdf-lib גדול (כ-500KB), ולכן נטען רק כשיוצרים PDF ולא בפתיחת האפליקציה
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  for (const c of canvases) {
    const blob = await canvasToBlob(c, 'image/jpeg', quality);
    const img = await pdf.embedJpg(await blob.arrayBuffer());
    const h = (A4_WIDTH_PT * c.height) / c.width;
    const page = pdf.addPage([A4_WIDTH_PT, h]);
    page.drawImage(img, { x: 0, y: 0, width: A4_WIDTH_PT, height: h });
  }
  const bytes = await pdf.save();
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}
