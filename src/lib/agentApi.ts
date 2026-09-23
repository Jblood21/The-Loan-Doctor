// Agent-portal API client — a fully separate surface from the loan-officer api.ts,
// with its own token storage so an agent session never collides with a loan-officer
// session in the same browser.

import { ApiError } from './api';
import type { AgentUser, Assignment, ShareView } from '@/types';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '';
const AGENT_TOKEN_KEY = 'loandr.agent.token';

export function getAgentToken(): string | null {
  return localStorage.getItem(AGENT_TOKEN_KEY) || sessionStorage.getItem(AGENT_TOKEN_KEY);
}
export function setAgentToken(token: string | null, remember = true) {
  localStorage.removeItem(AGENT_TOKEN_KEY);
  sessionStorage.removeItem(AGENT_TOKEN_KEY);
  if (token) (remember ? localStorage : sessionStorage).setItem(AGENT_TOKEN_KEY, token);
}

async function agentRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAgentToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/agent${path}`, {
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

export interface AgentAuthResponse {
  token: string;
  agent: AgentUser;
}

export const agentApi = {
  register: (data: { email: string; password: string; name?: string; phone?: string }) =>
    agentRequest<AgentAuthResponse>('POST', '/auth/register', data),
  login: (data: { email: string; password: string }) => agentRequest<AgentAuthResponse>('POST', '/auth/login', data),
  me: () => agentRequest<{ agent: AgentUser }>('GET', '/auth/me'),
  updateProfile: (data: Partial<Pick<AgentUser, 'name' | 'phone' | 'brokerage' | 'license' | 'photo'>>) =>
    agentRequest<{ agent: AgentUser }>('PUT', '/auth/profile', data),

  listAssignments: () => agentRequest<{ assignments: Assignment[] }>('GET', '/assignments'),
  getAssignment: (id: string) => agentRequest<{ assignment: Assignment }>('GET', `/assignments/${id}`),
  updateAssignment: (id: string, patch: { propertyAddress?: string; price?: number }) =>
    agentRequest<{ assignment: Assignment }>('PATCH', `/assignments/${id}`, patch),
  assignmentPdf: (id: string) => agentRequest<Blob>('POST', `/assignments/${id}/pdf`),
  shareAssignment: (id: string) => agentRequest<{ token: string }>('POST', `/assignments/${id}/share`),

  reportPdf: (payload: unknown) => agentRequest<Blob>('POST', '/report/pdf', payload),
  flyerPdf: (payload: unknown) => agentRequest<Blob>('POST', '/flyer/pdf', payload),
  shareAfford: (payload: unknown) => agentRequest<{ token: string }>('POST', '/share/afford', payload),
};

/** Public (no-auth) fetch for a shared buyer-facing link, plus the shared-letter PDF URL. */
export async function getPublicShare(token: string): Promise<ShareView> {
  const res = await fetch(`${API_BASE}/api/public/share/${token}`);
  if (!res.ok) {
    let message = 'This link is no longer available.';
    try {
      message = (await res.json()).error || message;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()).share as ShareView;
}
export const publicSharePdfUrl = (token: string) => `${API_BASE}/api/public/share/${token}/pdf`;
