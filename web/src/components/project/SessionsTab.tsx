// Sessions tab: what's running in this project, then every session (Today · Yesterday · This week · Earlier) with its
// branch or worktree, then the repo's worktrees in a "Worktrees (N)" disclosure. Same words as /sessions.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessagesSquare, Search } from 'lucide-react';
import type { ProjectDetail } from '../../types';
import { Button, Card, Disclosure, EmptyState, SegmentedControl, Section, Toolbar } from '../ui';
import { plural } from '../../util';
import { RunningGroups } from '../session/LiveRows';
import { SessionListRow } from '../session/SessionListRow';
import { ARCHIVED_HINT, BUCKET_TITLE, HARNESS_LABEL, KINDS, groupByBucket, harnessOf, type SessionKind } from '../session/shared';
import { WorktreesTab } from './WorktreesTab';

const PAGE = 40;

export function SessionsTab({ p, openWorktrees = false }: { p: ProjectDetail; openWorktrees?: boolean }) {
  // null = not picked yet: "With you" when there is at least one, else "All" (an automation-only project shouldn't open empty).
  const [picked, setKind] = useState<SessionKind | null>(null);
  const [harness, setHarness] = useState('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const wtRef = useRef<HTMLDivElement>(null);
  const running = useMemo(() => p.sessions.filter((s) => s.live), [p.sessions]);
  const sorted = useMemo(() => p.sessions.filter((s) => !s.live).sort((a, b) => b.lastAt - a.lastAt), [p.sessions]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: sorted.length, interactive: 0, automation: 0, archived: 0 };
    for (const s of sorted) c[s.kind] = (c[s.kind] || 0) + 1;
    return c;
  }, [sorted]);
  const kind: SessionKind = picked ?? (counts.interactive > 0 ? 'interactive' : 'all');
  const harnesses = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of p.sessions) m.set(harnessOf(s), (m.get(harnessOf(s)) || 0) + 1);
    return [...m.entries()];
  }, [p.sessions]);
  const ql = q.trim().toLowerCase();
  const list = sorted.filter(
    (s) =>
      (kind === 'all' || s.kind === kind) &&
      (harness === 'all' || harnessOf(s) === harness) &&
      (!ql || `${s.title} ${s.lastPrompt} ${s.digest?.summary || ''} ${s.worktree || ''} ${s.branch || ''} ${s.automation || ''}`.toLowerCase().includes(ql)),
  );
  const groups = useMemo(() => groupByBucket(list.slice(0, limit), (s) => s.lastAt), [list, limit]);
  const defaultBranch = p.gitExtras?.defaultBranch?.replace(/^origin\//, '') || null;
  const runningShown = running.filter((s) => harness === 'all' || harnessOf(s) === harness);

  // ?tab=worktrees (old links) opens the disclosure and scrolls to it.
  useEffect(() => {
    if (openWorktrees) setTimeout(() => wtRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }, [openWorktrees]);

  const worktrees =
    p.worktrees.length > 0 ? (
      <div ref={wtRef} className="pj-wt-disc">
        <Disclosure defaultOpen={openWorktrees} summary={<>Worktrees <span className="faint num">({p.worktrees.length})</span></>}>
          <WorktreesTab p={p} />
        </Disclosure>
      </div>
    ) : null;

  if (!p.sessions.length)
    return (
      <div className="stack-xl">
        <Card>
          <EmptyState icon={<MessagesSquare />} title="No sessions yet" body="Sessions from Claude Code, Codex and Gemini in this folder show up here." />
        </Card>
        {worktrees}
      </div>
    );
  // Kinds with nothing in them are left out ("With you" stays: it's the default view everywhere).
  const kindOptions = KINDS.filter((k) => k.value === 'all' || k.value === 'interactive' || counts[k.value] > 0 || kind === k.value).map((k) => ({
    value: k.value,
    title: k.title,
    label: (
      <>
        {k.label} <span className="num pj-seg-count">{counts[k.value] || 0}</span>
      </>
    ),
  }));
  const when = (key: string) => (key === 'today' || key === 'yesterday' ? 'time' : key === 'week' ? 'ago' : 'date') as 'time' | 'ago' | 'date';
  return (
    <div className="stack-xl">
      {runningShown.length > 0 && <RunningGroups live={runningShown} showProject={false} />}
      <div className="stack-lg">
        <Toolbar className="pj-sessions-bar">
          <div className="input-wrap pj-search">
            <Search />
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter sessions…" aria-label="Filter sessions" />
          </div>
          <div className="pj-scroll-x">
            <SegmentedControl value={kind} onChange={(v) => (setKind(v), setLimit(PAGE))} options={kindOptions} label="Kind" />
          </div>
          {harnesses.length > 1 && (
            <div className="pj-scroll-x">
              <SegmentedControl
                value={harness}
                onChange={(v) => (setHarness(v), setLimit(PAGE))}
                size="sm"
                label="Assistant"
                options={[{ value: 'all', label: 'All assistants' }, ...harnesses.map(([h, n]) => ({ value: h, label: <>{HARNESS_LABEL[h as keyof typeof HARNESS_LABEL] || h} <span className="num pj-seg-count">{n}</span></> }))]}
              />
            </div>
          )}
        </Toolbar>
        {kind === 'archived' && <div className="hint">{ARCHIVED_HINT}</div>}
        {list.length ? (
          <div className="stack-xl pj-session-groups">
            {groups.map((g) => (
              <Section key={g.key} title={<span title={BUCKET_TITLE[g.key] || undefined}>{g.label}</span>} count={g.items.length}>
                <Card flush>
                  {g.items.map((s) => (
                    <SessionListRow key={s.id} s={s} showProject={false} showBranch defaultBranch={defaultBranch} when={when(g.key)} />
                  ))}
                </Card>
              </Section>
            ))}
            {list.length > limit && (
              <div className="pj-session-more">
                <Button onClick={() => setLimit(limit + PAGE * 2)}>
                  Show {Math.min(PAGE * 2, list.length - limit)} more of {plural(list.length, 'session')}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <Card>
            <EmptyState
              compact
              title={ql || harness !== 'all' ? 'No sessions match' : running.length && kind === 'interactive' ? 'Nothing else with you yet' : kind === 'interactive' ? 'No sessions with you yet' : 'Nothing here'}
              body={!ql && harness === 'all' && kind === 'interactive' && counts.automation ? `Only automations so far (${plural(counts.automation, 'run')}).` : undefined}
              action={
                <Button size="sm" variant="ghost" onClick={() => (setQ(''), setKind('all'), setHarness('all'))}>
                  {ql || harness !== 'all' ? 'Clear filters' : 'Show all sessions'}
                </Button>
              }
            />
          </Card>
        )}
      </div>
      {worktrees}
    </div>
  );
}
