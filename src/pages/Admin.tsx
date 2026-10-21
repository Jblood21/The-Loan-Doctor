import { useEffect, useMemo, useState } from 'react';
import { AdminBilling } from '@/components/AdminBilling';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/context/AuthContext';
import { ApiError, api } from '@/lib/api';
import { initials, num } from '@/lib/format';
import type { AdminStat, AdminUser } from '@/types';

// Shown only if the stats/users API is unreachable — honest zeros, not fake data.
const FALLBACK_STATS: AdminStat[] = [
  { label: 'Total Users', value: '—', delta: 'unavailable' },
  { label: 'Scenarios Saved', value: '—', delta: 'unavailable' },
  { label: 'Active Users', value: '—', delta: 'unavailable' },
  { label: 'Pre-Approvals', value: '—', delta: 'unavailable' },
];

const FALLBACK_USERS: AdminUser[] = [];

const AVATAR_PALETTE = [
  'linear-gradient(135deg,#2f80ed,#2dd4bf)',
  'linear-gradient(135deg,#a78bfa,#f0abfc)',
  'linear-gradient(135deg,#fbbf24,#fb923c)',
  'linear-gradient(135deg,#34d399,#2dd4bf)',
  'linear-gradient(135deg,#f87171,#fbbf24)',
];

const STATUS_TINT: Record<string, { bg: string; fg: string }> = {
  Active: { bg: 'rgba(52,211,153,.16)', fg: '#34d399' },
  Trial: { bg: 'rgba(251,191,36,.16)', fg: '#fbbf24' },
  Inactive: { bg: 'rgba(140,165,195,.14)', fg: '#8ba0b6' },
};

const COLS = '1.5fr 1.9fr 1.1fr 0.8fr 1.3fr 1.5fr';

const ACCESS_TINT: Record<string, { bg: string; fg: string }> = {
  trial: { bg: 'rgba(251,191,36,.16)', fg: '#fbbf24' },
  subscribed: { bg: 'rgba(52,211,153,.16)', fg: '#34d399' },
  team: { bg: 'rgba(52,211,153,.16)', fg: '#34d399' },
  comp: { bg: 'rgba(47,128,237,.16)', fg: '#5fa8f5' },
  locked: { bg: 'rgba(248,113,113,.16)', fg: '#f87171' },
  exempt: { bg: 'rgba(140,165,195,.14)', fg: '#8ba0b6' },
  off: { bg: 'rgba(140,165,195,.14)', fg: '#8ba0b6' },
};

const GRANTS = [
  { value: '', label: 'Give free access…' },
  { value: 'forever', label: 'Free, no end date' },
  { value: '3', label: 'Free for 3 months' },
  { value: '6', label: 'Free for 6 months' },
  { value: '12', label: 'Free for 12 months' },
];

