// Hooks for the work (tasks / spin-offs) and provider/harness APIs.
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { WorkList, Spinoff, ProvidersResponse, HarnessesResponse, WorkItem } from './types-extra';
import type { ScoutList } from './types-v3';

export const useWork = (params: { project?: string; status?: string; q?: string } = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return useQuery({ queryKey: ['work', qs], queryFn: () => api<WorkList>(`/api/work${qs ? `?${qs}` : ''}`) });
};
export const useSpinoffs = (projectId?: string) =>
  useQuery({ queryKey: ['spinoffs', projectId || 'all'], queryFn: () => api<{ spinoffs: Spinoff[] }>(`/api/spinoffs${projectId ? `?project=${projectId}` : ''}`).then((r) => r.spinoffs ?? (r as unknown as Spinoff[])) });
export const useProviders = () => useQuery({ queryKey: ['providers'], queryFn: () => api<ProvidersResponse>('/api/providers') });
export const useHarnesses = () => useQuery({ queryKey: ['harnesses'], queryFn: () => api<HarnessesResponse>('/api/harnesses') });

// ---- v3 (docs/SIMPLIFY.md §10). All mutations: the server broadcasts work / overview / scout, so lists refresh by SSE;
// callers may still invalidate for instant feedback.
export const useScout = (projectId?: string) =>
  useQuery({ queryKey: ['scout', projectId || 'all'], queryFn: () => api<ScoutList>(`/api/scout${projectId ? `?projectId=${projectId}` : ''}`) });
export const scoutRun = (projectId?: string) => api<{ ok: boolean; queued?: number }>('/api/scout/run', { method: 'POST', body: projectId ? { projectId } : {} });
export const scoutSetStatus = (id: string, status: 'dismissed' | 'new') => api(`/api/scout/${id}`, { method: 'PATCH', body: { status } });
export const scoutSave = (id: string) => api<{ ok: boolean; ideaId?: string }>(`/api/scout/${id}/save`, { method: 'POST' });

export const taskToday = (id: string, on: boolean) => api<WorkItem>(`/api/work/${id}/today`, { method: 'POST', body: { on } });
export type DismissReason = 'not-a-task' | 'done' | 'duplicate' | 'snooze' | 'unsnooze';
export const taskDismiss = (id: string, reason: DismissReason) => api<WorkItem>(`/api/work/${id}/dismiss`, { method: 'POST', body: { reason } });
export const tasksDismissOld = (days = 14) => api<{ ok: boolean; ids: string[] }>('/api/work/dismiss-old', { method: 'POST', body: { days } });
export const tasksRestore = (ids: string[]) => api<{ ok: boolean; restored: number }>('/api/work/restore', { method: 'POST', body: { ids } });
/** Accept or dismiss one of today's AI proposals, by its stable key (the plan can be rewritten during the day). */
export const planFocus = (key: string, action: 'accept' | 'dismiss') => api<WorkItem | { ok: boolean }>(`/api/plan/focus/${key}`, { method: 'POST', body: { action } });
export const pickupHide = (key: string, hide = true) => api(`/api/pickup/${hide ? 'hide' : 'unhide'}`, { method: 'POST', body: { key } });
