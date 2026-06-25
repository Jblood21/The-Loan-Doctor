import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { initials, num } from '@/lib/format';
import type { AdminStat, User } from '@/types';

const FALLBACK_STATS: AdminStat[] = [
  { label: 'Total Users', value: '1,284', delta: '+38 this week' },
  { label: 'Scenarios Saved', value: '7,932', delta: '+412 this week' },
  { label: 'Active Today', value: '196', delta: '+12% vs. last week' },
  { label: 'Pre-Approvals', value: '543', delta: '+27 this week' },
];

const FALLBACK_USERS: User[] = [
  { id: '1', name: 'Sarah Chen', email: 'sarah.chen@summitlend.com', company: 'Summit Lending', nmls: '', role: 'user', status: 'Active', scenarioCount: 42 },
  { id: '2', name: 'Marcus Webb', email: 'm.webb@bayfinance.com', company: 'Bay Finance', nmls: '', role: 'user', status: 'Active', scenarioCount: 18 },
  { id: '3', name: 'Elena Ruiz', email: 'elena@homefirstmtg.com', company: 'HomeFirst Mortgage', nmls: '', role: 'user', status: 'Trial', scenarioCount: 7 },
  { id: '4', name: 'David Okafor', email: 'd.okafor@apexloans.com', company: 'Apex Loans', nmls: '', role: 'user', status: 'Active', scenarioCount: 63 },
  { id: '5', name: 'Priya Patel', email: 'priya.patel@northstarfg.com', company: 'Northstar Funding', nmls: '', role: 'user', status: 'Inactive', scenarioCount: 29 },
];

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

const COLS = '1.6fr 2fr 1.2fr 1fr 0.9fr';

export default function Admin() {
  const { isAdmin } = useAuth();
  const [stats, setStats] = useState<AdminStat[]>(FALLBACK_STATS);
  const [users, setUsers] = useState<User[]>(FALLBACK_USERS);
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
            Sign in with an administrator account (e.g. <strong>admin@loandr.app</strong>) to view usage data.
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

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-[22px] py-[18px]">
          <span className="text-[15px] font-semibold">Users</span>
          <TextField
            placeholder="Search users…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="!h-9 !w-[220px] !rounded-[9px] !bg-input !text-[13px]"
          />
        </div>
        <div
          className="grid border-b border-[rgba(140,165,195,0.08)] px-[22px] py-3 text-[11.5px] font-bold tracking-[0.5px] text-text-dim"
          style={{ gridTemplateColumns: COLS }}
        >
          <span>NAME</span>
          <span>EMAIL</span>
          <span>COMPANY</span>
          <span>SCENARIOS</span>
          <span>STATUS</span>
        </div>
        {filtered.map((u, i) => {
          const tint = STATUS_TINT[u.status || 'Active'] || STATUS_TINT.Active;
          return (
            <div
              key={u.id}
              className="grid items-center border-b border-[rgba(140,165,195,0.06)] px-[22px] py-3.5 text-[13.5px]"
              style={{ gridTemplateColumns: COLS }}
            >
              <span className="flex items-center gap-2.5 font-semibold text-text-primary">
                <span
                  className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-[12px] font-bold text-app"
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
                  style={{ background: tint.bg, color: tint.fg }}
                >
                  {u.status || 'Active'}
                </span>
              </span>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-[22px] py-6 text-[13.5px] text-text-muted">No users match “{query}”.</div>
        )}
      </Card>
    </div>
  );
}
