import { NavLink } from 'react-router-dom';
import {
  BarChart2,
  Building2,
  FileText,
  Wrench,
  HelpCircle,
  LayoutDashboard,
  Settings as SettingsIcon,
  LogOut,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { Logo } from './Logo';
import { useAuth } from '@/context/AuthContext';
import { useUI } from '@/context/UIContext';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number | string }>;
}

const WORKSPACE: NavItem[] = [
  { to: '/compare', label: 'Compare Loans', icon: BarChart2 },
  { to: '/hecm', label: 'Reverse (HECM)', icon: Building2 },
  { to: '/pre-approval', label: 'Pre-Approval', icon: FileText },
  { to: '/tools', label: 'Tools', icon: Wrench },
  { to: '/help', label: 'Help Center', icon: HelpCircle },
];

const ADMIN: NavItem[] = [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard }];

function navClass({ isActive }: { isActive: boolean }) {
  return [
    'flex items-center gap-3 rounded-[9px] px-3 py-[10px] text-[14px] cursor-pointer text-left transition-colors',
    isActive
      ? 'bg-[rgba(47,128,237,0.14)] text-brand-blue-nav font-semibold'
      : 'text-text-soft font-medium hover:bg-[rgba(140,165,195,0.07)]',
  ].join(' ');
}

function GroupLabel({ children }: { children: string }) {
  return <div className="px-[10px] pb-2 pt-5 text-[11px] font-bold tracking-[0.8px] text-text-dim2">{children}</div>;
}

export function Sidebar() {
  const { logout, isAdmin } = useAuth();
  const { openSettings, navOpen, closeNav } = useUI();

  return (
    <>
      {/* Scrim behind the drawer on mobile only. */}
      {navOpen && (
        <div
          onClick={closeNav}
          aria-hidden
          className="fixed inset-0 z-40 bg-[rgba(4,9,15,0.6)] backdrop-blur-[2px] lg:hidden"
        />
      )}

      <aside
        className={[
          // On phones the sidebar is an off-canvas drawer; on lg+ it's a sticky column.
          'fixed inset-y-0 left-0 z-50 flex h-screen w-[236px] flex-shrink-0 flex-col border-r border-border bg-sidebar p-4 pt-[22px]',
          'transform transition-transform duration-200 ease-out',
          navOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:sticky lg:top-0 lg:z-auto lg:translate-x-0',
        ].join(' ')}
      >
        <div className="px-2 pb-[22px] pt-1.5">
          <Logo size={34} wordmark={19} />
        </div>

        <GroupLabel>WORKSPACE</GroupLabel>
        <nav className="flex flex-col gap-[3px]">
          {WORKSPACE.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={closeNav} className={navClass}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {isAdmin && (
          <>
            <GroupLabel>ADMIN</GroupLabel>
            <nav className="flex flex-col gap-[3px]">
              {ADMIN.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} onClick={closeNav} className={navClass}>
                  <Icon size={18} />
                  {label}
                </NavLink>
              ))}
            </nav>
          </>
        )}

        <div className="mt-auto flex flex-col gap-[3px] border-t border-border pt-4">
          <button
            onClick={() => {
              closeNav();
              openSettings();
            }}
            className="flex items-center gap-3 rounded-[9px] border-none bg-transparent px-3 py-[10px] text-left text-[14px] font-medium text-text-soft transition-colors hover:bg-[rgba(140,165,195,0.07)]"
          >
            <SettingsIcon size={18} />
            Settings
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-3 rounded-[9px] border-none bg-transparent px-3 py-[10px] text-left text-[14px] font-medium text-text-soft transition-colors hover:bg-[rgba(248,113,113,0.1)] hover:text-danger"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
