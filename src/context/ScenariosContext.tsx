import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import { defaultClosingCosts } from '@/lib/finance';
import type { Scenario } from '@/types';
import { useAuth } from './AuthContext';

export const MAX_SCENARIOS = 6;

export function blankScenario(name: string): Scenario {
  return {
    name,
    transaction: 'purchase',
    borrowers: '1',
    loanType: 'conventional',
    program: 'standard',
    homePrice: 300000,
    downPayment: 30000,
    downPct: 10,
    rate: 6.5,
    term: '30',
    credit: '700',
    lenderCredit: 0,
    sellerCredit: 0,
    otherCredits: 0,
    closingCosts: defaultClosingCosts(),
  };
}

interface ScenariosContextValue {
  scenarios: Scenario[];
  active: number;
  current: Scenario;
  loaded: boolean;
  saving: boolean;
  dirty: boolean;
  select: (i: number) => void;
  patch: (obj: Partial<Scenario>) => void;
  setField: (field: keyof Scenario, raw: string) => void;
  addScenario: () => void;
  removeScenario: (i: number) => void;
  saveAll: () => Promise<void>;
}

const ScenariosContext = createContext<ScenariosContextValue | null>(null);

export function ScenariosProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [scenarios, setScenarios] = useState<Scenario[]>([blankScenario('Scenario 1')]);
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const cacheKey = user ? `loandr.scenarios.${user.id}` : null;
  const didLoad = useRef<string | null>(null);

  // Load scenarios when the user logs in (backend first, localStorage cache fallback).
  useEffect(() => {
    if (!user) {
      setScenarios([blankScenario('Scenario 1')]);
      setActive(0);
      setLoaded(false);
      setDirty(false);
      didLoad.current = null;
      return;
    }
    if (didLoad.current === user.id) return;
    didLoad.current = user.id;
    let cancelled = false;
    (async () => {
      try {
        const { scenarios: s } = await api.listScenarios();
        if (cancelled) return;
        const list = s && s.length ? s : [blankScenario('Scenario 1')];
        setScenarios(list);
        setActive(0);
        setLoaded(true);
        setDirty(false);
      } catch {
        // fall back to local cache so the workspace still functions offline
        const cached = cacheKey ? localStorage.getItem(cacheKey) : null;
        if (cached && !cancelled) {
          try {
            setScenarios(JSON.parse(cached));
          } catch {
            /* ignore */
          }
        }
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, cacheKey]);

  // Cache locally on every change.
  useEffect(() => {
    if (cacheKey && loaded) localStorage.setItem(cacheKey, JSON.stringify(scenarios));
  }, [scenarios, cacheKey, loaded]);

  const mutate = (updater: (list: Scenario[]) => Scenario[]) => {
    setScenarios((list) => updater(list));
    setDirty(true);
  };

  const patch = (obj: Partial<Scenario>) =>
    mutate((list) => list.map((s, i) => (i === active ? { ...s, ...obj } : s)));

  const setField = (field: keyof Scenario, raw: string) => {
    const v = raw === '' ? 0 : parseFloat(raw);
    const num = Number.isFinite(v) ? v : 0;
    setScenarios((list) => {
      const c = list[active];
      let next: Partial<Scenario>;
      if (field === 'downPayment') {
        const pct = c.homePrice > 0 ? (num / c.homePrice) * 100 : 0;
        next = { downPayment: num, downPct: Math.round(pct * 100) / 100 };
      } else if (field === 'downPct') {
        next = { downPct: num, downPayment: Math.round((c.homePrice * num) / 100) };
      } else if (field === 'homePrice') {
        next = { homePrice: num, downPayment: Math.round((num * (c.downPct || 0)) / 100) };
      } else {
        next = { [field]: raw === '' ? '' : num } as Partial<Scenario>;
      }
      return list.map((s, i) => (i === active ? { ...s, ...next } : s));
    });
    setDirty(true);
  };

  const addScenario = () =>
    setScenarios((list) => {
      if (list.length >= MAX_SCENARIOS) return list;
      const next = [...list, blankScenario(`Scenario ${list.length + 1}`)];
      setActive(next.length - 1);
      setDirty(true);
      return next;
    });

  const removeScenario = (i: number) =>
    setScenarios((list) => {
      if (list.length <= 1) return list;
      const next = list.filter((_, idx) => idx !== i);
      setActive((a) => Math.max(0, Math.min(a, next.length - 1)));
      setDirty(true);
      return next;
    });

  const saveAll = async () => {
    setSaving(true);
    try {
      const { scenarios: saved } = await api.saveScenarios(scenarios);
      if (saved && saved.length) setScenarios(saved);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const safeActive = Math.min(active, scenarios.length - 1);
  const value = useMemo<ScenariosContextValue>(
    () => ({
      scenarios,
      active: safeActive,
      current: scenarios[safeActive],
      loaded,
      saving,
      dirty,
      select: setActive,
      patch,
      setField,
      addScenario,
      removeScenario,
      saveAll,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenarios, safeActive, loaded, saving, dirty],
  );

  return <ScenariosContext.Provider value={value}>{children}</ScenariosContext.Provider>;
}

export function useScenarios(): ScenariosContextValue {
  const ctx = useContext(ScenariosContext);
  if (!ctx) throw new Error('useScenarios must be used within ScenariosProvider');
  return ctx;
}
