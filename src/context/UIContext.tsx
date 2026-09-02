import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

interface UIContextValue {
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  /** Mobile navigation drawer (the sidebar collapses into an off-canvas drawer on phones). */
  navOpen: boolean;
  openNav: () => void;
  closeNav: () => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const value = useMemo<UIContextValue>(
    () => ({
      settingsOpen,
      openSettings: () => setSettingsOpen(true),
      closeSettings: () => setSettingsOpen(false),
      navOpen,
      openNav: () => setNavOpen(true),
      closeNav: () => setNavOpen(false),
    }),
    [settingsOpen, navOpen],
  );
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
