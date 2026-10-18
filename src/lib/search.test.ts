// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { editDistance, normalize, stems, stripNiqqud, tokenize } from './hebrew';
import { allTags, inPeriod, matchWord, searchDocs, type SearchFilters } from './search';
import type { IndexDoc } from './docIndex';

const NONE: SearchFilters = { tags: [], period: 'all' };

let n = 0;
const doc = (p: Partial<IndexDoc>): IndexDoc => ({
  id: `id${++n}`,
  name: `20261019_doc${n}.pdf`,
  date: '2026-10-19',
  title: '',
  tags: [],
  pages: 1,
  ocrText: '',
  ocrStatus: 'done',
  createdAt: `2026-10-19T10:00:0${n % 10}.000Z`,
  ...p,
});

describe('Hebrew text', () => {
  it('turns final letters into regular ones and keeps the length', () => {
    const s = 'שלום, עולם!';
    expect(normalize(s)).toBe('שלומ  עולמ ');
    expect(normalize(s)).toHaveLength(s.length);
  });

  it('removes niqqud', () => {
    expect(stripNiqqud('שָׁלוֹם')).toBe('שלום');
  });

  it('splits into words with their positions', () => {
    expect(tokenize('חשבון חשמל: 345.20')).toEqual([
      { word: 'חשבונ', start: 0 },
      { word: 'חשמל', start: 6 },
      { word: '345', start: 12 },
      { word: '20', start: 16 },
    ]);
  });

  it('strips up to three prefix letters, leaving at least two letters', () => {
    expect(stems('ולחשמל')).toEqual(['ולחשמל', 'לחשמל', 'חשמל']);
    expect(stems('החשמל')).toEqual(['החשמל', 'חשמל']);
    expect(stems('שמ')).toEqual(['שמ']);
    expect(stems('חשמל')).toEqual(['חשמל']);
  });

  it('measures one-letter differences', () => {
    expect(editDistance('חשמל', 'חשמל')).toBe(0);
    expect(editDistance('חשמל', 'השמל')).toBe(1);
    expect(editDistance('חשמל', 'חשמלל')).toBe(1);
    expect(editDistance('חשמל', 'מים')).toBeGreaterThan(1);
  });
});

describe('matching words', () => {
  it('finds a word with a Hebrew prefix', () => {
    expect(matchWord('חשמל', 'לחשמל')).toBe('stem');
    expect(matchWord('חשמל', 'והחשמל')).toBe('stem');
    expect(matchWord('לחשמל', 'חשמל')).toBe('stem');
  });

  it('finds the beginning of a word', () => {
    expect(matchWord('ביטו', 'ביטוח')).toBe('prefix');
  });

  it('forgives one wrong letter in longer words (common in text recognition)', () => {
    expect(matchWord('חשבונ', 'השבונ')).toBe('typo');
    expect(matchWord('רכב', 'רכס')).toBeNull(); // short words: no guessing
  });
});

describe('searchDocs', () => {
  const electric = doc({
    title: 'חשבון חשמל',
    tags: ['חשבונות'],
    ocrText: 'חברת החשמל. סכום לתשלום: 345.20 ש"ח. מועד אחרון לתשלום: 25/10/2026.',
  });
  const car = doc({ title: 'ביטוח רכב', tags: ['ביטוח', 'רכב'], ocrText: 'פוליסת ביטוח מקיף לרכב פרטי', date: '2025-03-01' });
  const water = doc({ title: 'מים', tags: ['חשבונות'], ocrText: 'תאגיד המים העירוני. צריכה 12 קוב.', date: '2026-09-01' });
  const docs = [electric, car, water];

  it('finds by a word in the recognized text, with a prefix', () => {
    const r = searchDocs(docs, 'לתשלום', NONE);
    expect(r.map((x) => x.doc)).toEqual([electric]);
  });

  it('requires every word of the search to appear', () => {
    expect(searchDocs(docs, 'ביטוח פרטי', NONE).map((x) => x.doc)).toEqual([car]);
    expect(searchDocs(docs, 'ביטוח חשמל', NONE)).toEqual([]);
  });

  it('ranks a match in the title above a match in the text', () => {
    const inText = doc({ title: 'מכתב', ocrText: 'בעניין החשמל בבניין' });
    const r = searchDocs([inText, electric], 'חשמל', NONE);
    expect(r.map((x) => x.doc)).toEqual([electric, inText]);
  });

  it('marks the found word in the snippet', () => {
    const [r] = searchDocs(docs, 'סכום', NONE);
    expect(r.snippet).not.toBeNull();
    const [s, e] = r.snippet!.marks[0];
    expect(r.snippet!.text.slice(s, e)).toBe('סכום');
  });

  it('filters by tag and by period', () => {
    expect(searchDocs(docs, '', { tags: ['חשבונות'], period: 'all' }).map((x) => x.doc)).toEqual([electric, water]);
    const now = new Date(2026, 9, 19);
    expect(searchDocs(docs, '', { tags: [], period: 'year' }, now).map((x) => x.doc)).toEqual([electric, water]);
    expect(searchDocs(docs, '', { tags: [], period: 'lastYear' }, now).map((x) => x.doc)).toEqual([car]);
  });

  it('an empty search lists everything, newest first', () => {
    expect(searchDocs(docs, '  ', NONE).map((x) => x.doc)).toEqual([electric, water, car]);
  });

  it('works on documents whose text was not recognized yet', () => {
    const pending = doc({ title: 'קבלה', ocrText: '', ocrStatus: 'pending' });
    expect(searchDocs([pending], 'קבלה', NONE).map((x) => x.doc)).toEqual([pending]);
  });
});

describe('periods and tags', () => {
  const now = new Date(2026, 9, 19);
  it('knows the last 30 days', () => {
    expect(inPeriod('2026-10-01', '30d', now)).toBe(true);
    expect(inPeriod('2026-08-01', '30d', now)).toBe(false);
  });

  it('lists tags from the most common', () => {
    expect(allTags([doc({ tags: ['a', 'b'] }), doc({ tags: ['b'] })])).toEqual(['b', 'a']);
  });
});
