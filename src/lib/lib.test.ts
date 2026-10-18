import { describe, expect, it } from 'vitest';
import { fullQuad, maxShift, orderPoints } from './geometry';
import { dateStamp, displayDate, kb, localDate, pdfFileName } from './files';

describe('orderPoints', () => {
  it('orders a shuffled rectangle starting at top-left, clockwise', () => {
    const q = orderPoints([
      { x: 100, y: 200 },
      { x: 0, y: 0 },
      { x: 0, y: 200 },
      { x: 100, y: 0 },
    ]);
    expect(q).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
      { x: 0, y: 200 },
    ]);
  });

  it('handles a page rotated by about 45 degrees', () => {
    const q = orderPoints([
      { x: 50, y: 0 },
      { x: 100, y: 50 },
      { x: 50, y: 100 },
      { x: 0, y: 50 },
    ]);
    // four distinct corners, clockwise in screen coordinates
    expect(new Set(q.map((p) => `${p.x},${p.y}`)).size).toBe(4);
    const area =
      q.reduce((s, p, i) => {
        const n = q[(i + 1) % 4];
        return s + p.x * n.y - n.x * p.y;
      }, 0) / 2;
    expect(area).toBeGreaterThan(0);
  });
});

describe('fullQuad and maxShift', () => {
  it('builds an inset rectangle', () => {
    expect(fullQuad(200, 100, 0.1)).toEqual([
      { x: 20, y: 10 },
      { x: 180, y: 10 },
      { x: 180, y: 90 },
      { x: 20, y: 90 },
    ]);
  });

  it('measures the largest corner movement', () => {
    const a = fullQuad(100, 100);
    const b = fullQuad(100, 100);
    b[2] = { x: 103, y: 104 };
    expect(maxShift(a, b)).toBe(5);
  });
});

describe('file names', () => {
  const d = new Date(2026, 9, 7); // 7 באוקטובר 2026, שעון מקומי

  it('formats the date as YYYYMMDD', () => {
    expect(dateStamp(d)).toBe('20261007');
  });

  it('uses the local date, even just after midnight', () => {
    expect(localDate(new Date(2026, 9, 7, 0, 30))).toBe('2026-10-07');
  });

  it('shows dates as day.month.year', () => {
    expect(displayDate('2026-10-07')).toBe('7.10.2026');
  });

  it('builds YYYYMMDD_text.pdf with underscores instead of spaces', () => {
    expect(pdfFileName('חשבון חשמל', d)).toBe('20261007_חשבון_חשמל.pdf');
  });

  it('turns a run of spaces into a single underscore', () => {
    expect(pdfFileName('חשבון    חשמל   ספטמבר', d)).toBe('20261007_חשבון_חשמל_ספטמבר.pdf');
  });

  it('does not stack underscores the user typed next to spaces', () => {
    expect(pdfFileName('חשבון _ חשמל__2026', d)).toBe('20261007_חשבון_חשמל_2026.pdf');
  });

  it('drops leading and trailing spaces', () => {
    expect(pdfFileName('  חשבון חשמל  ', d)).toBe('20261007_חשבון_חשמל.pdf');
  });

  it('falls back to "סריקה" when there is no text', () => {
    expect(pdfFileName('   ', d)).toBe('20261007_סריקה.pdf');
  });

  it('removes characters that are not allowed in file names', () => {
    expect(pdfFileName('ביטוח/רכב: 2026?', d)).toBe('20261007_ביטוח_רכב_2026.pdf');
  });
});

describe('kb', () => {
  it('shows KB under a megabyte and MB above', () => {
    expect(kb(150 * 1024)).toBe('150KB');
    expect(kb(2.5 * 1024 * 1024)).toBe('2.5MB');
  });
});
