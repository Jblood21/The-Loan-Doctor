// Thin API client for the Basecamp backend.
//
// In development the Vite dev server proxies /api to the Express backend, so
// API_BASE can stay empty. In production set VITE_API_BASE to the API origin.

import type { AccessCode, AdminBilling, AdminUser, Assignment, BillingStatus, CodeKind, PreApprovalRecord, Scenario, Settings, User } from '@/types';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '';
const TOKEN_KEY = 'loandr.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}
/** Persist the auth token. remember=true (default) keeps you signed in across browser
 *  restarts (localStorage); remember=false clears it when the tab/browser closes. */
export function setToken(token: string | null, remember = true) {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
}

/** Fired when the server says the plan has lapsed (HTTP 402) so the UI can react. */
export const BILLING_REQUIRED_EVENT = 'basecamp:billing-required';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = res.statusText;
    let code: string | undefined;
    try {
      const data = await res.json();
      message = data.error || data.message || message;
      code = data.code;
    } catch {
      /* non-JSON error */
    }
    // A lapsed plan: tell the app so it can show the plan page instead of a bare error.
    if (res.status === 402 && code === 'billing_required') window.dispatchEvent(new Event(BILLING_REQUIRED_EVENT));
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return (await res.blob()) as unknown as T;
  return res.json() as Promise<T>;
}

export interface AuthResponse {
  token: string;
  user: User;
  /** Plain-language note when an access code was applied at sign-up. */
  notice?: string | null;
}

export interface CodeInput {
  kind: CodeKind;
  label?: string;
  code?: string;
  months?: number | string;
  until?: string;
  trialDays?: number | string;
  maxUses?: number | string;
  redeemBy?: string;
  lockedEmail?: string;
}

