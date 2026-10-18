// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { moveItem, parseLocalDate, pdfFileName } from './files';
import { addToIndex, emptyIndex, removeFromIndex, type IndexDoc } from './docIndex';
import { DEFAULT_SETTINGS, normalizeSettings, pdfQualityParams } from './settings';

describe('reordering pages', () => {
  it('moves a page one place earlier or later', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('ignores moves past the edges and keeps the same list', () => {
    const list = ['a', 'b'];
    expect(moveItem(list, 0, -1)).toBe(list);
    expect(moveItem(list, 1, 2)).toBe(list);
  });
});

describe('document date', () => {
  it('builds the file name from a chosen date', () => {
    expect(pdfFileName('חוזה שכירות', parseLocalDate('2024-03-05'))).toBe('20240305_חוזה_שכירות.pdf');
  });

  it('reads YYYY-MM-DD as a local date', () => {
    const d = parseLocalDate('2026-01-31');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 0, 31]);
  });
});

describe('PDF quality', () => {
  it('a small file uses stronger compression and smaller pages', () => {
    const low = pdfQualityParams('low');
    const high = pdfQualityParams('high');
    expect(low.jpeg).toBeLessThan(high.jpeg);
    expect(low.maxSide).toBeLessThan(high.maxSide);
    expect(pdfQualityParams('medium').jpeg).toBe(0.82); // כמו בגרסה הקודמת
  });
});

describe('advanced settings', () => {
  it('start off, with medium quality and manual camera', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ advanced: false, pdfQuality: 'medium', cameraStart: 'manual' });
  });

  it('settings saved by an older version get the new defaults', () => {
    const s = normalizeSettings({ saveToDrive: true, contacts: [] });
    expect(s).toMatchObject({ advanced: false, pdfQuality: 'medium', cameraStart: 'manual' });
  });

  it('bad values fall back to the defaults', () => {
    const s = normalizeSettings({ advanced: 'yes', pdfQuality: 'ultra', cameraStart: 'magic' });
    expect(s).toMatchObject({ advanced: false, pdfQuality: 'medium', cameraStart: 'manual' });
  });
});

describe('deleting from the index', () => {
  it('removes only the chosen document', () => {
    const doc = (id: string): IndexDoc => ({
      id,
      name: `${id}.pdf`,
      date: '2026-10-19',
      title: id,
      tags: [],
      pages: 1,
      ocrText: '',
      ocrStatus: 'done',
      createdAt: '2026-10-19T10:00:00.000Z',
    });
    let index = addToIndex(emptyIndex('me'), doc('a'), 'me');
    index = addToIndex(index, doc('b'), 'me');
    expect(removeFromIndex(index, 'a').docs.map((d) => d.id)).toEqual(['b']);
  });
});
