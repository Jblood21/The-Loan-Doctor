import { Navigate, useSearchParams } from 'react-router-dom';
import { LogoMark } from '@/components/Logo';
import { useAuth } from '@/context/AuthContext';

/** Where a team invitation link lands: signed-in people go join, everyone else signs in first. */
export default function JoinTeam() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app">
        <div className="animate-lp-spin">
          <LogoMark size={44} glow />
        </div>
      </div>
    );
  }
  if (!token) return <Navigate to="/login" replace />;
  const t = encodeURIComponent(token);
  return <Navigate to={user ? `/billing?join=${t}` : `/login?invite=${t}`} replace />;
}
