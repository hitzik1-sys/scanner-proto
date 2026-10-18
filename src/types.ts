import type { Filter } from './lib/cv';
import type { Quad } from './lib/geometry';

/**
 * עמוד במסמך. התמונה המקורית נשמרת כקובץ דחוס (blob) כדי לחסוך זיכרון,
 * ומפוענחת מחדש רק כשעורכים את העמוד.
 */
export interface Page {
  id: number;
  blob: Blob;
  /** הפינות שנבחרו. null = עוד לא נערך */
  quad: Quad | null;
  filter: Filter | null;
  rotation: number;
  /** התמונה הסופית אחרי יישור, פילטר וסיבוב */
  out: HTMLCanvasElement | null;
  thumb: string | null;
}

export type Screen = 'home' | 'camera' | 'edit' | 'review' | 'done' | 'settings' | 'search';

/** איזה עמוד נערך עכשיו, ועד איפה ממשיכים ברצף */
export interface EditState {
  index: number;
  /** עריכה ברצף: עד איזה עמוד (לא כולל) */
  seqEnd: number;
  /** עריכת עמוד בודד מתוך רשימת העמודים */
  single: boolean;
}

export interface PdfResult {
  blob: Blob;
  name: string;
  pages: number;
}
