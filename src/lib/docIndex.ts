// קובץ האינדקס (_index.json) שבתיקיית המסמכים: רשימת המסמכים, התגיות והטקסט שזוהה.
// בני משפחה שהתיקייה שותפה איתם קוראים את הקובץ הזה כדי לחפש.

export interface IndexDoc {
  /** מזהה הקובץ בדרייב */
  id: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  tags: string[];
  pages: number;
  ocrText: string;
  ocrStatus: 'pending' | 'done' | 'failed';
  createdAt: string;
}

export interface DocIndex {
  version: 1;
  owner: string;
  updatedAt: string;
  docs: IndexDoc[];
}

export function emptyIndex(owner: string): DocIndex {
  return { version: 1, owner, updatedAt: new Date(0).toISOString(), docs: [] };
}

/** מוסיף מסמך (או מחליף מסמך עם אותו מזהה). החדש ביותר ראשון */
export function addToIndex(index: DocIndex, doc: IndexDoc, owner: string, now = new Date()): DocIndex {
  const docs = [doc, ...(index.docs ?? []).filter((d) => d.id !== doc.id)];
  return { version: 1, owner: index.owner || owner, updatedAt: now.toISOString(), docs };
}

/** מנקה ומאחד תגיות: בלי # בהתחלה, בלי כפילויות, בלי ריקות */
export function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const clean = t.replace(/^#+/, '').replace(/\s+/g, ' ').trim();
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out;
}
