import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { TextField } from '@/components/ui/TextField';
import { ApiError, api } from '@/lib/api';
import type { CodeInput } from '@/lib/api';
import { dollars, longDate } from '@/lib/billing';
import type { AccessCode, AdminBilling as AdminBillingData, CodeKind } from '@/types';

const KINDS: { value: CodeKind; label: string }[] = [
  { value: 'free_forever', label: 'Free access, no end date' },
  { value: 'free_months', label: 'Free for a number of months' },
  { value: 'free_until', label: 'Free until a date' },
  { value: 'trial_days', label: 'Extra trial days' },
];

const LABEL = 'mb-1 block text-[11.5px] font-semibold text-text-dim';

function codeStatus(c: AccessCode): { text: string; tone: 'good' | 'neutral' | 'warn' } {
  if (c.revoked) return { text: 'Revoked', tone: 'neutral' };
  if (c.maxUses !== null && c.uses >= c.maxUses) return { text: 'Used up', tone: 'neutral' };
  if (c.redeemBy && Date.parse(c.redeemBy) < Date.now()) return { text: 'Expired', tone: 'warn' };
  return { text: 'Active', tone: 'good' };
}

const STATUS_CHIP = {
  good: 'bg-[rgba(52,211,153,.16)] text-good',
  neutral: 'bg-[rgba(140,165,195,.14)] text-text-dim',
  warn: 'bg-[rgba(251,191,36,.16)] text-warn',
} as const;

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[11px] border border-border bg-surface-tint px-4 py-3">
      <div className="text-[11.5px] font-semibold text-text-muted">{label}</div>
      <div className="num text-[22px] font-semibold text-text-heading">{value}</div>
    </div>
  );
}