export default function Admin() {
  const { isAdmin } = useAuth();
  const [stats, setStats] = useState<AdminStat[]>(FALLBACK_STATS);
  const [users, setUsers] = useState<AdminUser[]>(FALLBACK_USERS);
  const [accessError, setAccessError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const [s, u] = await Promise.all([api.adminStats(), api.adminUsers()]);
        if (cancelled) return;
        if (s.stats?.length) setStats(s.stats);
        if (u.users?.length) setUsers(u.users);
      } catch {
        /* keep fallback sample data */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const swapUser = (next: AdminUser) => setUsers((list) => list.map((u) => (u.id === next.id ? { ...u, ...next } : u)));

  const grant = async (u: AdminUser, value: string) => {
    if (!value) return;
    setAccessError('');
    try {
      const { user } = await api.adminGrantFree(u.id, value === 'forever' ? { mode: 'forever' } : { mode: 'months', months: Number(value) });
      swapUser(user);
    } catch (err) {
      setAccessError(err instanceof ApiError ? err.message : 'Could not change access.');
    }
  };

  const removeFree = async (u: AdminUser) => {
    setAccessError('');
    try {
      swapUser((await api.adminRemoveFree(u.id)).user);
    } catch (err) {
      setAccessError(err instanceof ApiError ? err.message : 'Could not change access.');
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.company || '').toLowerCase().includes(q),
    );
  }, [users, query]);

  if (!isAdmin) {
    return (
      <div className="animate-lp-fade">
        <PageHeader title="Admin Dashboard" subtitle="Monitor usage, manage accounts, and review collected data." />
        <Card className="p-10 text-center">
          <div className="text-[16px] font-semibold text-text-heading">Admins only</div>
          <p className="mt-2 text-[14px] text-text-muted">
            This area is restricted to administrator accounts. Sign in with your admin credentials to view usage data.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-lp-fade">
      <PageHeader title="Admin Dashboard" subtitle="Monitor usage, manage accounts, and review collected data." />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((st) => (
          <Card key={st.label} className="p-5">
            <div className="text-[12.5px] font-semibold text-text-muted">{st.label}</div>
            <div className="num my-1 text-[30px] font-semibold tracking-[-0.5px] text-text-heading">{st.value}</div>
            <div className="text-[12px] font-semibold text-good">{st.delta}</div>
          </Card>
        ))}
      </div>

      <AdminBilling />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-[22px] py-[18px]">
          <span className="text-[15px] font-semibold">Users</span>
          <TextField
            placeholder="Search users…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="!h-9 !w-full !rounded-[9px] !bg-input !text-[13px] sm:!w-[220px]"
          />
        </div>
        {accessError && <div className="border-b border-border bg-danger-tint px-[22px] py-2.5 text-[13px] text-danger">{accessError}</div>}
        {/* Horizontal scroll on phones keeps the table readable instead of clipping it. */}
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div
              className="grid border-b border-[rgba(140,165,195,0.08)] px-[22px] py-3 text-[11.5px] font-bold tracking-[0.5px] text-text-dim"
              style={{ gridTemplateColumns: COLS }}
            >
              <span>NAME</span>
              <span>EMAIL</span>
              <span>COMPANY</span>
              <span>SCENARIOS</span>
              <span>ACCESS</span>
              <span>FREE ACCESS</span>
            </div>
            {filtered.map((u, i) => {
              const access = ACCESS_TINT[u.access?.state || ''] || STATUS_TINT[u.status || 'Active'] || STATUS_TINT.Active;
              return (
                <div
                  key={u.id}
                  className="grid items-center border-b border-[rgba(140,165,195,0.06)] px-[22px] py-3.5 text-[13.5px]"
                  style={{ gridTemplateColumns: COLS }}
                >
                  <span className="flex items-center gap-2.5 font-semibold text-text-primary">
                    <span
                      className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-[12px] font-bold text-on-brand"
                      style={{ background: AVATAR_PALETTE[i % AVATAR_PALETTE.length] }}
                    >
                      {initials(u.name)}
                    </span>
                    {u.name}
                  </span>
                  <span className="text-text-soft">{u.email}</span>
                  <span className="text-text-soft">{u.company}</span>
                  <span className="num text-text-softer">{num(u.scenarioCount || 0)}</span>
                  <span>
                    <span
                      className="rounded-[20px] px-[11px] py-1 text-[11.5px] font-semibold"
                      style={{ background: access.bg, color: access.fg }}
                      title={`Account status: ${u.status || 'Active'}${u.team ? ` · Team: ${u.team}` : ''}`}
                    >
                      {u.access?.label || u.status || 'Active'}
                    </span>
                  </span>
                  <span>
                    {u.role === 'admin' ? (
                      <span className="text-text-dim">—</span>
                    ) : u.access?.state === 'comp' ? (
                      <button
                        onClick={() => removeFree(u)}
                        className="cursor-pointer border-none bg-transparent text-[12.5px] font-semibold text-danger hover:underline"
                        aria-label={`Remove free access for ${u.name}`}
                      >
                        Remove free access
                      </button>
                    ) : (
                      <select
                        value=""
                        onChange={(e) => grant(u, e.target.value)}
                        aria-label={`Give free access to ${u.name}`}
                        className="h-8 max-w-full cursor-pointer rounded-[8px] border border-border-input bg-input px-2 text-[12.5px] text-text-primary"
                      >
                        {GRANTS.map((g) => (
                          <option key={g.value} value={g.value}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </span>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-[22px] py-6 text-[13.5px] text-text-muted">No users match “{query}”.</div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
