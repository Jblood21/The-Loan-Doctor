// Real ARIVE LOS adapter.
//
// ARIVE exposes a REST API: you generate an auth token in ARIVE under
// Settings → API Integrations and pass it in a request header. Configure this
// adapter entirely from server/.env — no code change needed to turn it on:
//
//   ARIVE_API_BASE        Base URL of your ARIVE API gateway (from your API Integrations page)
//   ARIVE_API_TOKEN       The token you generated in ARIVE → Settings → API Integrations
//   ARIVE_AUTH_HEADER     Header name ARIVE expects (default: Authorization)
//   ARIVE_AUTH_SCHEME     Prefix before the token (default: Bearer; set empty for a raw token)
//   ARIVE_BORROWERS_PATH  Endpoint to list/search loans or leads (default: /loans)
//   ARIVE_SEARCH_PARAM    Query-string param name for the search text (default: search)
//
// The response mapper below is defensive (it accepts several common field names),
// but confirm the exact endpoint path + response shape against your ARIVE API docs.

export function ariveConfigured() {
  return !!(process.env.ARIVE_API_TOKEN && process.env.ARIVE_API_BASE);
}

function authValue() {
  const scheme = process.env.ARIVE_AUTH_SCHEME ?? 'Bearer';
  const token = process.env.ARIVE_API_TOKEN || '';
  return scheme ? `${scheme} ${token}` : token;
}

/** Map an ARIVE loan/lead record to the app's borrower shape. */
export function mapAriveRecord(l) {
  const b = l.borrower || l.primaryBorrower || l.contact || {};
  const p = l.property || l.subjectProperty || l.loanProperty || {};
  const name =
    [b.firstName, b.lastName].filter(Boolean).join(' ') ||
    b.fullName ||
    b.name ||
    l.borrowerName ||
    'Borrower';
  const loanNo = l.loanNumber || l.loanId || l.loanGuid || l.id || '';
  const amount = l.loanAmount || l.baseLoanAmount || l.amount;
  const address =
    p.addressLine ||
    p.fullAddress ||
    [p.street || p.addressLine1, p.city, p.state, p.zip || p.postalCode].filter(Boolean).join(', ') ||
    '';
  const metaParts = [];
  if (loanNo) metaParts.push(`Loan #${loanNo}`);
  if (amount != null && amount !== '') metaParts.push(`$${Number(amount).toLocaleString('en-US')}`);
  return { name, meta: metaParts.join(' · '), address };
}

/** Query ARIVE for loans/leads matching `query`. Throws on a non-OK response. */
export async function ariveSearch(query) {
  const base = (process.env.ARIVE_API_BASE || '').replace(/\/$/, '');
  const path = process.env.ARIVE_BORROWERS_PATH || '/loans';
  const header = process.env.ARIVE_AUTH_HEADER || 'Authorization';
  const searchParam = process.env.ARIVE_SEARCH_PARAM || 'search';

  const url = new URL(base + path);
  if (query) url.searchParams.set(searchParam, query);

  const res = await fetch(url, {
    headers: { [header]: authValue(), Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ARIVE API ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`);
  }
  const data = await res.json();
  const list = Array.isArray(data) ? data : data.loans || data.leads || data.data || data.results || [];
  return list.map(mapAriveRecord);
}
