import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Copy, Download, Gift, Users, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { useBilling } from '@/context/BillingContext';
import { ApiError, api } from '@/lib/api';
import { dollars, longDate, needsPlan, plural, yearlySavingsPct } from '@/lib/billing';
import type { BillingStatus } from '@/types';

type Notice = { tone: 'good' | 'warn' | 'danger'; text: string };

const NOTICE_TONES = {
  good: 'border-success bg-success-tint text-good',
  warn: 'border-[rgba(251,191,36,0.35)] bg-warning-tint text-warn',
  danger: 'border-danger bg-danger-tint text-danger',
} as const;

const messageOf = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');

function SectionTitle({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <h2 className="m-0 mb-1 flex items-center gap-2 text-[15px] font-semibold text-text-heading">
      {icon}
      {children}
    </h2>
  );
}

/** One plain sentence pair describing where this person stands. */
function describe(status: BillingStatus): { title: string; detail: string } {
  const { access: a, subscription: sub, team, plans } = status;
  switch (a.state) {
    case 'off':
      return { title: 'Billing is not turned on', detail: 'Everything is free to use right now.' };
    case 'exempt':
      return { title: 'Owner account', detail: 'No plan needed.' };
    case 'comp':
      return a.forever
        ? { title: 'Free access', detail: 'No card needed and no end date.' }
        : { title: 'Free access', detail: `Runs until ${longDate(a.endsAt)}.` };
    case 'team':
      return {
        title: `Covered by ${team?.name ?? 'your team'}`,
        detail: a.cancelAtPeriodEnd ? `Your team's plan ends on ${longDate(a.endsAt)}.` : 'Your team pays, so there is nothing for you to pay.',
      };
    case 'subscribed': {
      const yearly = sub?.interval === 'year';
      const price = yearly ? `${dollars(plans.soloAnnualMonthlyCents * 12)} a year` : `${dollars(plans.soloMonthlyCents)} a month`;
      const when = a.cancelAtPeriodEnd ? `Ends on ${longDate(a.endsAt)}.` : `Renews on ${longDate(a.endsAt)}.`;
      return { title: `Solo plan, ${yearly ? 'yearly' : 'monthly'}`, detail: `${price}. ${when}` };
    }
    case 'trial':
      return { title: 'Free trial', detail: `${plural(a.daysLeft ?? 0, 'day')} left. It ends on ${longDate(a.endsAt)}.` };
    default:
      return { title: 'No active plan', detail: '' };
  }
}

const LOCKED_TITLE = {
  trial_ended: 'Your free trial has ended',
  canceled: 'Your plan has ended',
  comp_ended: 'Your free access has ended',
} as const;

