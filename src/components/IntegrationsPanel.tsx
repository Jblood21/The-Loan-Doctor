import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField, Label } from '@/components/ui/TextField';
import { ApiError } from '@/lib/api';
import type { ApiKeyInfo, DeliveryEntry, IntegrationsView } from '@/types';

/** What the panel needs from whichever API client (loan officer or agent) it is used with. */
export interface IntegrationsClient {
  get: () => Promise<IntegrationsView>;
  saveGhl: (body: { url?: string; enabled?: boolean }) => Promise<IntegrationsView>;
  disconnectGhl: () => Promise<IntegrationsView>;
  testGhl: () => Promise<{ ok: boolean; status: number; error: string | null; deliveries: DeliveryEntry[] }>;
  setNotifyEmail: (v: boolean) => Promise<IntegrationsView>;
  createKey: (name: string) => Promise<{ key: string; apiKeys: ApiKeyInfo[] }>;
  deleteKey: (id: string) => Promise<{ apiKeys: ApiKeyInfo[] }>;
}

const errText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-none transition-colors disabled:opacity-40 ${checked ? 'bg-brand' : 'bg-border-input'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

/** A copyable block of text or code. */
function CopyBox({ text, label = 'Copy', multiline = false }: { text: string; label?: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };
  return (
    <div className="flex items-start gap-2">
      {multiline ? (
        <pre className="m-0 min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-[9px] border border-border-input bg-input px-3 py-2 text-[12.5px] leading-[1.55] text-text-soft">{text}</pre>
      ) : (
        <code className="min-w-0 flex-1 truncate rounded-[9px] border border-border-input bg-input px-3 py-2 text-[12.5px] text-text-soft">{text}</code>
      )}
      <Button variant="secondary" size="sm" onClick={copy}>
        {copied ? 'Copied!' : label}
      </Button>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-[1px] flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-surface-tint-strong text-[11px] font-bold text-text-heading">{n}</span>
      <span>{children}</span>
    </li>
  );
}

const DELIVERY_NOTE = (d: DeliveryEntry) => {
  if (d.skipped) return d.skipped;
  if (d.ok) return d.channel === 'ghl' ? `Delivered${d.status ? ` (${d.status})` : ''}` : 'Sent';
  return d.error || 'Failed';
};

/** The Integrations screen: connect GoHighLevel, choose emails, and make API keys. Works for both
 *  loan officers and agents — only the wording and a few extras change. */
export function IntegrationsPanel({ client, audience }: { client: IntegrationsClient; audience: 'lo' | 'agent' }) {
  const [view, setView] = useState<IntegrationsView | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [keyName, setKeyName] = useState('GoHighLevel');
  const [newKey, setNewKey] = useState('');

  const apply = (v: IntegrationsView) => {
    setView(v);
    setUrl(v.ghl.url);
  };
  useEffect(() => {
    client
      .get()
      .then(apply)
      .catch(() => setLoadErr('Could not load your integrations. Refresh and try again.'));
  }, [client]);

  if (loadErr) return <div className="rounded-[11px] border border-[rgba(248,113,113,0.3)] bg-danger-tint px-[15px] py-3 text-[13px] text-danger">{loadErr}</div>;
  if (!view) return <div className="py-10 text-center text-[13.5px] text-text-muted">Loading…</div>;

  const isLo = audience === 'lo';
  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setMsg(null);
    try {
      await fn();
    } catch (err) {
      setMsg({ tone: 'error', text: errText(err, 'That did not work. Try again.') });
    } finally {
      setBusy('');
    }
  };

  const save = () =>
    run('save', async () => {
      apply(await client.saveGhl({ url: url.trim() }));
      setMsg({ tone: 'ok', text: 'Saved. Use “Send a test” to check it.' });
    });
  const test = () =>
    run('test', async () => {
      const r = await client.testGhl();
      setView((v) => (v ? { ...v, deliveries: r.deliveries } : v));
      setMsg(
        r.ok
          ? { tone: 'ok', text: 'GoHighLevel received the test. Check the workflow’s history to see it arrive.' }
          : { tone: 'error', text: r.status ? `GoHighLevel answered ${r.status}. Check that the address is the one from your workflow.` : r.error || 'Could not reach GoHighLevel.' },
      );
    });
  const disconnect = () => {
    if (!window.confirm('Disconnect GoHighLevel? Basecamp will stop sending it updates.')) return;
    return run('disconnect', async () => {
      apply(await client.disconnectGhl());
      setMsg({ tone: 'ok', text: 'Disconnected.' });
    });
  };
  const toggleEnabled = (on: boolean) => run('toggle', async () => apply(await client.saveGhl({ enabled: on })));
  const toggleEmail = (on: boolean) => run('email', async () => apply(await client.setNotifyEmail(on)));
  const makeKey = () =>
    run('key', async () => {
      const r = await client.createKey(keyName.trim() || 'GoHighLevel');
      setNewKey(r.key);
      setView((v) => (v ? { ...v, apiKeys: r.apiKeys } : v));
    });
  const removeKey = (k: ApiKeyInfo) => {
    if (!window.confirm(`Delete “${k.name}”? Anything using it will stop working.`)) return;
    return run('delkey', async () => {
      const r = await client.deleteKey(k.id);
      setView((v) => (v ? { ...v, apiKeys: r.apiKeys } : v));
      setNewKey('');
    });
  };

  const KEY = newKey || 'YOUR_API_KEY';
  const ghl = view.ghl;
  const who = isLo ? 'agents and pre-approvals' : 'your loan officers and pre-approvals';
  const statusBody = JSON.stringify({ borrowerName: '{{contact.name}}', propertyAddress: '{{contact.address1}}', status: 'under_contract' }, null, 2);

  return (
    <div className="flex flex-col gap-5">
      {msg && (
        <div
          role="status"
          className={`rounded-[11px] border px-[15px] py-3 text-[13px] ${msg.tone === 'error' ? 'border-[rgba(248,113,113,0.3)] bg-danger-tint text-danger' : 'border-border bg-success-tint text-good'}`}
        >
          {msg.text}
        </div>
      )}

      {/* ---- GoHighLevel: Basecamp → GoHighLevel ---- */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold text-text-heading">GoHighLevel</div>
            <p className="mt-1 max-w-[560px] text-[13px] leading-[1.6] text-text-muted">
              Send {who} to GoHighLevel the moment something happens, so your workflows can add contacts, tag them, or start a follow-up.
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
              ghl.connected && ghl.enabled ? 'bg-success-tint text-good' : 'bg-surface-tint text-text-muted'
            }`}
          >
            {ghl.connected ? (ghl.enabled ? 'Connected' : 'Paused') : 'Not connected'}
          </span>
        </div>

        <ol className="m-0 mt-4 flex list-none flex-col gap-2 p-0 text-[13px] leading-[1.55] text-text-label">
          <Step n={1}>
            In GoHighLevel, make a workflow and add the <strong>Inbound Webhook</strong> trigger. It gives you a web address.
          </Step>
          <Step n={2}>Paste that address here and save.</Step>
          <Step n={3}>
            Press <strong>Send a test</strong>, then add the actions you want in the workflow (create or update a contact, add a tag, send a text…).
          </Step>
        </ol>

        <div className="mt-4">
          <Label>Webhook address from GoHighLevel</Label>
          <div className="flex flex-wrap items-center gap-2">
            <TextField
              className="min-w-0 flex-1"
              placeholder="https://services.leadconnectorhq.com/hooks/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              aria-label="Webhook address from GoHighLevel"
            />
            <Button variant="primary" onClick={save} disabled={busy === 'save' || !url.trim() || url.trim() === ghl.url}>
              {busy === 'save' ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        {ghl.connected && (
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-border pt-4">
            <label className="flex items-center gap-2.5 text-[13px] font-medium text-text-label">
              <Switch checked={ghl.enabled} onChange={toggleEnabled} label="Send updates to GoHighLevel" disabled={busy === 'toggle'} />
              Send updates
            </label>
            <Button variant="secondary" size="sm" onClick={test} disabled={busy === 'test'}>
              {busy === 'test' ? 'Sending…' : 'Send a test'}
            </Button>
            <button onClick={disconnect} className="cursor-pointer border-none bg-transparent text-[12.5px] font-semibold text-text-dim transition-colors hover:text-danger">
              Disconnect
            </button>
          </div>
        )}

        <details className="mt-4">
          <summary className="cursor-pointer text-[13px] font-semibold text-text-label">What gets sent</summary>
          <div className="mt-2.5 overflow-x-auto">
            <table className="w-full border-collapse text-left text-[12.5px]">
              <thead>
                <tr className="text-text-dim">
                  <th className="py-1.5 pr-3 font-semibold">When</th>
                  <th className="py-1.5 pr-3 font-semibold">GoHighLevel</th>
                  <th className="py-1.5 font-semibold">Email you</th>
                </tr>
              </thead>
              <tbody>
                {view.events.map((e) => (
                  <tr key={e.event} className="border-t border-border align-top">
                    <td className="py-2 pr-3">
                      <div className="font-semibold text-text-soft">{e.label}</div>
                      <div className="text-text-dim">{e.about}</div>
                      <code className="text-[11.5px] text-text-dim">{e.event}</code>
                    </td>
                    <td className="py-2 pr-3 text-text-soft">{e.ghl ? 'Yes' : '—'}</td>
                    <td className="py-2 text-text-soft">{e.email ? 'Yes' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2.5 text-[12.5px] leading-[1.6] text-text-muted">
            Each update carries the other person’s <code>first_name</code>, <code>last_name</code>, <code>email</code> and <code>phone</code> at the top, so a workflow can create or update a contact with no extra setup. The pre-approval details are inside <code>preapproval</code>.
            {isLo ? '' : ' You only ever receive what you can already see in the agent portal.'}
          </p>
        </details>

        {view.deliveries.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[13px] font-semibold text-text-label">Recent activity</summary>
            <ul className="m-0 mt-2 list-none p-0 text-[12.5px]">
              {view.deliveries.slice(0, 15).map((d, i) => (
                <li key={`${d.at}-${i}`} className="flex flex-wrap items-baseline gap-x-3 border-t border-border py-1.5">
                  <span className="text-text-dim">{when(d.at)}</span>
                  <span className="font-semibold text-text-soft">{d.channel === 'ghl' ? 'GoHighLevel' : 'Email'}</span>
                  <code className="text-text-dim">{d.event}</code>
                  <span className={d.ok ? 'text-good' : d.skipped ? 'text-text-dim' : 'text-danger'}>{DELIVERY_NOTE(d)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      {/* ---- GoHighLevel → Basecamp (loan officers) ---- */}
      {isLo && view.inboundUrl && (
        <Card className="p-5">
          <div className="text-[15px] font-semibold text-text-heading">Send contacts from GoHighLevel into Basecamp</div>
          <p className="mt-1 max-w-[600px] text-[13px] leading-[1.6] text-text-muted">
            Contacts you send here show up in the borrower search on the Pre-Approval and Compare pages, so you do not retype them.
          </p>
          <ol className="m-0 mt-3 flex list-none flex-col gap-2 p-0 text-[13px] leading-[1.55] text-text-label">
            <Step n={1}>
              In a GoHighLevel workflow, add the <strong>Custom Webhook</strong> action. Set the method to <strong>POST</strong>.
            </Step>
            <Step n={2}>Paste this as the URL. Leave the body as it is: GoHighLevel’s standard contact details are understood.</Step>
          </ol>
          <div className="mt-3">
            <CopyBox text={view.inboundUrl} />
          </div>
          <p className="mt-2 text-[12px] text-text-dim">Keep this address private. Anyone who has it can add contacts to your list.</p>
        </Card>
      )}

      {/* ---- Email ---- */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold text-text-heading">Activity emails</div>
            <p className="mt-1 max-w-[560px] text-[13px] leading-[1.6] text-text-muted">
              {isLo
                ? 'Get an email when an agent edits or shares a pre-approval, asks for a refresh, joins, or when a letter is about to expire.'
                : 'Get an email when a loan officer sends you a pre-approval, when a loan moves to a new stage, and before a letter expires.'}
            </p>
            {!view.emailConfigured && <p className="mt-1 text-[12px] text-text-dim">Email is not set up on this site yet, so nothing is sent for now.</p>}
          </div>
          <Switch checked={view.notifyEmail} onChange={toggleEmail} label="Activity emails" disabled={busy === 'email'} />
        </div>
      </Card>

      {/* ---- API keys ---- */}
      <Card className="p-5">
        <div className="text-[15px] font-semibold text-text-heading">API keys</div>
        <p className="mt-1 max-w-[600px] text-[13px] leading-[1.6] text-text-muted">
          A key lets GoHighLevel (or any tool) call Basecamp for you. It can only do what you can do here, and you can delete it any time.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[180px] flex-1">
            <Label>Name</Label>
            <TextField value={keyName} onChange={(e) => setKeyName(e.target.value)} maxLength={60} aria-label="Key name" />
          </div>
          <Button variant="primary" onClick={makeKey} disabled={busy === 'key'}>
            {busy === 'key' ? 'Creating…' : 'Create key'}
          </Button>
        </div>

        {newKey && (
          <div className="mt-3 rounded-[10px] border border-border-input bg-surface-tint p-3">
            <div className="text-[12.5px] font-semibold text-text-heading">Copy your key now. For your safety it is shown only this once.</div>
            <div className="mt-2">
              <CopyBox text={newKey} />
            </div>
          </div>
        )}

        {view.apiKeys.length > 0 && (
          <ul className="m-0 mt-4 list-none p-0">
            {view.apiKeys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-2.5 text-[13px]">
                <div>
                  <span className="font-semibold text-text-soft">{k.name}</span>
                  <span className="ml-2 text-text-dim">…{k.last4}</span>
                  <div className="text-[12px] text-text-dim">
                    Made {new Date(k.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ·{' '}
                    {k.lastUsedAt ? `last used ${when(k.lastUsedAt)}` : 'never used'}
                  </div>
                </div>
                <button onClick={() => removeKey(k)} className="cursor-pointer border-none bg-transparent text-[12.5px] font-semibold text-text-dim transition-colors hover:text-danger">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}

        <details className="mt-4">
          <summary className="cursor-pointer text-[13px] font-semibold text-text-label">How to use a key</summary>
          <div className="mt-3 flex flex-col gap-3 text-[13px] leading-[1.6] text-text-label">
            <div>
              <div className="font-semibold">Address</div>
              <CopyBox text={view.apiBase} />
            </div>
            <div>
              <div className="font-semibold">Header on every request</div>
              <CopyBox text={`Authorization: Bearer ${KEY}`} />
            </div>
            {isLo ? (
              <>
                <div>
                  <div className="font-semibold">Move a loan to a new stage from a GoHighLevel workflow</div>
                  <p className="m-0 mt-1 text-text-muted">
                    Add a <strong>Custom Webhook</strong> action. Method <strong>POST</strong>, URL <code>{view.apiBase}/preapprovals/status</code>, the header above, and this body. Basecamp finds the loan by the buyer’s name (add the address if the same name has two loans) and will not change anything unless exactly one matches.
                  </p>
                  <div className="mt-1.5">
                    <CopyBox text={statusBody} multiline />
                  </div>
                  <p className="m-0 mt-1.5 text-text-muted">
                    Stages: <code>preapproved</code>, <code>under_contract</code>, <code>appraisal</code>, <code>clear_to_close</code>, <code>closed</code>, <code>cancelled</code>. Friendly names like “Under Contract” or “CTC” work too.
                  </p>
                </div>
                <div>
                  <div className="font-semibold">Everything you can call</div>
                  <ul className="m-0 mt-1 list-disc pl-5 text-text-muted">
                    <li><code>GET /me</code> — whose key this is</li>
                    <li><code>GET /preapprovals</code> — your pre-approvals (filter with <code>?status=</code> or <code>?agentEmail=</code>)</li>
                    <li><code>GET /preapprovals/:id</code></li>
                    <li><code>POST /preapprovals/status</code> — move a loan by buyer name, or by <code>id</code></li>
                    <li><code>POST /preapprovals/:id/status</code> — move a loan by id</li>
                    <li><code>GET /agents</code> — your agent list</li>
                    <li><code>POST /agents/invite</code> — invite an agent: <code>{'{"email":"agent@example.com","name":"Jane"}'}</code></li>
                  </ul>
                </div>
              </>
            ) : (
              <div>
                <div className="font-semibold">Everything you can call</div>
                <ul className="m-0 mt-1 list-disc pl-5 text-text-muted">
                  <li><code>GET /me</code></li>
                  <li><code>GET /preapprovals</code> — pre-approvals assigned to you</li>
                  <li><code>GET /preapprovals/:id</code></li>
                  <li><code>POST /preapprovals/:id</code> — update the property address (and price, when your loan officer allows it)</li>
                  <li><code>POST /preapprovals/:id/refresh-request</code> — ask your loan officer for a new letter</li>
                </ul>
              </div>
            )}
            <div>
              <div className="font-semibold">Try it</div>
              <CopyBox multiline text={`curl ${view.apiBase}/preapprovals \\\n  -H "Authorization: Bearer ${KEY}"`} />
            </div>
          </div>
        </details>
      </Card>
    </div>
  );
}
