import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { AppShell } from '@/components/AppShell';
import { LogoMark } from '@/components/Logo';
import { HolidayDecor } from '@/components/holiday/HolidayDecor';
import Login from '@/pages/Login';
import Compare from '@/pages/Compare';
import Hecm from '@/pages/Hecm';
import PreApproval from '@/pages/PreApproval';
import Tools from '@/pages/Tools';
import Help from '@/pages/Help';
import Admin from '@/pages/Admin';
import Agents from '@/pages/Agents';
import SharedQuote from '@/pages/SharedQuote';
import AgentPortal from '@/pages/AgentPortal';
import AgentShare from '@/pages/AgentShare';
import ResetPassword from '@/pages/ResetPassword';
import Billing from '@/pages/Billing';
import JoinTeam from '@/pages/JoinTeam';

/** Window/tab title per page, so several windows are easy to tell apart in the taskbar. */
const PAGE_TITLES: [prefix: string, title: string][] = [
  ['/compare', 'Compare Loans'],
  ['/hecm', 'Reverse (HECM)'],
  ['/pre-approval', 'Pre-Approval'],
  ['/agents', 'Agents'],
  ['/tools', 'Tools'],
  ['/help', 'Help Center'],
  ['/admin', 'Admin'],
  ['/billing', 'Plan & billing'],
  ['/join-team', 'Join your team'],
  ['/agent', 'Agent Portal'],
  ['/login', 'Sign in'],
  ['/reset-password', 'Reset password'],
  ['/q/', 'Your loan quote'],
  ['/s/', 'Shared with you'],
];

function RouteTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const hit = PAGE_TITLES.find(([prefix]) => pathname === prefix.replace(/\/$/, '') || pathname.startsWith(prefix.endsWith('/') ? prefix : prefix + '/'));
    document.title = hit ? `${hit[1]} · Basecamp` : 'Basecamp — Loan Officer Workspace';
  }, [pathname]);
  return null;
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app">
      <div className="animate-lp-spin">
        <LogoMark size={44} glow />
      </div>
    </div>
  );
}

/** Renders the app for authenticated users, otherwise sends to /login. */
function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell />;
}

function LoginGate() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const invite = params.get('invite');
  if (loading) return <Splash />;
  // Someone who followed a team invitation goes on to join the team once signed in.
  if (user) return <Navigate to={invite ? `/billing?join=${encodeURIComponent(invite)}` : '/compare'} replace />;
  return <Login />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public borrower-facing shared quote — no login required. */}
      <Route path="/q/:id" element={<SharedQuote />} />
      {/* Public real-estate agent portal — its own login surface. */}
      <Route path="/agent" element={<AgentPortal />} />
      {/* Public buyer-facing share links (pre-approval letter / affordability). */}
      <Route path="/s/:token" element={<AgentShare />} />
      {/* Public self-serve password reset reached from the emailed link. */}
      <Route path="/reset-password" element={<ResetPassword />} />
      {/* Team invitation links land here, then go to sign-in or the plan page. */}
      <Route path="/join-team" element={<JoinTeam />} />
      <Route path="/login" element={<LoginGate />} />
      <Route element={<RequireAuth />}>
        <Route path="/compare" element={<Compare />} />
        <Route path="/hecm" element={<Hecm />} />
        <Route path="/pre-approval" element={<PreApproval />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/help" element={<Help />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/" element={<Navigate to="/compare" replace />} />
        <Route path="*" element={<Navigate to="/compare" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <RouteTitle />
      <HolidayDecor />
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
