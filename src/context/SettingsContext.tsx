import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import { defaultClosingCosts } from '@/lib/finance';
import type { Settings } from '@/types';
import { useAuth } from './AuthContext';

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  company: 'Summit Home Loans',
  phone: '801-855-8535',
  nmls: '103895',
  email: 'alan@summithomeloans.com',
  officerTitle: 'Mortgage Specialist',
  lenderName: 'Summit Home Loans',
  lenderNmls: '1790749',
  website: 'summithomeloans.com',
  lenderAddress: '',
  lenderPhone: '801-855-8535',
  agentName: '',
  brokerage: '',
  agentPhone: '',
  titleCompany: '',
  titleFeesPct: 0.5,
  titleAgentName: '',
  feeDefaults: defaultClosingCosts(),
  darkMode: true,
};

/** Seed the officer identity from the signed-in account so the letter reflects whoever
 *  is logged in (not a hardcoded default). Only non-empty account fields override the
 *  defaults; the user's explicitly-saved settings still win over these. */
function accountSeed(user: { name?: string; company?: string; phone?: string; nmls?: string; email?: string } | null): Partial<Settings> {
  if (!user) return {};
  const seed: Partial<Settings> = {};
  if (user.name) seed.name = user.name;
  if (user.company) seed.company = user.company;
  if (user.phone) seed.phone = user.phone;
  if (user.nmls) seed.nmls = user.nmls;
  if (user.email) seed.email = user.email;
  return seed;
}

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
    // Seed the officer identity from the account immediately, so the letter shows the
    // signed-in user even before saved settings load (or if they never customized any).
    setSettings({ ...DEFAULT_SETTINGS, ...accountSeed(user) });
    let cancelled = false;
    (async () => {
      try {
        const { settings: s } = await api.getSettings();
        if (!cancelled) setSettings({ ...DEFAULT_SETTINGS, ...accountSeed(user), ...(s || {}) });
      } catch {
        const cached = cacheKey ? localStorage.getItem(cacheKey) : null;
        if (cached && !cancelled) {
          try {
            setSettings({ ...DEFAULT_SETTINGS, ...accountSeed(user), ...JSON.parse(cached) });
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
      if (saved) setSettings({ ...DEFAULT_SETTINGS, ...accountSeed(user), ...saved });
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
