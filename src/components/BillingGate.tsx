import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { LogoMark } from '@/components/Logo';
import { useBilling } from '@/context/BillingContext';

// A locked account can still read the plan page, get help, and look at Settings.
const ALWAYS_OPEN = ['/billing', '/help'];

/**
 * Sends someone whose plan has lapsed to the plan page. The server is what really
 * enforces this; this just makes the lock a clear page rather than a string of errors.
 */
export function BillingGate({ children }: { children: ReactNode }) {
  const { status, loaded } = useBilling();
  const { pathname } = useLocation();
  const open = ALWAYS_OPEN.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!loaded && !open) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="animate-lp-spin">
          <LogoMark size={36} glow />
        </div>
      </div>
    );
  }
  if (status?.enabled && status.access.state === 'locked' && !open) return <Navigate to="/billing" replace />;
  return <>{children}</>;
}