export default function Billing() {
  const { status, loaded, refresh, setStatus } = useBilling();
  const [params, setParams] = useSearchParams();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState('');
  const [billEvery, setBillEvery] = useState<'month' | 'year'>('year');
  const [code, setCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [copied, setCopied] = useState('');
  const handledReturn = useRef(false);

  // Coming back from Stripe Checkout, or following a team invitation link.
  useEffect(() => {
    if (handledReturn.current) return;
    const checkout = params.get('checkout');
    const sessionId = params.get('session_id');
    const join = params.get('join');
    if (!checkout && !join) return;
    handledReturn.current = true;
    setParams({}, { replace: true });
    (async () => {
      if (checkout === 'canceled') {
        setNotice({ tone: 'warn', text: 'Checkout was cancelled, so nothing was charged.' });
      } else if (checkout === 'success' && sessionId) {
        try {
          setStatus(await api.billingSync(sessionId));
          setNotice({ tone: 'good', text: "You're all set. Thanks for subscribing!" });
        } catch {
          await refresh();
          setNotice({ tone: 'warn', text: "Your payment went through, but we're still confirming it. Refresh this page in a minute." });
        }
      } else if (join) {
        try {
          const next = await api.teamJoin(join);
          setStatus(next);
          setNotice({ tone: 'good', text: `You joined ${next.team?.name ?? 'the team'}.` });
        } catch (err) {
          setNotice({ tone: 'danger', text: messageOf(err) });
        }
      }
    })();
  }, [params, setParams, refresh, setStatus]);

  /** Run an action with a busy label and a friendly error. */
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setNotice({ tone: 'danger', text: messageOf(err) });
    } finally {
      setBusy('');
    }
  };

  const goToCheckout = (key: string, plan: 'solo' | 'team') =>
    run(key, async () => {
      const { url } = await api.billingCheckout(plan, plan === 'solo' ? billEvery : undefined);
      window.location.assign(url);
    });

  const openPortal = (scope: 'user' | 'org') =>
    run('portal', async () => {
      const { url } = await api.billingPortal(scope);
      window.location.assign(url);
    });

  const redeem = (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    void run('redeem', async () => {
      const out = await api.billingRedeem(code.trim());
      setStatus(out.status);
      setCode('');
      setNotice({ tone: 'good', text: out.already ? out.message : `Code applied. ${out.message}` });
    });
  };

  const downloadData = () =>
    run('export', async () => {
      const data = await api.billingExport();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'basecamp-my-data.json';
      a.click();
      URL.revokeObjectURL(url);
    });

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      setNotice({ tone: 'warn', text: 'Copying was blocked by the browser. Select the link and copy it by hand.' });
    }
  };

  if (!loaded) return null;
  if (!status) {
    return (
      <div className="animate-lp-fade">
        <PageHeader title="Plan & billing" />
        <Card className="p-8 text-center text-[14px] text-text-muted">
          We couldn't load your plan right now. Check your connection and{' '}
          <button onClick={() => void refresh()} className="cursor-pointer border-none bg-transparent font-semibold text-brand-blue-light underline">
            try again
          </button>
          .
        </Card>
      </div>
    );
  }

  const { access, plans, team } = status;
  const locked = access.state === 'locked';
  const now = describe(status);
  const showPlans = needsPlan(status);
  const canPay = status.stripeReady;
  const savings = yearlySavingsPct(plans);
  const yearlyTotal = plans.soloAnnualMonthlyCents * 12;
  const isOwner = team?.role === 'owner';
  const teamActive = !!team?.subscription && ['active', 'trialing', 'past_due'].includes(team.subscription.status);
  const manageScope: 'user' | 'org' | null =
    access.state === 'subscribed' ? 'user' : isOwner && teamActive ? 'org' : null;

  return (
    <div className="animate-lp-fade">
      <PageHeader title="Plan & billing" subtitle="Your plan, your team, and any access code you've been given." />

      {notice && (
        <div role="status" className={`mb-5 rounded-[11px] border px-4 py-3 text-[13.5px] ${NOTICE_TONES[notice.tone]}`}>
          {notice.text}
        </div>
      )}

      {/* Where you stand */}
      <Card className={`mb-5 p-6 ${locked ? 'border-[rgba(251,191,36,0.4)]' : ''}`}>
        {locked ? (
          <>
            <div className="text-[20px] font-semibold text-text-heading">{LOCKED_TITLE[access.lockedReason ?? 'trial_ended']}</div>
            <p className="mb-0 mt-1.5 max-w-[620px] text-[14px] leading-[1.6] text-text-muted">
              Your scenarios, settings and saved work are all still here. Choose a plan to pick up where you left off, or
              download a copy of your data first.
            </p>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[12px] font-bold uppercase tracking-[0.6px] text-text-dim">Your plan</div>
              <div className="mt-1 text-[20px] font-semibold text-text-heading">{now.title}</div>
              <div className="mt-0.5 text-[14px] text-text-muted">{now.detail}</div>
            </div>
            {manageScope && (
              <Button variant="secondary" disabled={busy === 'portal'} onClick={() => openPortal(manageScope)}>
                Manage subscription
              </Button>
            )}
          </div>
        )}
        {access.paymentIssue && (
          <div className="mt-4 rounded-[10px] border border-danger bg-danger-tint px-3.5 py-2.5 text-[13px] text-danger">
            We couldn't take your last payment.{' '}
            {manageScope ? (
              <button onClick={() => openPortal(manageScope)} className="cursor-pointer border-none bg-transparent font-semibold text-danger underline">
                Update your card
              </button>
            ) : (
              'Ask your team owner to update the card.'
            )}
          </div>
        )}
      </Card>

      {/* Pick a plan */}
      {showPlans && (
        <div className="mb-5 grid gap-4 md:grid-cols-2">
          <Card className="flex flex-col p-6">
            <SectionTitle>Solo</SectionTitle>
            <p className="mb-4 mt-0 text-[13.5px] text-text-muted">For one loan officer. Everything in the workspace.</p>
            <SegmentedControl<'month' | 'year'>
              size="sm"
              options={[
                { value: 'month', label: 'Monthly' },
                { value: 'year', label: savings > 0 ? `Yearly · save ${savings}%` : 'Yearly' },
              ]}
              value={billEvery}
              onChange={setBillEvery}
            />
            <div className="mt-5 flex items-baseline gap-1.5">
              <span className="num text-[34px] font-semibold tracking-[-1px] text-text-heading">
                {dollars(billEvery === 'year' ? plans.soloAnnualMonthlyCents : plans.soloMonthlyCents)}
              </span>
              <span className="text-[14px] text-text-muted">per month</span>
            </div>
            <div className="mb-5 min-h-[20px] text-[12.5px] text-text-muted">
              {billEvery === 'year' ? `Billed ${dollars(yearlyTotal)} once a year.` : 'Billed monthly. Cancel any time.'}
            </div>
            <Button variant="primary" size="lg" className="mt-auto" disabled={!canPay || busy === 'solo'} onClick={() => goToCheckout('solo', 'solo')}>
              {busy === 'solo' ? 'Opening checkout…' : 'Subscribe'}
            </Button>
            {access.state === 'trial' && (access.daysLeft ?? 0) > 3 && canPay && (
              <div className="mt-2 text-[12px] text-text-muted">Your first charge waits until your free trial ends.</div>
            )}
          </Card>

          <Card className="flex flex-col p-6">
            <SectionTitle icon={<Users size={16} />}>Team</SectionTitle>
            <p className="mb-4 mt-0 text-[13.5px] text-text-muted">One company pays for all its loan officers. You add and remove people any time.</p>
            <div className="flex items-baseline gap-1.5">
              <span className="num text-[34px] font-semibold tracking-[-1px] text-text-heading">{dollars(plans.teamSeatCents)}</span>
              <span className="text-[14px] text-text-muted">per loan officer, per month</span>
            </div>
            <div className="mb-5 text-[12.5px] text-text-muted">Billed for at least {plural(plans.teamMinSeats, 'seat')}.</div>
            {!team ? (
              <form
                className="mt-auto flex flex-col gap-2.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run('team', async () => setStatus(await api.teamCreate(teamName.trim())));
                }}
              >
                <TextField placeholder="Company or team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} aria-label="Team name" />
                <Button type="submit" variant="secondary" size="lg" disabled={busy === 'team'}>
                  Create a team
                </Button>
              </form>
            ) : isOwner ? (
              <Button
                variant="primary"
                size="lg"
                className="mt-auto"
                disabled={!canPay || busy === 'team' || teamActive}
                onClick={() => goToCheckout('team', 'team')}
              >
                {teamActive ? 'Team plan active' : `Subscribe ${team.name} (${plural(team.seatsBilled, 'seat')}, ${dollars(team.seatsBilled * team.seatCents)}/mo)`}
              </Button>
            ) : (
              <div className="mt-auto rounded-[10px] bg-surface-tint px-3.5 py-2.5 text-[13px] text-text-muted">
                You're on {team.name}. Ask the team owner to subscribe the team.
              </div>
            )}
          </Card>
          {!canPay && (
            <div className="md:col-span-2 rounded-[10px] border border-[rgba(251,191,36,0.3)] bg-warning-tint px-4 py-2.5 text-[13px] text-warn">
              Online payment isn't switched on yet. If you have an access code, enter it below.
            </div>
          )}
        </div>
      )}

      {/* Team */}
      {team && (
        <Card className="mb-5 p-6">
          <SectionTitle icon={<Users size={16} />}>{team.name}</SectionTitle>
          <p className="mb-4 mt-0 text-[13.5px] text-text-muted">
            {isOwner
              ? `${team.members.length === 1 ? '1 person' : `${team.members.length} people`} on the team. Billed for ${plural(team.seatsBilled, 'seat')}, ${dollars(team.seatsBilled * team.seatCents)} a month.`
              : 'You are a member of this team.'}
          </p>
          {team.seatSyncError && (
            <div className="mb-3 rounded-[10px] border border-danger bg-danger-tint px-3.5 py-2.5 text-[13px] text-danger">
              We couldn't update the seat count with the payment provider. It will be corrected next time the team changes, or contact support.
            </div>
          )}

          <div className="overflow-hidden rounded-[11px] border border-border">
            {team.members.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-[13.5px] last:border-b-0">
                <div className="min-w-0">
                  <span className="font-semibold text-text-primary">{m.name || m.email}</span>{' '}
                  <span className="text-text-muted">{m.name ? m.email : ''}</span>
                  {m.role === 'owner' && <span className="ml-2 rounded-[20px] bg-surface-tint px-2 py-0.5 text-[11px] font-semibold text-text-muted">Owner</span>}
                </div>
                {isOwner && m.role !== 'owner' && (
                  <button
                    onClick={() => run('remove', async () => setStatus(await api.teamRemoveMember(m.id)))}
                    className="cursor-pointer border-none bg-transparent text-[12.5px] font-semibold text-danger hover:underline"
                    aria-label={`Remove ${m.name || m.email}`}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {team.invites.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-tint px-4 py-2.5 text-[13.5px] last:border-b-0">
                <div className="min-w-0 text-text-muted">
                  <span className="font-semibold text-text-primary">{i.email}</span> · invited, expires {longDate(i.expiresAt)}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => copy(i.id, i.link)}
                    className="inline-flex cursor-pointer items-center gap-1.5 border-none bg-transparent text-[12.5px] font-semibold text-brand-blue-light hover:underline"
                  >
                    {copied === i.id ? <Check size={14} /> : <Copy size={14} />}
                    {copied === i.id ? 'Copied' : 'Copy link'}
                  </button>
                  <button
                    onClick={() => run('cancel', async () => setStatus(await api.teamCancelInvite(i.id)))}
                    className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent text-[12.5px] font-semibold text-danger hover:underline"
                    aria-label={`Cancel invitation for ${i.email}`}
                  >
                    <X size={14} /> Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>

          {isOwner ? (
            <form
              className="mt-4 flex flex-wrap items-center gap-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!inviteEmail.trim()) return;
                void run('invite', async () => {
                  const out = await api.teamInvite(inviteEmail.trim());
                  setStatus(out.status);
                  setNotice({
                    tone: 'good',
                    text: out.emailed ? `Invitation emailed to ${inviteEmail.trim()}.` : `Invitation created for ${inviteEmail.trim()}. Copy the link above and send it to them.`,
                  });
                  setInviteEmail('');
                });
              }}
            >
              <TextField
                type="email"
                placeholder="Teammate's email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                aria-label="Teammate's email"
                className="!w-full sm:!w-[280px]"
              />
              <Button type="submit" variant="secondary" disabled={busy === 'invite'}>
                Send invitation
              </Button>
            </form>
          ) : (
            <div className="mt-4">
              <Button variant="danger" size="sm" onClick={() => run('leave', async () => setStatus(await api.teamLeave()))} disabled={busy === 'leave'}>
                Leave team
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Access code */}
      <Card className="mb-5 p-6">
        <SectionTitle icon={<Gift size={16} />}>Have an access code?</SectionTitle>
        <p className="mb-4 mt-0 text-[13.5px] text-text-muted">If someone gave you a code for free access or extra trial time, enter it here.</p>
        <form onSubmit={redeem} className="flex flex-wrap items-center gap-2.5">
          <TextField
            placeholder="XXXX-XXXX"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label="Access code"
            autoComplete="off"
            className="!w-full uppercase sm:!w-[220px]"
          />
          <Button type="submit" variant="secondary" disabled={busy === 'redeem' || !code.trim()}>
            Apply code
          </Button>
        </form>
      </Card>

      {/* Data */}
      <Card className="p-6">
        <SectionTitle icon={<Download size={16} />}>Your data</SectionTitle>
        <p className="mb-4 mt-0 text-[13.5px] text-text-muted">Download a copy of your profile, settings and saved scenarios any time.</p>
        <Button variant="secondary" onClick={downloadData} disabled={busy === 'export'}>
          Download my data
        </Button>
      </Card>
    </div>
  );
}
