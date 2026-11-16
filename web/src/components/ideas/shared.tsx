// Helpers shared by the Ideas page and its dialogs.
import React, { useMemo } from 'react';
import type { Idea, ProjectSummary } from '../../types';

/** Ideas carry a few extra fields the shared type doesn't list yet. */
export type IdeaX = Idea & { workItemId?: string; scoutId?: string };

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const baseName = (p: string) => p.replace(/\/+$/, '').split('/').pop() || p;
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
export const looksLikePhone = (s: string) => /phone|android|iphone|ipad|tablet/i.test(s);

/** First line of an idea, cut at a word boundary: a good task title. */
export function ideaTitle(text: string, max = 120) {
  const line =
    (text || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) || '';
  if (line.length <= max) return line;
  const cut = line.slice(0, max);
  const i = cut.lastIndexOf(' ');
  return `${(i > 40 ? cut.slice(0, i) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

/** A short project name from the idea text ("Build a WhatsApp reminder bot" → "WhatsApp reminder bot"). */
export function suggestName(text: string) {
  const first = ideaTitle(text, 80)
    .replace(/…$/, '')
    .split(/[:(—–]| - /)[0];
  const stop = /^(for|to|with|of|in|on|and|or|a|an|the|that|which|de|du|des|pour|avec|et|le|la|les|un|une)$/i;
  const words = first
    .replace(/^(build|make|create|write|start|add|try|une?|un|créer|faire)\s+/i, '')
    .replace(/^(a|an|the)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  while (words.length > 1 && stop.test(words[words.length - 1])) words.pop();
  const out = words.join(' ').replace(/[.,;:!?]+$/, '');
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : '';
}

/** POST that keeps the error body (e.g. 409 { suggestion }) instead of throwing it away. */
export async function postRaw<T>(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string; suggestion?: string | null; existing?: string } }> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'X-Pilotage': '1', 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (res.status === 401) window.location.reload();
  return { ok: res.ok, status: res.status, data };
}

/** Projects grouped by workspace; most recently active first. */
export function groupProjects(projects: ProjectSummary[]) {
  const m = new Map<string, { key: string; name: string; last: number; ps: ProjectSummary[] }>();
  for (const p of projects) {
    const g = m.get(p.workspace) || { key: p.workspace, name: p.workspaceName, last: 0, ps: [] };
    g.ps.push(p);
    g.last = Math.max(g.last, p.lastAt || 0);
    m.set(p.workspace, g);
  }
  return [...m.values()].sort((a, b) => b.last - a.last).map((g) => ({ ...g, ps: g.ps.slice().sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0)) }));
}

/** Native select of projects grouped by workspace (works well on phones). */
export function ProjectSelect({
  id,
  projects,
  value,
  onChange,
  label,
  noneLabel = 'No project',
  extra,
  className = '',
  disabled,
}: {
  id: string;
  projects: ProjectSummary[] | undefined;
  value: string;
  onChange: (v: string) => void;
  label: string;
  noneLabel?: string | null;
  extra?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const groups = useMemo(() => groupProjects(projects || []), [projects]);
  return (
    <select id={id} className={`select ${className}`} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} disabled={disabled}>
      {noneLabel !== null && <option value="">{noneLabel}</option>}
      {extra}
      {groups.map((g) => (
        <optgroup key={g.key || '(none)'} label={g.name}>
          {g.ps.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
