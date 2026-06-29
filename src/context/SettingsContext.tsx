import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import { defaultClosingCosts } from '@/lib/finance';
import type { Settings } from '@/types';
import { useAuth } from './AuthContext';

export const DEFAULT_SETTINGS: Settings = {
  name: 'Alan Blood',
  company: 'CFG Home Loans',
  phone: '801.706.2802',
  nmls: '3146',
  email: 'Alanblood@CFGHomeLoans.com',
  officerTitle: 'Mortgage Specialist',
  lenderName: 'CFG Home Loans, A Division of Capital Financial Group Inc.',
  lenderNmls: '3146',
  website: 'www.CFGHomeLoans.com',
  lenderAddress: '810 Shepard Lane, Farmington, UT 84025',
  lenderPhone: '801.706.2802',
  agentName: '',
  brokerage: '',
  agentPhone: '',
  titleCompany: '',
  titleFeesPct: 0.5,
  titleAgentName: '',
  feeDefaults: defaultClosingCosts(),
  darkMode: true,
};

interface SettingsContextValue {
  settings: Settings;
  saving: boolean;
  update: (patch: Partial<Settings>) => void;
  save: (patch?: Partial<Settings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const cacheKey = user ? `loandr.settings.${user.id}` : null;
  const didLoad = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      setSettings(DEFAULT_SETTINGS);
      didLoad.current = null;
      return;
    }
    if (didLoad.current === user.id) return;
    didLoad.current = user.id;
    let cancelled = false;
    (async () => {
      try {
        const { settings: s } = await api.getSettings();
        if (!cancelled && s) setSettings({ ...DEFAULT_SETTINGS, ...s });
      } catch {
        const cached = cacheKey ? localStorage.getItem(cacheKey) : null;
        if (cached && !cancelled) {
          try {
            setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(cached) });
          } catch {
            /* ignore */
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, cacheKey]);

  useEffect(() => {
    if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify(settings));
  }, [settings, cacheKey]);

  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));

  const save = async (patch?: Partial<Settings>) => {
    const next = patch ? { ...settings, ...patch } : settings;
    if (patch) setSettings(next);
    setSaving(true);
    try {
      const { settings: saved } = await api.saveSettings(next);
      if (saved) setSettings({ ...DEFAULT_SETTINGS, ...saved });
    } catch {
      /* offline — local cache already holds the change */
    } finally {
      setSaving(false);
    }
  };

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, saving, update, save }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, saving],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
