import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export interface ReportLine {
  label: string;
  value: string;
}

export interface ReportSection {
  /** Stable id (the tool key) — one section per tool in a report. */
  key: string;
  title: string;
  subtitle?: string;
  headline?: { label: string; value: string; sub?: string };
  inputs?: ReportLine[];
  rows: ReportLine[];
}

interface ReportContextValue {
  sections: ReportSection[];
  has: (key: string) => boolean;
  add: (section: ReportSection) => void;
  remove: (key: string) => void;
  /** Keep an already-included section's snapshot current as inputs change. */
  sync: (section: ReportSection) => void;
  clear: () => void;
}

const ReportContext = createContext<ReportContextValue | null>(null);
const STORAGE_KEY = 'loandr.report.sections';

function load(): ReportSection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(sections: ReportSection[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sections));
  } catch {
    /* storage may be unavailable */
  }
}

export function ReportProvider({ children }: { children: ReactNode }) {
  const [sections, setSections] = useState<ReportSection[]>(load);

  const commit = useCallback((next: ReportSection[]) => {
    setSections(next);
    save(next);
  }, []);

  const has = useCallback((key: string) => sections.some((s) => s.key === key), [sections]);

  const add = useCallback(
    (section: ReportSection) => {
      commit([...sections.filter((s) => s.key !== section.key), section]);
    },
    [sections, commit],
  );

  const remove = useCallback(
    (key: string) => {
      commit(sections.filter((s) => s.key !== key));
    },
    [sections, commit],
  );

  const sync = useCallback(
    (section: ReportSection) => {
      const existing = sections.find((s) => s.key === section.key);
      if (!existing) return; // only keep already-included sections current
      if (JSON.stringify(existing) === JSON.stringify(section)) return; // no change → avoid update loops
      commit(sections.map((s) => (s.key === section.key ? section : s)));
    },
    [sections, commit],
  );

  const clear = useCallback(() => commit([]), [commit]);

  const value = useMemo<ReportContextValue>(
    () => ({ sections, has, add, remove, sync, clear }),
    [sections, has, add, remove, sync, clear],
  );

  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
}

export function useReport(): ReportContextValue {
  const ctx = useContext(ReportContext);
  if (!ctx) throw new Error('useReport must be used within ReportProvider');
  return ctx;
}
