import { canvasToBlob } from './util.js';

// כל עמוד נשמר כתמונת JPEG ברוחב A4 (595pt), הגובה לפי יחס התמונה
export async function buildPdf(canvases, quality = 0.82) {
  const { PDFDocument } = window.PDFLib;
  const pdf = await PDFDocument.create();
  for (const c of canvases) {
    const blob = await canvasToBlob(c, 'image/jpeg', quality);
    const img = await pdf.embedJpg(await blob.arrayBuffer());
    const W = 595.28;
    const H = W * c.height / c.width;
    const page = pdf.addPage([W, H]);
    page.drawImage(img, { x: 0, y: 0, width: W, height: H });
  }
  const bytes = await pdf.save();
  return new Blob([bytes], { type: 'application/pdf' });
}
