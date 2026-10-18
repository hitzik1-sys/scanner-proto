import { describe, expect, it } from 'vitest';
import { emailRecipients, initialChoices, whatsappRecipients } from '../components/RecipientPicker';
import { newestScannedFirst } from './search';
import type { Contact } from './settings';
import type { IndexDoc } from './docIndex';

const contacts: Contact[] = [
  { id: 'mom', name: 'אמא', email: 'mom@example.com', whatsapp: false, preselected: true },
  { id: 'dan', name: 'דני', email: '', whatsapp: true, preselected: false },
  { id: 'cpa', name: 'רואה חשבון', email: 'cpa@example.com', whatsapp: true, preselected: false },
];

describe('choosing recipients', () => {
  it('first send: only the preselected contacts are checked', () => {
    const c = initialChoices(contacts, true);
    expect(Object.entries(c).filter(([, v]) => v.selected).map(([k]) => k)).toEqual(['mom']);
  });

  it('send to more recipients: nobody is checked', () => {
    const c = initialChoices(contacts, false);
    expect(Object.values(c).some((v) => v.selected)).toBe(false);
  });

  it('email goes only to checked contacts that have an address and email on', () => {
    const c = initialChoices(contacts, false);
    c.dan.selected = true; // אין מייל
    c.cpa.selected = true;
    expect(emailRecipients(contacts, c).map((x) => x.id)).toEqual(['cpa']);
    c.cpa.email = false;
    expect(emailRecipients(contacts, c)).toEqual([]);
  });

  it('WhatsApp reminder lists checked contacts with WhatsApp on', () => {
    const c = initialChoices(contacts, false);
    c.dan.selected = true;
    c.cpa.selected = true;
    expect(whatsappRecipients(contacts, c).map((x) => x.id)).toEqual(['dan', 'cpa']);
  });
});

describe('home list order', () => {
  const doc = (id: string, createdAt: string, date: string): IndexDoc => ({
    id,
    name: `${id}.pdf`,
    date,
    title: id,
    tags: [],
    pages: 1,
    ocrText: '',
    ocrStatus: 'done',
    createdAt,
  });

  it('newest scan first, even when an old document date was chosen', () => {
    const docs = [
      doc('a', '2026-10-18T09:00:00Z', '2026-10-18'),
      doc('old-contract', '2026-10-19T12:00:00Z', '2024-03-05'), // נסרק היום, תאריך מסמך ישן
      doc('b', '2026-10-19T08:00:00Z', '2026-10-19'),
    ];
    expect(newestScannedFirst(docs).map((d) => d.id)).toEqual(['old-contract', 'b', 'a']);
  });

  it('does not change the original list', () => {
    const docs = [doc('a', '2026-10-18T09:00:00Z', '2026-10-18'), doc('b', '2026-10-19T09:00:00Z', '2026-10-19')];
    newestScannedFirst(docs);
    expect(docs.map((d) => d.id)).toEqual(['a', 'b']);
  });
});
