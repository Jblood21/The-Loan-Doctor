import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, getToken, setToken, ApiError } from '@/lib/api';
import type { User } from '@/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  register: (data: { email: string; password: string; name?: string; company?: string; code?: string }) => Promise<void>;
  logout: () => void;
  updateProfile: (data: Partial<User>) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount. Only a genuine 401 (expired/invalid token) logs you
  // out; transient failures (e.g. the server waking up) are retried so a cold start
  // never drops a valid session.
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        try {
          const { user: u } = await api.me();
          if (!cancelled) setUser(u);
          break;
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            setToken(null); // token really is invalid — clear it
            break;
          }
          // transient (network / cold start) — wait and retry, keep the token
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }
      if (!cancelled) setLoading(false);
    }
    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string, remember = true) => {
    const { token, user: u } = await api.login({ email, password });
    setToken(token, remember);
    setUser(u);
  };

  const register = async (data: { email: string; password: string; name?: string; company?: string; code?: string }) => {
    const { token, user: u } = await api.register(data);
    setToken(token, true);
    setUser(u);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const updateProfile = async (data: Partial<User>) => {
    const { user: u } = await api.updateProfile(data);
    setUser(u);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await api.changePassword({ currentPassword, newPassword });
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAdmin: user?.role === 'admin',
      login,
      register,
      logout,
      updateProfile,
      changePassword,
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
