// הספרייה בטלפון: עותק של האינדקס מהדרייב, כדי שהחיפוש יעבוד מהר וגם בלי אינטרנט.
// מסתנכרנת מהדרייב, ומריצה ברקע זיהוי טקסט על מסמכים שעוד ממתינים לו.

import { useEffect, useState } from 'react';
import { hasValidToken, savedUser } from './google/auth';
import { findFolder, readIndex, recognizeText, updateIndex } from './google/drive';
import { patchDoc, pendingOcr, type IndexDoc } from './lib/docIndex';
import { getItem, setItem } from './lib/store';

const KEY = 'library';

export interface LibraryState {
  owner: string | null;
  folderId: string | null;
  docs: IndexDoc[];
  lastSync: string | null;
  syncing: boolean;
  /** כמה מסמכים עוד ממתינים לזיהוי טקסט */
  ocrLeft: number;
  ocrRunning: boolean;
  error: string | null;
  loaded: boolean;
}

let state: LibraryState = {
  owner: null,
  folderId: null,
  docs: [],
  lastSync: null,
  syncing: false,
  ocrLeft: 0,
  ocrRunning: false,
  error: null,
  loaded: false,
};
const listeners = new Set<() => void>();

function set(patch: Partial<LibraryState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

async function persist() {
  const { owner, folderId, docs, lastSync } = state;
  await setItem(KEY, { owner, folderId, docs, lastSync }).catch(() => {});
}

/** טוען את הספרייה השמורה בטלפון. אם התחבר משתמש אחר, מתחילים ספרייה ריקה */
export async function loadLibrary(): Promise<void> {
  const saved = await getItem<Partial<LibraryState>>(KEY).catch(() => undefined);
  const me = savedUser()?.email ?? null;
  if (saved && (!me || saved.owner === me)) {
    set({ ...saved, loaded: true, ocrLeft: (saved.docs ?? []).filter((d) => d.ocrStatus === 'pending').length });
  } else {
    set({ owner: me, folderId: null, docs: [], lastSync: null, loaded: true });
  }
}

/**
 * מוריד את האינדקס מהדרייב. צריך אישור גישה בתוקף: לקרוא מתוך לחיצה של המשתמש
 * (אחרי getToken), או כש-hasValidToken().
 */
export async function syncLibrary(folderName: string): Promise<void> {
  if (state.syncing) return;
  const owner = savedUser()?.email;
  if (!owner) return;
  set({ syncing: true, error: null });
  try {
    const folder = await findFolder(folderName.trim() || 'מסמכים סרוקים');
    const docs = folder ? (await readIndex(folder.id, owner)).docs : [];
    set({ owner, folderId: folder?.id ?? null, docs, lastSync: new Date().toISOString(), ocrLeft: docs.filter((d) => d.ocrStatus === 'pending').length });
    await persist();
  } catch (e) {
    set({ error: (e as Error).message });
  } finally {
    set({ syncing: false });
  }
  void runOcr();
}

/** מסמך שנשמר עכשיו: נכנס לספרייה מיד, בלי לחכות לסנכרון */
export async function addToLibrary(doc: IndexDoc, folderId: string): Promise<void> {
  const owner = savedUser()?.email ?? state.owner;
  const docs = [doc, ...state.docs.filter((d) => d.id !== doc.id)];
  set({ owner, folderId, docs, ocrLeft: docs.filter((d) => d.ocrStatus === 'pending').length });
  await persist();
  void runOcr();
}

/** זיהוי טקסט ברקע, מסמך אחרי מסמך. נעצר בשקט אם אין אינטרנט או שפג אישור הגישה */
export async function runOcr(): Promise<void> {
  const { folderId, owner } = state;
  if (state.ocrRunning || !folderId || !owner) return;
  set({ ocrRunning: true });
  try {
    for (;;) {
      if (!hasValidToken() || !navigator.onLine) break;
      const next = pendingOcr({ version: 1, owner, updatedAt: '', docs: state.docs })[0];
      if (!next) break;
      let patch: Partial<IndexDoc>;
      try {
        const text = await recognizeText(next.id, next.name);
        patch = { ocrText: text, ocrStatus: 'done' };
      } catch (e) {
        // קובץ שנמחק מהדרייב, או שגוגל לא הצליחה לזהות בו טקסט: לא מנסים שוב לנצח
        const msg = (e as Error).message;
        if (/^(404|400|403)/.test(msg)) patch = { ocrStatus: 'failed' };
        else break; // תקלת רשת: ננסה בפעם הבאה
      }
      const index = await updateIndex(folderId, owner, (i) => patchDoc(i, next.id, patch));
      // מה שבדרייב הוא האמת, כולל מסמכים שנוספו בינתיים ממכשיר אחר
      const docs = index.docs.some((d) => d.id === next.id)
        ? index.docs
        : state.docs.map((d) => (d.id === next.id ? { ...d, ...patch } : d));
      set({ docs, ocrLeft: docs.filter((d) => d.ocrStatus === 'pending').length });
      await persist();
    }
  } catch (e) {
    set({ error: (e as Error).message });
  } finally {
    set({ ocrRunning: false });
  }
}

export function useLibrary(): LibraryState {
  const [s, setS] = useState(state);
  useEffect(() => {
    const fn = () => setS(state);
    listeners.add(fn);
    if (!state.loaded) void loadLibrary();
    else fn();
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return s;
}
