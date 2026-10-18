// חיפוש מסמכים בטלפון: בשם, בתגיות ובטקסט שזוהה. עובד גם בלי אינטרנט.

import type { IndexDoc } from './docIndex';
import { editDistance, stems, stripNiqqud, tokenize, type Token } from './hebrew';

export type Period = 'all' | '30d' | 'year' | 'lastYear';

export interface SearchFilters {
  tags: string[];
  period: Period;
}

export interface Snippet {
  text: string;
  /** [התחלה, סוף] בתוך text, לסימון המילים שנמצאו */
  marks: [number, number][];
}

export interface SearchResult {
  doc: IndexDoc;
  score: number;
  snippet: Snippet | null;
}

// כמה שווה התאמה בכל שדה: שם ותגיות חשובים יותר מהתוכן
const FIELD_WEIGHT = { title: 3, tags: 3, text: 1 };
// סוג ההתאמה: מילה מדויקת, בלי תחילית, תחילת מילה, שגיאת אות אחת
const MATCH_WEIGHT = { exact: 4, stem: 3, prefix: 2, typo: 1 };
const SNIPPET_RADIUS = 40;

type MatchKind = keyof typeof MATCH_WEIGHT;

/** איך מילה מהחיפוש מתאימה למילה מהמסמך, או null */
export function matchWord(query: string, word: string): MatchKind | null {
  if (word === query) return 'exact';
  const qs = stems(query);
  const ws = stems(word);
  if (ws.some((w) => qs.includes(w))) return 'stem';
  if (ws.some((w) => qs.some((q) => q.length >= 2 && w.startsWith(q)))) return 'prefix';
  // שגיאת זיהוי של אות אחת, רק במילים ארוכות מספיק כדי לא לקבל התאמות סרק
  if (query.length >= 4 && ws.some((w) => w.length >= 4 && editDistance(w, query, 1) <= 1)) return 'typo';
  return null;
}

interface Prepared {
  doc: IndexDoc;
  text: string;
  title: Token[];
  tags: Token[];
  body: Token[];
}

const cache = new WeakMap<IndexDoc, Prepared>();

function prepare(doc: IndexDoc): Prepared {
  let p = cache.get(doc);
  if (!p) {
    const text = stripNiqqud(doc.ocrText || '');
    p = {
      doc,
      text,
      title: tokenize(stripNiqqud(`${doc.title} ${doc.name}`)),
      tags: tokenize(stripNiqqud(doc.tags.join(' '))),
      body: tokenize(text),
    };
    cache.set(doc, p);
  }
  return p;
}

function bestMatch(q: string, tokens: Token[]): { kind: MatchKind; token: Token } | null {
  let best: { kind: MatchKind; token: Token } | null = null;
  for (const t of tokens) {
    const kind = matchWord(q, t.word);
    if (kind && (!best || MATCH_WEIGHT[kind] > MATCH_WEIGHT[best.kind])) {
      best = { kind, token: t };
      if (kind === 'exact') break;
    }
  }
  return best;
}

export function inPeriod(date: string, period: Period, now = new Date()): boolean {
  if (period === 'all') return true;
  const d = new Date(`${date}T12:00:00`);
  if (period === '30d') return now.getTime() - d.getTime() <= 30 * 86_400_000;
  if (period === 'year') return d.getFullYear() === now.getFullYear();
  return d.getFullYear() === now.getFullYear() - 1;
}

function makeSnippet(text: string, hits: Token[], queryWords: string[]): Snippet | null {
  if (!hits.length) return null;
  const first = hits.reduce((a, b) => (a.start < b.start ? a : b));
  let from = Math.max(0, first.start - SNIPPET_RADIUS);
  let to = Math.min(text.length, first.start + first.word.length + SNIPPET_RADIUS * 2);
  // לא לחתוך באמצע מילה
  while (from > 0 && /\S/.test(text[from - 1])) from--;
  while (to < text.length && /\S/.test(text[to])) to++;
  const piece = text.slice(from, to).trim().replace(/\s+/g, ' ');
  const prefix = from > 0 ? '…' : '';
  const suffix = to < text.length ? '…' : '';
  // מסמנים בקטע כל מילה שמתאימה לחיפוש (לא רק הראשונה)
  const marks: [number, number][] = [];
  for (const t of tokenize(piece)) {
    if (queryWords.some((q) => matchWord(q, t.word))) {
      marks.push([prefix.length + t.start, prefix.length + t.start + t.word.length]);
    }
  }
  return { text: `${prefix}${piece}${suffix}`, marks };
}

/**
 * מחפש במסמכים. כל מילה בחיפוש חייבת להופיע במסמך (בשם, בתגיות או בתוכן).
 * חיפוש ריק מחזיר את כל המסמכים (אחרי הסינון), מהחדש לישן.
 */
export function searchDocs(docs: IndexDoc[], query: string, filters: SearchFilters, now = new Date()): SearchResult[] {
  const words = tokenize(stripNiqqud(query)).map((t) => t.word);
  const filtered = docs.filter(
    (d) => filters.tags.every((t) => d.tags.includes(t)) && inPeriod(d.date, filters.period, now),
  );

  const byDate = (a: SearchResult, b: SearchResult) =>
    b.doc.date.localeCompare(a.doc.date) || b.doc.createdAt.localeCompare(a.doc.createdAt);

  if (!words.length) return filtered.map((doc) => ({ doc, score: 0, snippet: null })).sort(byDate);

  const results: SearchResult[] = [];
  for (const doc of filtered) {
    const p = prepare(doc);
    let score = 0;
    const bodyHits: Token[] = [];
    let all = true;
    for (const q of words) {
      const t = bestMatch(q, p.title);
      const g = bestMatch(q, p.tags);
      const b = bestMatch(q, p.body);
      if (!t && !g && !b) {
        all = false;
        break;
      }
      score += Math.max(
        t ? MATCH_WEIGHT[t.kind] * FIELD_WEIGHT.title : 0,
        g ? MATCH_WEIGHT[g.kind] * FIELD_WEIGHT.tags : 0,
        b ? MATCH_WEIGHT[b.kind] * FIELD_WEIGHT.text : 0,
      );
      if (b) bodyHits.push(b.token);
    }
    if (all) results.push({ doc, score, snippet: makeSnippet(p.text, bodyHits, words) });
  }
  return results.sort((a, b) => b.score - a.score || byDate(a, b));
}

/** כל התגיות שמופיעות במסמכים, מהנפוצה לנדירה */
export function allTags(docs: IndexDoc[]): string[] {
  const count = new Map<string, number>();
  for (const d of docs) for (const t of d.tags) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'he')).map(([t]) => t);
}
