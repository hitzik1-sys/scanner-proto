// עיבוד טקסט עברי לחיפוש: נרמול, פירוק למילים, והסרת תחיליות (ו, ה, ב, ל, מ, ש, כ).

const NIQQUD = /[֑-ׇ]/g; // ניקוד וטעמים
const FINALS: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

/** מסיר ניקוד. נעשה לפני כל דבר אחר, כי הוא משנה את אורך הטקסט */
export function stripNiqqud(text: string): string {
  return text.replace(NIQQUD, '');
}

/**
 * נרמול לחיפוש, תו מול תו (האורך נשמר, כדי לסמן את המילה שנמצאה בטקסט המקורי):
 * אותיות סופיות הופכות לרגילות, אותיות לטיניות לקטנות, וכל מה שאינו אות או ספרה הופך לרווח.
 */
export function normalize(text: string): string {
  let out = '';
  for (const ch of text) {
    const c = FINALS[ch] ?? ch.toLowerCase();
    out += /[\p{L}\p{N}]/u.test(c) && c.length === 1 ? c : ' ';
  }
  return out;
}

export interface Token {
  word: string;
  /** מיקום בטקסט (לאחר הסרת הניקוד) */
  start: number;
}

export function tokenize(text: string): Token[] {
  const norm = normalize(text);
  const tokens: Token[] = [];
  const re = /[\p{L}\p{N}]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm))) tokens.push({ word: m[0], start: m.index });
  return tokens;
}

const PREFIX_LETTERS = new Set(['ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ']);
const MIN_STEM = 2;

/**
 * כל הצורות של המילה בלי תחיליות, למשל "ולחשמל" → ולחשמל, לחשמל, חשמל.
 * עד 3 אותיות תחילית, ותמיד נשארות לפחות 2 אותיות.
 */
export function stems(word: string): string[] {
  const out = [word];
  let w = word;
  for (let i = 0; i < 3 && w.length - 1 >= MIN_STEM && PREFIX_LETTERS.has(w[0]); i++) {
    w = w.slice(1);
    out.push(w);
  }
  return out;
}

/** מרחק עריכה, עם עצירה מוקדמת כשהוא גדול מ-max */
export function editDistance(a: string, b: string, max = 1): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
