// @vitest-environment node
// (ה-Blob של jsdom חסר arrayBuffer, שקיים בכל דפדפן אמיתי וב-Node)
import { describe, expect, it } from 'vitest';
import { buildMimeMessage, encodeFilenameParam, encodeHeader, isValidEmail, toBase64Url, wrap76 } from './mime';
import { addToIndex, emptyIndex, normalizeTags, type IndexDoc } from './docIndex';
import { DEFAULT_SETTINGS, fillTemplate, newerSettings, normalizeSettings } from './settings';
import { tagsDescription } from '../google/drive';

const decodeB64Utf8 = (b64: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s+/g, '')), (c) => c.charCodeAt(0)));

describe('email (MIME)', () => {
  it('leaves an English subject as is and encodes a Hebrew one', () => {
    expect(encodeHeader('Invoice')).toBe('Invoice');
    const enc = encodeHeader('מסמך: חשבון');
    expect(enc).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
    expect(decodeB64Utf8(enc.slice(10, -2))).toBe('מסמך: חשבון');
  });

  it('encodes a Hebrew file name so mail programs show it correctly', () => {
    expect(encodeFilenameParam('20261019_חשבון_חשמל.pdf')).toBe(
      `filename*=UTF-8''${encodeURIComponent('20261019_חשבון_חשמל.pdf')}`,
    );
  });

  it('encodes the whole message as base64url for Gmail (no + / or = padding)', async () => {
    const mime = await buildMimeMessage({
      to: ['a@example.com'],
      subject: 'מסמך',
      body: 'שלום ~~~ ???',
      attachment: { name: 'a.pdf', blob: new Blob([new Uint8Array([0xfb, 0xff, 0xfe])], { type: 'application/pdf' }) },
    });
    const raw = toBase64Url(mime);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = raw.replace(/-/g, '+').replace(/_/g, '/');
    expect(decodeB64Utf8(back + '='.repeat((4 - (back.length % 4)) % 4))).toBe(mime);
  });

  it('wraps long base64 into lines of 76 characters', () => {
    const lines = wrap76('A'.repeat(200)).split('\r\n');
    expect(lines.map((l) => l.length)).toEqual([76, 76, 48]);
  });

  it('checks email addresses', () => {
    expect(isValidEmail('dana@example.com')).toBe(true);
    expect(isValidEmail(' dana@example.co.il ')).toBe(true);
    expect(isValidEmail('dana@example')).toBe(false);
    expect(isValidEmail('dana example.com')).toBe(false);
    expect(isValidEmail('a@b.com, c@d.com')).toBe(false);
  });

  it('builds a message with all recipients, Hebrew body and the PDF attached intact', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0xff, 0x00]);
    const mime = await buildMimeMessage({
      to: ['a@example.com', ' b@example.com '],
      subject: 'מסמך: 20261019_חשבון.pdf',
      body: 'מצורף מסמך שנסרק.',
      attachment: { name: '20261019_חשבון.pdf', blob: new Blob([pdfBytes], { type: 'application/pdf' }) },
    });
    expect(mime).toContain('To: a@example.com, b@example.com\r\n');
    expect(mime).toContain('Content-Type: application/pdf;');
    const boundary = /boundary="([^"]+)"/.exec(mime)![1];
    const parts = mime.split(`--${boundary}`);
    expect(parts).toHaveLength(4); // headers, body, attachment, closing
    const bodyB64 = parts[1].split('\r\n\r\n')[1];
    expect(decodeB64Utf8(bodyB64)).toBe('מצורף מסמך שנסרק.');
    const fileB64 = parts[2].split('\r\n\r\n')[1].replace(/\s+/g, '');
    expect(Uint8Array.from(atob(fileB64), (c) => c.charCodeAt(0))).toEqual(pdfBytes);
  });

  it('refuses to build a message with a bad address or no recipients', async () => {
    const attachment = { name: 'a.pdf', blob: new Blob(['x'], { type: 'application/pdf' }) };
    await expect(buildMimeMessage({ to: [], subject: 's', body: 'b', attachment })).rejects.toThrow('אין נמענים');
    await expect(buildMimeMessage({ to: ['not-an-email'], subject: 's', body: 'b', attachment })).rejects.toThrow(
      'not-an-email',
    );
  });
});

describe('document index', () => {
  const doc = (id: string, title = id): IndexDoc => ({
    id,
    name: `20261019_${title}.pdf`,
    date: '2026-10-19',
    title,
    tags: [],
    pages: 1,
    ocrText: '',
    ocrStatus: 'pending',
    createdAt: '2026-10-19T10:00:00.000Z',
  });

  it('puts the newest document first', () => {
    let index = emptyIndex('me@example.com');
    index = addToIndex(index, doc('a'), 'me@example.com');
    index = addToIndex(index, doc('b'), 'me@example.com');
    expect(index.docs.map((d) => d.id)).toEqual(['b', 'a']);
    expect(index.owner).toBe('me@example.com');
  });

  it('replaces a document with the same id instead of duplicating it', () => {
    let index = addToIndex(emptyIndex('me'), doc('a', 'old'), 'me');
    index = addToIndex(index, doc('a', 'new'), 'me');
    expect(index.docs).toHaveLength(1);
    expect(index.docs[0].title).toBe('new');
  });

  it('cleans tags: no #, no duplicates, no empty ones', () => {
    expect(normalizeTags(['#חשבונות', 'חשבונות', '  ', 'ביטוח  רכב'])).toEqual(['חשבונות', 'ביטוח רכב']);
  });

  it('writes tags into the Drive description so Drive search finds them', () => {
    expect(tagsDescription(['חשבונות', 'ביטוח רכב'])).toBe('#חשבונות #ביטוח_רכב');
  });
});

describe('settings', () => {
  it('fills in missing fields with defaults', () => {
    const s = normalizeSettings({ saveToDrive: false });
    expect(s.saveToDrive).toBe(false);
    expect(s.driveFolder).toBe(DEFAULT_SETTINGS.driveFolder);
    expect(s.contacts).toEqual([]);
  });

  it('drops broken contacts and fixes missing contact fields', () => {
    const s = normalizeSettings({ contacts: [{ id: '1', name: 'אמא' }, null, { email: 'x@y.com' }] });
    expect(s.contacts).toEqual([{ id: '1', name: 'אמא', email: '', whatsapp: false, preselected: false }]);
  });

  it('survives garbage', () => {
    expect(normalizeSettings('nonsense').driveFolder).toBe(DEFAULT_SETTINGS.driveFolder);
    expect(normalizeSettings(null).quickTags).toEqual(DEFAULT_SETTINGS.quickTags);
  });

  it('picks the newer copy between the phone and the Drive backup', () => {
    const older = { ...DEFAULT_SETTINGS, updatedAt: '2026-10-18T10:00:00.000Z' };
    const newer = { ...DEFAULT_SETTINGS, updatedAt: '2026-10-19T10:00:00.000Z' };
    expect(newerSettings(older, newer)).toBe('remote');
    expect(newerSettings(newer, older)).toBe('local');
    expect(newerSettings(newer, { ...newer })).toBe('same');
    expect(newerSettings(newer, null)).toBe('local');
  });

  it('puts the file name into the email template', () => {
    expect(fillTemplate('מסמך: {name}', 'a.pdf')).toBe('מסמך: a.pdf');
  });
});
