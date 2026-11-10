// Outbound webhooks to GoHighLevel (or any CRM that gives you a "catch hook" address).
//
// An account pastes the address from a GoHighLevel workflow's Inbound Webhook trigger;
// Basecamp then POSTs a small JSON event to it whenever something happens. Because the
// address is typed in by a user, it is checked hard before anything is sent: https only,
// a known GoHighLevel host, no embedded credentials, no redirects.

const DEFAULT_HOSTS = ['.leadconnectorhq.com', '.gohighlevel.com'];

// Extra hosts an operator may allow (a white-label domain, or a local test receiver).
function extraHosts() {
  return (process.env.WEBHOOK_ALLOWED_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

const matches = (rule, host) => (rule.startsWith('.') ? host.endsWith(rule) : host === rule);
const hostAllowed = (host) => [...DEFAULT_HOSTS, ...extraHosts()].some((rule) => matches(rule, host));

/** Returns { ok: true, url } or { ok: false, error }. */
export function checkWebhookUrl(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, error: 'Paste the webhook address from GoHighLevel.' };
  if (text.length > 600) return { ok: false, error: 'That address is too long.' };
  let u;
  try {
    u = new URL(text);
  } catch {
    return { ok: false, error: 'That does not look like a web address.' };
  }
  const host = u.hostname.toLowerCase();
  // Plain http is only for a host the operator listed by hand, and only when they say so
  // (local testing). GoHighLevel's own hosts are always https.
  const plainHttpOk = u.protocol === 'http:' && process.env.WEBHOOK_ALLOW_HTTP === 'true' && extraHosts().some((r) => matches(r, host));
  if (u.protocol !== 'https:' && !plainHttpOk) return { ok: false, error: 'The address must start with https://' };
  if (u.username || u.password) return { ok: false, error: 'The address cannot contain a username or password.' };
  if (!hostAllowed(host)) {
    return { ok: false, error: 'That is not a GoHighLevel webhook address. It should start with https://services.leadconnectorhq.com/hooks/…' };
  }
  return { ok: true, url: u.toString() };
}

// ---- delivery log (kept in memory: it is for troubleshooting, not a record) ---------
const LOG_MAX = 40;
const logs = new Map();
export function logDelivery(accountKey, entry) {
  const list = logs.get(accountKey) || [];
  list.unshift({ at: new Date().toISOString(), ...entry });
  if (list.length > LOG_MAX) list.length = LOG_MAX;
  logs.set(accountKey, list);
}
export function getDeliveryLog(accountKey) {
  return logs.get(accountKey) || [];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const retryDelays = () => {
  const base = Number(process.env.WEBHOOK_RETRY_MS);
  const b = Number.isFinite(base) && base >= 0 ? base : 2000;
  return [b, b * 5];
};

/** POST one event. Retries network errors, 429 and 5xx up to three tries in all. */
export async function postWebhook(url, payload, { retry = true } = {}) {
  const body = JSON.stringify(payload);
  const delays = retry ? retryDelays() : [];
  let last = { ok: false, status: 0, error: 'not sent' };
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'LoanBaseCamp-Webhooks/1', 'X-Basecamp-Event': String(payload.event || '') },
        body,
        signal: AbortSignal.timeout(8000),
      });
      last = { ok: res.status >= 200 && res.status < 300, status: res.status };
      if (last.ok) return last;
      // Redirects and client errors will not get better by trying again.
      if (res.status !== 429 && res.status < 500) return { ...last, error: `GoHighLevel answered ${res.status}` };
      last.error = `GoHighLevel answered ${res.status}`;
    } catch (err) {
      last = { ok: false, status: 0, error: err && err.name === 'TimeoutError' ? 'Timed out' : 'Could not reach the address' };
    }
    if (attempt < delays.length) await sleep(delays[attempt]);
  }
  return last;
}
