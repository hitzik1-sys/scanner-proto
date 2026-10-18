import { describe, expect, it } from 'vitest';
import i18n from './i18n';

describe('Hebrew texts', () => {
  it('uses the singular form for one page', () => {
    expect(i18n.t('review.count', { count: 1 })).toBe('עמוד אחד במסמך');
    expect(i18n.t('camera.count', { count: 1 })).toBe('צולם עמוד אחד');
    expect(i18n.t('done.info', { count: 1, size: '63KB' })).toBe('עמוד אחד · 63KB');
  });

  it('uses the plural form for several pages', () => {
    expect(i18n.t('review.count', { count: 2 })).toBe('2 עמודים במסמך');
    expect(i18n.t('review.count', { count: 5 })).toBe('5 עמודים במסמך');
    expect(i18n.t('done.info', { count: 3, size: '1.2MB' })).toBe('3 עמודים · 1.2MB');
  });
});
