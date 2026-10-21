import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, BILLING_REQUIRED_EVENT } from '@/lib/api';
import type { BillingStatus } from '@/types';

interface BillingContextValue {
  /** Null until the first load finishes, or if the server can't be reached. */
  status: BillingStatus | null;
  /** True once the first attempt to read the plan has finished (even if it failed). */
  loaded: boolean;
  /** Re-read the plan (e.g. after the server says it lapsed, or after a purchase). */
  refresh: () => Promise<void>;
  /** Swap in a fresher status that an action already returned. */
  setStatus: (s: BillingStatus) => void;
}

const BillingContext = createContext<BillingContextValue | null>(null);

export function BillingProvider({ children }: { children: ReactNode }) {
  const [status, setStatusState] = useState<BillingStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Each read of the plan gets a number; a reply only counts if nothing newer has landed.
  // Without this, a slow first read could arrive after a purchase and bring the old
  // "locked" state back.
  const latest = useRef(0);

  const setStatus = useCallback((next: BillingStatus) => {
    latest.current += 1;
    setStatusState(next);
  }, []);

  const refresh = useCallback(async () => {
    const mine = ++latest.current;
    try {
      const next = await api.billingStatus();
      if (mine === latest.current) setStatusState(next);
    } catch {
      /* leave the last known plan in place; the server still enforces it either way */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
    const onLapsed = () => void refresh();
    window.addEventListener(BILLING_REQUIRED_EVENT, onLapsed);
    return () => window.removeEventListener(BILLING_REQUIRED_EVENT, onLapsed);
  }, [refresh]);

  const value = useMemo(() => ({ status, loaded, refresh, setStatus }), [status, loaded, refresh, setStatus]);
  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling(): BillingContextValue {
  const ctx = useContext(BillingContext);
  if (!ctx) throw new Error('useBilling must be used within BillingProvider');
  return ctx;
}