/** The owner's billing tools: is it on, who is paying, and the access-code manager. */
export function AdminBilling() {
  const [data, setData] = useState<AdminBillingData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [msg, setMsg] = useState<{ tone: 'good' | 'danger'; text: string } | null>(null);
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<CodeKind>('free_forever');
  const [label, setLabel] = useState('');
  const [custom, setCustom] = useState('');
  const [months, setMonths] = useState('6');
  const [until, setUntil] = useState('');
  const [trialDays, setTrialDays] = useState('30');
  const [maxUses, setMaxUses] = useState('1');
  const [redeemBy, setRedeemBy] = useState('');
  const [lockedEmail, setLockedEmail] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api.adminBilling());
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load billing.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      setMsg({ tone: 'danger', text: 'The browser blocked copying. Select the text and copy it by hand.' });
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const input: CodeInput = {
      kind,
      label: label.trim(),
      code: custom.trim() || undefined,
      maxUses: maxUses.trim(),
      redeemBy: redeemBy || undefined,
      lockedEmail: lockedEmail.trim() || undefined,
      ...(kind === 'free_months' ? { months } : {}),
      ...(kind === 'free_until' ? { until } : {}),
      ...(kind === 'trial_days' ? { trialDays } : {}),
    };
    try {
      const { code } = await api.adminCreateCode(input);
      await load();
      setMsg({ tone: 'good', text: `Created ${code.code}${label.trim() ? ` for ${label.trim()}` : ''}. ${code.gives}` });
      setLabel('');
      setCustom('');
      setLockedEmail('');
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof ApiError ? err.message : 'Could not create the code.' });
    } finally {
      setBusy(false);
    }
  };

  const toggleRevoked = async (c: AccessCode) => {
    try {
      await api.adminSetCodeRevoked(c.id, !c.revoked);
      await load();
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof ApiError ? err.message : 'Could not update the code.' });
    }
  };

  if (loadError) return <Card className="mb-6 p-5 text-[13.5px] text-danger">{loadError}</Card>;
  if (!data) return null;

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-[22px] py-[18px]">
        <span className="text-[15px] font-semibold">Billing &amp; access codes</span>
        <div className="flex flex-wrap gap-2">
          <Badge tone={data.enabled ? 'good' : 'neutral'}>Billing {data.enabled ? 'on' : 'off'}</Badge>
          <Badge tone={data.stripeReady ? 'good' : 'warn'}>Stripe {data.stripeReady ? 'connected' : 'not connected'}</Badge>
          <Badge tone={data.webhookReady ? 'good' : 'warn'}>Webhook {data.webhookReady ? 'ready' : 'not set'}</Badge>
        </div>
      </div>

      <div className="space-y-5 px-[22px] py-5">
        {!data.enabled && (
          <div className="rounded-[10px] border border-[rgba(251,191,36,0.3)] bg-warning-tint px-4 py-3 text-[13px] leading-[1.55] text-warn">
            Billing is off, so everyone has full access and nobody is asked to pay. You can still make access codes now. To start
            charging, set <code>BILLING_ENABLED=true</code> and your Stripe keys in your hosting settings (see DEPLOYMENT.md).
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Tile label="On trial" value={data.counts.trial} />
          <Tile label="Subscribed" value={data.counts.subscribed} />
          <Tile label="On a team plan" value={data.counts.team} />
          <Tile label="Free access" value={data.counts.comp} />
          <Tile label="Locked" value={data.counts.locked} />
          <Tile label="Est. monthly revenue" value={dollars(data.mrrCents)} />
        </div>

        <div className="rounded-[10px] bg-surface-tint px-4 py-3 text-[12.5px] leading-[1.6] text-text-muted">
          <div className="font-semibold text-text-primary">Stripe webhook address</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="break-all text-[12.5px] text-text-primary">{data.webhookUrl}</code>
            <button
              onClick={() => copy('webhook', data.webhookUrl)}
              className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent text-[12px] font-semibold text-brand-blue-light"
            >
              {copied === 'webhook' ? <Check size={13} /> : <Copy size={13} />} {copied === 'webhook' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="mt-1">
            In Stripe, add it as a webhook for: customer.subscription.created, customer.subscription.updated,
            customer.subscription.deleted and checkout.session.completed.
          </div>
        </div>

        <div>
          <div className="mb-3 text-[13.5px] font-semibold text-text-heading">Make an access code</div>
          <form onSubmit={create} className="grid gap-3 md:grid-cols-3">
            <div>
              <label className={LABEL} htmlFor="code-kind">What it gives</label>
              <Select id="code-kind" value={kind} onChange={(e) => setKind(e.target.value as CodeKind)} options={KINDS} />
            </div>
            {kind === 'free_months' && (
              <div>
                <label className={LABEL} htmlFor="code-months">Months free</label>
                <TextField id="code-months" type="number" min={1} max={60} value={months} onChange={(e) => setMonths(e.target.value)} />
              </div>
            )}
            {kind === 'free_until' && (
              <div>
                <label className={LABEL} htmlFor="code-until">Free until</label>
                <TextField id="code-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
              </div>
            )}
            {kind === 'trial_days' && (
              <div>
                <label className={LABEL} htmlFor="code-days">Extra days</label>
                <TextField id="code-days" type="number" min={1} max={365} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
              </div>
            )}
            <div>
              <label className={LABEL} htmlFor="code-label">Who it's for</label>
              <TextField id="code-label" placeholder="e.g. Sam at ABC Lending" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div>
              <label className={LABEL} htmlFor="code-custom">Code (leave blank to generate one)</label>
              <TextField id="code-custom" placeholder="ALAN-VIP" value={custom} onChange={(e) => setCustom(e.target.value)} className="uppercase" />
            </div>
            <div>
              <label className={LABEL} htmlFor="code-max">Times it can be used</label>
              <TextField id="code-max" type="number" min={1} placeholder="blank = unlimited" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
            </div>
            <div>
              <label className={LABEL} htmlFor="code-by">Use by (optional)</label>
              <TextField id="code-by" type="date" value={redeemBy} onChange={(e) => setRedeemBy(e.target.value)} />
            </div>
            <div>
              <label className={LABEL} htmlFor="code-email">Only for this email (optional)</label>
              <TextField id="code-email" type="email" placeholder="person@company.com" value={lockedEmail} onChange={(e) => setLockedEmail(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button type="submit" variant="primary" disabled={busy} className="w-full">
                {busy ? 'Creating…' : 'Create code'}
              </Button>
            </div>
          </form>
          {msg && (
            <div
              role="status"
              className={`mt-3 rounded-[10px] border px-3.5 py-2.5 text-[13px] ${msg.tone === 'good' ? 'border-success bg-success-tint text-good' : 'border-danger bg-danger-tint text-danger'}`}
            >
              {msg.text}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-[13.5px] font-semibold text-text-heading">Your codes</div>
          {data.codes.length === 0 ? (
            <div className="text-[13px] text-text-muted">No codes yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[11.5px] font-bold tracking-[0.5px] text-text-dim">
                    <th className="py-2 pr-3 font-bold">CODE</th>
                    <th className="py-2 pr-3 font-bold">FOR</th>
                    <th className="py-2 pr-3 font-bold">GIVES</th>
                    <th className="py-2 pr-3 font-bold">USED</th>
                    <th className="py-2 pr-3 font-bold">STATUS</th>
                    <th className="py-2 font-bold" />
                  </tr>
                </thead>
                <tbody>
                  {data.codes.map((c) => {
                    const st = codeStatus(c);
                    return (
                      <tr key={c.id} className="border-b border-[rgba(140,165,195,0.1)] align-top">
                        <td className="py-2.5 pr-3">
                          <span className="inline-flex items-center gap-1.5 font-mono text-[13px] font-semibold text-text-primary">
                            {c.code}
                            <button
                              onClick={() => copy(c.id, c.code)}
                              aria-label={`Copy ${c.code}`}
                              className="cursor-pointer border-none bg-transparent p-0.5 text-text-dim hover:text-text-primary"
                            >
                              {copied === c.id ? <Check size={13} /> : <Copy size={13} />}
                            </button>
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-text-soft">
                          {c.label || '—'}
                          {c.lockedEmail && <div className="text-[11.5px] text-text-dim">only {c.lockedEmail}</div>}
                          {c.redemptions.length > 0 && (
                            <div className="text-[11.5px] text-text-dim">
                              used by {c.redemptions.slice(0, 3).map((r) => r.email).join(', ')}
                              {c.redemptions.length > 3 ? ` +${c.redemptions.length - 3}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-text-soft">
                          {c.gives}
                          {c.redeemBy && <div className="text-[11.5px] text-text-dim">use by {longDate(c.redeemBy)}</div>}
                        </td>
                        <td className="num py-2.5 pr-3 text-text-soft">
                          {c.uses}/{c.maxUses ?? '∞'}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className={`rounded-[20px] px-[11px] py-1 text-[11.5px] font-semibold ${STATUS_CHIP[st.tone]}`}>{st.text}</span>
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            onClick={() => toggleRevoked(c)}
                            className={`cursor-pointer border-none bg-transparent text-[12.5px] font-semibold hover:underline ${c.revoked ? 'text-brand-blue-light' : 'text-danger'}`}
                          >
                            {c.revoked ? 'Restore' : 'Revoke'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
