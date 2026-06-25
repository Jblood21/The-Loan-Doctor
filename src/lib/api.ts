// Thin API client for the LoanDr. backend.
//
// In development the Vite dev server proxies /api to the Express backend, so
// API_BASE can stay empty. In production set VITE_API_BASE to the API origin.

import type { Scenario, Settings, User } from '@/types';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '';
const TOKEN_KEY = 'loandr.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

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
    try {
      const data = await res.json();
      message = data.error || data.message || message;
    } catch {
      /* non-JSON error */
    }
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
}

export const api = {
  base: API_BASE,
  health: () => request<{ ok: boolean }>('GET', '/health'),

  // auth
  register: (data: { email: string; password: string; name?: string; company?: string }) =>
    request<AuthResponse>('POST', '/auth/register', data),
  login: (data: { email: string; password: string }) => request<AuthResponse>('POST', '/auth/login', data),
  me: () => request<{ user: User }>('GET', '/auth/me'),
  updateProfile: (data: Partial<User>) => request<{ user: User }>('PUT', '/auth/profile', data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    request<{ ok: boolean }>('PUT', '/auth/password', data),

  // settings
  getSettings: () => request<{ settings: Settings }>('GET', '/settings'),
  saveSettings: (settings: Partial<Settings>) => request<{ settings: Settings }>('PUT', '/settings', settings),

  // scenarios
  listScenarios: () => request<{ scenarios: Scenario[] }>('GET', '/scenarios'),
  saveScenarios: (scenarios: Scenario[]) => request<{ scenarios: Scenario[] }>('PUT', '/scenarios', { scenarios }),
  createScenario: (scenario: Scenario) => request<{ scenario: Scenario }>('POST', '/scenarios', scenario),
  updateScenario: (id: string, scenario: Scenario) => request<{ scenario: Scenario }>('PUT', `/scenarios/${id}`, scenario),
  deleteScenario: (id: string) => request<void>('DELETE', `/scenarios/${id}`),

  // admin
  adminLogin: (password: string) => request<{ token: string }>('POST', '/admin/login', { password }),
  adminStats: () => request<{ stats: { label: string; value: string; delta: string }[] }>('GET', '/admin/stats'),
  adminUsers: () => request<{ users: User[] }>('GET', '/admin/users'),

  // LOS integration (stubbed providers)
  losConnect: (provider: string) => request<{ connected: boolean; provider: string }>('POST', '/los/connect', { provider }),
  losDisconnect: (provider: string) => request<{ connected: boolean }>('POST', '/los/disconnect', { provider }),
  losSearch: (provider: string, query: string) =>
    request<{ results: { name: string; meta: string; address: string }[] }>(
      'GET',
      `/los/borrowers?provider=${encodeURIComponent(provider)}&q=${encodeURIComponent(query)}`,
    ),

  // pre-approval PDF — returns a Blob
  preApprovalPdf: (payload: unknown) => request<Blob>('POST', '/preapproval/pdf', payload),
};