export const api = {
  base: API_BASE,
  health: () => request<{ ok: boolean }>('GET', '/health'),

  // auth
  register: (data: { email: string; password: string; name?: string; company?: string; accessCode?: string; invite?: string }) =>
    request<AuthResponse>('POST', '/auth/register', data),
  login: (data: { email: string; password: string }) => request<AuthResponse>('POST', '/auth/login', data),
  me: () => request<{ user: User }>('GET', '/auth/me'),
  updateProfile: (data: Partial<User>) => request<{ user: User }>('PUT', '/auth/profile', data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    request<{ ok: boolean }>('PUT', '/auth/password', data),
  forgotPassword: (data: { email: string }) =>
    request<{ ok: boolean; devLink?: string; emailConfigured?: boolean }>('POST', '/auth/forgot-password', data),
  resetPassword: (data: { token: string; newPassword: string }) =>
    request<{ ok: boolean }>('POST', '/auth/reset-password', data),

  // settings
  getSettings: () => request<{ settings: Settings }>('GET', '/settings'),
  saveSettings: (settings: Partial<Settings>) => request<{ settings: Settings }>('PUT', '/settings', settings),

  // scenarios
  listScenarios: () => request<{ scenarios: Scenario[] }>('GET', '/scenarios'),
  saveScenarios: (scenarios: Scenario[]) => request<{ scenarios: Scenario[] }>('PUT', '/scenarios', { scenarios }),
  createScenario: (scenario: Scenario) => request<{ scenario: Scenario }>('POST', '/scenarios', scenario),
  updateScenario: (id: string, scenario: Scenario) => request<{ scenario: Scenario }>('PUT', `/scenarios/${id}`, scenario),
  deleteScenario: (id: string) => request<void>('DELETE', `/scenarios/${id}`),
  // Merge the working scenarios into the saved bank (add new / update existing by id).
  upsertScenarios: (scenarios: Scenario[]) =>
    request<{ scenarios: Scenario[]; saved: Scenario[] }>('POST', '/scenarios/upsert', { scenarios }),

  // admin (JWT role=admin gated)
  adminStats: () => request<{ stats: { label: string; value: string; delta: string }[] }>('GET', '/admin/stats'),
  adminUsers: () => request<{ users: AdminUser[] }>('GET', '/admin/users'),
  adminBilling: () => request<AdminBilling>('GET', '/admin/billing'),
  adminCreateCode: (input: CodeInput) => request<{ code: AccessCode }>('POST', '/admin/codes', input),
  adminSetCodeRevoked: (id: string, revoked: boolean) => request<{ code: AccessCode }>('PATCH', `/admin/codes/${id}`, { revoked }),
  adminGrantFree: (userId: string, grant: { mode: 'forever' | 'months' | 'until'; months?: number; until?: string; reason?: string }) =>
    request<{ user: AdminUser }>('POST', `/admin/users/${userId}/comp`, grant),
  adminRemoveFree: (userId: string) => request<{ user: AdminUser }>('DELETE', `/admin/users/${userId}/comp`),

  // billing (plans, free-access codes, teams)
  billingStatus: () => request<BillingStatus>('GET', '/billing'),
  billingRedeem: (code: string) => request<{ ok: boolean; message: string; already: boolean; status: BillingStatus }>('POST', '/billing/redeem', { code }),
  billingCheckout: (plan: 'solo' | 'team', interval?: 'month' | 'year') =>
    request<{ url: string }>('POST', '/billing/checkout', { plan, interval }),
  billingPortal: (scope?: 'user' | 'org') => request<{ url: string }>('POST', '/billing/portal', { scope }),
  billingSync: (sessionId: string) => request<BillingStatus>('POST', '/billing/sync', { sessionId }),
  billingExport: () => request<unknown>('GET', '/billing/export'),
  inviteInfo: (token: string) => request<{ orgName: string; email: string }>('GET', `/billing/invite-info?token=${encodeURIComponent(token)}`),
  teamCreate: (name: string) => request<BillingStatus>('POST', '/billing/team', { name }),
  teamInvite: (email: string) => request<{ emailed: boolean; status: BillingStatus }>('POST', '/billing/team/invites', { email }),
  teamCancelInvite: (id: string) => request<BillingStatus>('DELETE', `/billing/team/invites/${id}`),
  teamJoin: (token: string) => request<BillingStatus>('POST', '/billing/team/join', { token }),
  teamRemoveMember: (userId: string) => request<BillingStatus>('DELETE', `/billing/team/members/${userId}`),
  teamLeave: () => request<BillingStatus>('POST', '/billing/team/leave'),

  // LOS integration — 'live' (direct API), 'zapier' (pushed via webhook), or 'demo'
  losConnect: (provider: string) =>
    request<{ connected: boolean; provider: string; mode: 'live' | 'zapier' | 'demo' }>('POST', '/los/connect', { provider }),
  losDisconnect: (provider: string) => request<{ connected: boolean }>('POST', '/los/disconnect', { provider }),
  losSearch: (provider: string, query: string) =>
    request<{ results: { name: string; meta: string; address: string }[]; mode: 'live' | 'zapier' | 'demo' }>(
      'GET',
      `/los/borrowers?provider=${encodeURIComponent(provider)}&q=${encodeURIComponent(query)}`,
    ),
  losWebhookInfo: () => request<{ token: string; url: string; count: number }>('GET', '/los/webhook-info'),
  losWebhookLog: () =>
    request<{
      count: number;
      log: { at: string; recordsReceived: number; borrowersStored: number; fieldNames: string[]; extractedNames: string[]; sample: string }[];
    }>('GET', '/los/webhook-info/log'),
  losRegenerateWebhook: () => request<{ token: string; url: string }>('POST', '/los/webhook-info/regenerate'),
  losClearBorrowers: () => request<{ ok: boolean }>('POST', '/los/webhook-info/clear'),

  // pre-approval PDF — returns a Blob
  preApprovalPdf: (payload: unknown) => request<Blob>('POST', '/preapproval/pdf', payload),
  preApprovalHistory: () => request<{ history: PreApprovalRecord[] }>('GET', '/preapproval/history'),

  // Look up a signed-up agent's co-brand profile by email, so a pre-approval can pull the
  // agent's own details (name, brokerage, phone, photo) instead of the LO re-typing them.
  agentLookup: (email: string) =>
    request<{ found: boolean; agent?: { name: string; brokerage: string; phone: string; email: string; photo: string; license: string } }>(
      'GET',
      `/preapproval/agent-lookup?email=${encodeURIComponent(email)}`,
    ),

  // agent assignments (loan-officer side): hand a pre-approval to an agent to edit
  listAssignments: () => request<{ assignments: Assignment[] }>('GET', '/preapproval/assignments'),
  createAssignment: (payload: unknown) => request<{ assignment: Assignment }>('POST', '/preapproval/assignments', payload),
  updateAssignment: (id: string, patch: unknown) => request<{ assignment: Assignment }>('PATCH', `/preapproval/assignments/${id}`, patch),
  deleteAssignment: (id: string) => request<{ ok: boolean }>('DELETE', `/preapproval/assignments/${id}`),

  // AI assistant (Claude, server-side) for the loan comparison
  aiCompare: (question: string, context: string) => request<{ answer: string }>('POST', '/ai/compare', { question, context }),

  // U.S. Census median household income by county
  censusCounties: (state: string) => request<{ year: string; counties: { fips: string; name: string }[] }>('GET', `/census/counties?state=${encodeURIComponent(state)}`),
  censusIncome: (state: string, county: string) =>
    request<{ name: string; medianIncome: number | null; moe: number | null; year: string; source: string }>(
      'GET',
      `/census/income?state=${encodeURIComponent(state)}&county=${encodeURIComponent(county)}`,
    ),

  // tools report PDF (selected calculators compiled into one branded report)
  reportPdf: (payload: unknown) => request<Blob>('POST', '/report/pdf', payload),

  // comparison PDF + shareable quote links
  comparePdf: (payload: unknown) => request<Blob>('POST', '/compare/pdf', payload),
  createShare: (payload: unknown) => request<{ id: string; url: string }>('POST', '/share', payload),
  getShare: (id: string) => request<{ share: SharedQuote }>('GET', `/share/${id}`),
};

export interface ShareMetric {
  label: string;
  values: string[];
}
export interface SharedQuote {
  title: string;
  borrowerName: string;
  names: string[];
  metrics: ShareMetric[];
  bestIndex?: number;
  lender: { name?: string; phone?: string; email?: string; nmls?: string; website?: string; address?: string };
  createdAt?: string;
}
