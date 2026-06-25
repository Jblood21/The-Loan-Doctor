import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { SettingsDrawer } from './SettingsDrawer';
import { UIProvider } from '@/context/UIContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { ScenariosProvider } from '@/context/ScenariosContext';

/** Authenticated app layout: sidebar + scrollable main + settings slide-over. */
export function AppShell() {
  return (
    <UIProvider>
      <SettingsProvider>
        <ScenariosProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="max-h-screen min-w-0 flex-1 overflow-y-auto">
              <div className="mx-auto max-w-content px-10 pb-20 pt-[34px]">
                <Outlet />
              </div>
            </main>
            <SettingsDrawer />
          </div>
        </ScenariosProvider>
      </SettingsProvider>
    </UIProvider>
  );
}
