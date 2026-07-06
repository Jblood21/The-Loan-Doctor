import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { AppShell } from '@/components/AppShell';
import { LogoMark } from '@/components/Logo';
import Login from '@/pages/Login';
import Compare from '@/pages/Compare';
import Hecm from '@/pages/Hecm';
import PreApproval from '@/pages/PreApproval';
import Tools from '@/pages/Tools';
import Help from '@/pages/Help';
import Admin from '@/pages/Admin';
import SharedQuote from '@/pages/SharedQuote';

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
  if (loading) return <Splash />;
  if (user) return <Navigate to="/compare" replace />;
  return <Login />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public borrower-facing shared quote — no login required. */}
      <Route path="/q/:id" element={<SharedQuote />} />
      <Route path="/login" element={<LoginGate />} />
      <Route element={<RequireAuth />}>
        <Route path="/compare" element={<Compare />} />
        <Route path="/hecm" element={<Hecm />} />
        <Route path="/pre-approval" element={<PreApproval />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/help" element={<Help />} />
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
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
