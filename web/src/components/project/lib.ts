// Local helpers for the Projects / Project pages (kept here so the shared api/util files stay untouched).
import { useEffect, useMemo, useState } from 'react';
import { useProjects } from '../../api';
import type { WorkStatus } from '../../types-extra';
import './project.css';

/** Error that keeps the server's extra fields (e.g. 409 `{ suggestion, existing }`). */
export class RequestError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(status: number, msg: string, data: Record<string, unknown>) {
    super(msg);
    this.status = status;
    this.data = data;
  }
}

/** Same contract as `api()` (CSRF header, JSON body) but errors keep the response body. */
export async function request<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = opts.method || 'GET';
  const headers: Record<string, string> = {};
  if (method !== 'GET') {
    headers['X-Pilotage'] = '1';
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(path, { method, headers, credentials: 'same-origin', body: opts.body !== undefined ? JSON.stringify(opts.body) : method === 'GET' || method === 'DELETE' ? undefined : '{}' });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    if (res.status === 401) window.location.reload();
    throw new RequestError(res.status, data?.error || `HTTP ${res.status}`, data || {});
  }
  return data as T;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e ?? 'Unknown error'));

const PHONE_Q = '(max-width: 860px)';
/** Live phone-layout flag (follows window resizes, unlike util.isPhone()). */
export function useIsPhone() {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(PHONE_Q).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_Q);
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

/** Debounce a value (for dry runs while typing). */
export function useDebounced<T>(value: T, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export type WorkspaceOption = { key: string; name: string; count: number };
/** Every workspace key known from the project list (hidden projects included), by name. */
export function useWorkspaceOptions(): WorkspaceOption[] {
  const { data } = useProjects(true);
  return useMemo(() => {
    const m = new Map<string, WorkspaceOption>();
    for (const p of data || []) {
      const w = m.get(p.workspace) || { key: p.workspace, name: p.workspaceName, count: 0 };
      w.count++;
      m.set(p.workspace, w);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);
}

// ---------- work items (tasks) ----------
// The task vocabulary (statuses, priorities, cards, sheet) lives in components/tasks; only this helper is local.
export const isOpen = (s: WorkStatus) => s === 'inbox' || s === 'todo' || s === 'doing';

export function normalizeTitle(s: string) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function clipTitle(s: string, n = 200) {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

export function storageGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function storageSet(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* storage unavailable */
  }
}
