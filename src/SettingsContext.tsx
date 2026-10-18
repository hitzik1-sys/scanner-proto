import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { onAuthChange, savedUser } from './google/auth';
import { readRemoteSettings, writeRemoteSettings } from './google/drive';
import { loadLocalSettings, newerSettings, normalizeSettings, saveLocalSettings, type Settings } from './lib/settings';

interface Ctx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  /** מסנכרן מול הגיבוי בדרייב. נקרא אחרי התחברות */
  sync: () => Promise<void>;
}

const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadLocalSettings);
  const latest = useRef(settings);
  latest.current = settings;
  const timer = useRef(0);

  const sync = useCallback(async () => {
    if (!savedUser()) return;
    const remoteRaw = await readRemoteSettings<unknown>();
    const remote = remoteRaw ? normalizeSettings(remoteRaw) : null;
    const which = newerSettings(latest.current, remote);
    if (which === 'remote' && remote) {
      saveLocalSettings(remote);
      setSettings(remote);
    } else if (which === 'local') {
      await writeRemoteSettings(latest.current);
    }
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    const next = { ...latest.current, ...patch, updatedAt: new Date().toISOString() };
    latest.current = next;
    saveLocalSettings(next);
    setSettings(next);
    // גיבוי לדרייב, אחרי שהמשתמש סיים לשנות (ולא על כל אות)
    clearTimeout(timer.current);
    if (savedUser()) {
      timer.current = window.setTimeout(() => void writeRemoteSettings(next).catch(() => {}), 2000);
    }
  }, []);

  useEffect(() => onAuthChange(() => void sync().catch(() => {})), [sync]);

  return <SettingsCtx.Provider value={{ settings, update, sync }}>{children}</SettingsCtx.Provider>;
}

export function useSettings(): Ctx {
  const c = useContext(SettingsCtx);
  if (!c) throw new Error('useSettings must be used inside SettingsProvider');
  return c;
}
