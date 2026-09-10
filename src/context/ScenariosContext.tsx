import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import { cloneFees } from '@/components/ClosingCostsEditor';
import { defaultClosingCosts } from '@/lib/finance';
import type { ClosingCostItem, Scenario } from '@/types';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';

export const MAX_SCENARIOS = 6;

// Backfill the required fields on scenarios loaded from the server or the local
// cache, so an older/partial saved scenario (one missing a field added in a later
// version) can never crash the comparison engine or the UI. Present values are kept
// as-is; optional fields (tax*/hoa/VA toggles/closingCosts) are left untouched
// because their absence is meaningful.
export function normalizeScenario(input: unknown): Scenario {
  const o = (input && typeof input === 'object' ? input : {}) as Partial<Scenario>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    ...o,
    name: o.name ?? 'Scenario',
    transaction: o.transaction ?? 'purchase',
    borrowers: o.borrowers ?? '1',
    loanType: o.loanType ?? 'conventional',
    program: o.program ?? 'standard',
    homePrice: num(o.homePrice, 300000),
    downPayment: num(o.downPayment, 0),
    downPct: num(o.downPct, 0),
    rate: num(o.rate, 0),
    term: o.term ?? '30',
    credit: o.credit ?? '700',
    lenderCredit: num(o.lenderCredit, 0),
    sellerCredit: num(o.sellerCredit, 0),
    otherCredits: num(o.otherCredits, 0),
  } as Scenario;
}

function normalizeList(list: unknown): Scenario[] {
  return Array.isArray(list) ? list.map(normalizeScenario) : [];
}

export function blankScenario(name: string, fees?: ClosingCostItem[]): Scenario {
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
    closingCosts: fees && fees.length ? cloneFees(fees) : defaultClosingCosts(),
  };
}

interface ScenariosContextValue {
  /** The working comparison tabs (up to 6) currently shown on the Compare screen. */
  scenarios: Scenario[];
  /** The full saved bank — every scenario the user has saved (shared with Pre-Approval). */
  bank: Scenario[];
  active: number;
  current: Scenario;
  loaded: boolean;
  saving: boolean;
  dirty: boolean;
  select: (i: number) => void;
  patch: (obj: Partial<Scenario>) => void;
  setField: (field: keyof Scenario, raw: string) => void;
  addScenario: () => void;
  /** Reset the working comparison to a single preset-default scenario (bank untouched). */
  resetScenarios: () => void;
  /** Open a saved scenario into the working tabs (keeps its id so re-saving updates the
   *  same bank entry). Returns false when the 6-scenario comparison limit is reached. */
  addScenarioFrom: (scenario: Scenario) => boolean;
  /** Delete a scenario from the saved bank. */
  deleteFromBank: (id: string) => Promise<void>;
  removeScenario: (i: number) => void;
  saveAll: () => Promise<void>;
}

const ScenariosContext = createContext<ScenariosContextValue | null>(null);

export function ScenariosProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  // Latest saved default fee schedule, read when seeding new scenarios.
  const feeDefaultsRef = useRef(settings.feeDefaults);
  useEffect(() => {
    feeDefaultsRef.current = settings.feeDefaults;
  }, [settings.feeDefaults]);
  const seededBlank = (name: string) => blankScenario(name, feeDefaultsRef.current);

  const [scenarios, setScenarios] = useState<Scenario[]>([blankScenario('Scenario 1')]);
  // The full saved list. The comparison tabs above are a working view of this bank.
  const [bank, setBank] = useState<Scenario[]>([]);
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
      setBank([]);
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
        const normalized = normalizeList(s);
        setBank(normalized);
        // Open the first few saved scenarios into the comparison; the rest live in the
        // Saved Scenarios popup. A brand-new user starts with one blank scenario.
        const working = normalized.length ? normalized.slice(0, MAX_SCENARIOS) : [seededBlank('Scenario 1')];
        setScenarios(working);
        setActive(0);
        setLoaded(true);
        setDirty(false);
      } catch {
        // fall back to local cache so the workspace still functions offline
        const cached = cacheKey ? localStorage.getItem(cacheKey) : null;
        if (cached && !cancelled) {
          try {
            const normalized = normalizeList(JSON.parse(cached));
            if (normalized.length) setScenarios(normalized);
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
      const next = [...list, seededBlank(`Scenario ${list.length + 1}`)];
      setActive(next.length - 1);
      setDirty(true);
      return next;
    });

  // Reset the working comparison to a single preset-default scenario. The saved bank is
  // left untouched — only the current (unsaved) comparison view is cleared.
  const resetScenarios = () => {
    setScenarios([seededBlank('Scenario 1')]);
    setActive(0);
    setDirty(false);
  };

  const addScenarioFrom = (scenario: Scenario): boolean => {
    // Already open in a tab → just focus it (avoid duplicate tabs of one saved scenario).
    if (scenario.id) {
      const existing = scenarios.findIndex((s) => s.id === scenario.id);
      if (existing >= 0) {
        setActive(existing);
        return true;
      }
    }
    if (scenarios.length >= MAX_SCENARIOS) return false;
    // Keep the id so saving this tab updates the same bank entry (not a duplicate).
    const copy = normalizeScenario({ ...scenario });
    setScenarios((list) => {
      const next = [...list, copy];
      setActive(next.length - 1);
      return next;
    });
    return true;
  };

  const deleteFromBank = async (id: string) => {
    setBank((b) => b.filter((s) => s.id !== id));
    // If it's open as a tab, drop its id so a later Save won't resurrect the deleted entry.
    setScenarios((list) => list.map((s) => (s.id === id ? { ...s, id: undefined } : s)));
    try {
      await api.deleteScenario(id);
    } catch {
      /* best effort — it reappears on the next load if the server delete failed */
    }
  };

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
      // Merge the working tabs into the bank (add new / update existing by id).
      const { scenarios: fullBank, saved } = await api.upsertScenarios(scenarios);
      if (saved && saved.length) setScenarios(normalizeList(saved));
      if (fullBank) setBank(normalizeList(fullBank));
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const safeActive = Math.min(active, scenarios.length - 1);
  const value = useMemo<ScenariosContextValue>(
    () => ({
      scenarios,
      bank,
      active: safeActive,
      current: scenarios[safeActive],
      loaded,
      saving,
      dirty,
      select: setActive,
      patch,
      setField,
      addScenario,
      resetScenarios,
      addScenarioFrom,
      deleteFromBank,
      removeScenario,
      saveAll,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenarios, bank, safeActive, loaded, saving, dirty],
  );

  return <ScenariosContext.Provider value={value}>{children}</ScenariosContext.Provider>;
}

export function useScenarios(): ScenariosContextValue {
  const ctx = useContext(ScenariosContext);
  if (!ctx) throw new Error('useScenarios must be used within ScenariosProvider');
  return ctx;
}
