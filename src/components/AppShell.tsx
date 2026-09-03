import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { SettingsDrawer } from './SettingsDrawer';
import { Logo } from './Logo';
import { UIProvider, useUI } from '@/context/UIContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { ScenariosProvider } from '@/context/ScenariosContext';
import { ReportProvider } from '@/context/ReportContext';

/** Top bar shown only on phones/tablets — carries the hamburger that opens the nav drawer. */
function MobileTopBar() {
  const { openNav } = useUI();
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-sidebar/95 px-4 py-3 backdrop-blur lg:hidden">
      <button
        onClick={openNav}
        aria-label="Open menu"
        className="flex h-[38px] w-[38px] items-center justify-center rounded-[9px] border border-border bg-transparent text-text-soft transition-colors hover:bg-[rgba(140,165,195,0.08)]"
      >
        <Menu size={20} />
      </button>
      <Logo size={28} wordmark={17} />
    </header>
  );
}

/** Authenticated app layout: sidebar + scrollable main + settings slide-over. */
export function AppShell() {
  return (
    <UIProvider>
      <SettingsProvider>
        <ScenariosProvider>
          <ReportProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="max-h-screen min-w-0 flex-1 overflow-y-auto">
              <MobileTopBar />
              <div className="mx-auto max-w-content px-4 pb-16 pt-5 sm:px-6 lg:px-10 lg:pb-20 lg:pt-[34px]">
                <Outlet />
              </div>
            </main>
            <SettingsDrawer />
          </div>
          </ReportProvider>
        </ScenariosProvider>
      </SettingsProvider>
    </UIProvider>
  );
}
