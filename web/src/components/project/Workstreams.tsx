// Workstreams (was "Threads"): sessions about one goal inside the project, grouped by AI.
// Compact rows (name · status · date range · N sessions); a row expands to its summary and its sessions.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, GitFork } from 'lucide-react';
import type { ProjectDetail, SessionSummary, Thread } from '../../types';
import { Button, Card, ClampText, Meta, StatusIcon, statusInfo } from '../ui';
import { fmtDate, fmtDateTime, plural } from '../../util';
import { SessionListRow } from '../session/SessionListRow';

const SHOW = 5;
const SESSIONS_SHOWN = 6;

function rangeOf(t: Thread) {
  if (!t.lastAt) return null;
  const a = fmtDate(t.firstAt || t.lastAt);
  const z = fmtDate(t.lastAt);
  return a === z ? z : `${a} – ${z}`;
}

/** The AI's status for the workstream (one session can feed several, so "running" isn't shown per workstream). */
function glyphOf(t: Thread) {
  if (t.loose) return { status: 'queued', label: 'Not grouped yet' };
  const st = t.status === 'active' ? 'in_progress' : t.status || 'idle';
  return { status: st, label: statusInfo(st).label };
}

/** The workstream's sessions, newest first (one session can feed several workstreams). */
function sessionsOf(t: Thread, byId: Map<string, SessionSummary>) {
  const last = new Map<string, { at: number; title: string }>();
  for (const b of t.blocks) {
    const cur = last.get(b.sessionId);
    if (!cur || b.endAt > cur.at) last.set(b.sessionId, { at: b.endAt, title: b.sessionTitle || b.digest?.title || b.fallbackTitle });
  }
  return [...last.entries()].sort((a, b) => b[1].at - a[1].at).map(([id, x]) => ({ id, at: x.at, title: x.title, s: byId.get(id) }));
}

function WorkstreamRow({ t, byId, open, onToggle, onSpinoff, defaultBranch }: { t: Thread; byId: Map<string, SessionSummary>; open: boolean; onToggle: () => void; onSpinoff: (name: string) => void; defaultBranch?: string | null }) {
  const [all, setAll] = useState(false);
  const sessions = useMemo(() => sessionsOf(t, byId), [t, byId]);
  const g = glyphOf(t);
  const range = rangeOf(t);
  const shown = all ? sessions : sessions.slice(0, SESSIONS_SHOWN);
  const id = `ws-${t.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  return (
    <div className={`pj-ws${open ? ' open' : ''}${t.loose ? ' loose' : ''}`} data-ws={t.name}>
      <button type="button" className="pj-ws-row" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span className="pj-ws-lead">
          <StatusIcon status={g.status} title={g.label} />
        </span>
        <span className="pj-ws-main">
          <span className="pj-ws-name">{t.name}</span>
          <Meta items={[g.label, range ? <span title={t.lastAt ? `Last work ${fmtDateTime(t.lastAt)}` : undefined}>{range}</span> : null, plural(sessions.length, 'session')]} />
        </span>
        <ChevronRight className="pj-ws-chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="pj-ws-body" id={id}>
          {t.summary && (
            <ClampText lines={3} className="pj-ws-sum">
              {t.summary}
            </ClampText>
          )}
          <div className="pj-ws-sessions">
            {shown.map((x) =>
              x.s ? (
                <SessionListRow key={x.id} s={x.s} showProject={false} showBranch defaultBranch={defaultBranch} />
              ) : (
                <div key={x.id} className="lrow clickable">
                  <Link to={`/sessions/${x.id}`} className="lrow-link" aria-label={x.title} />
                  <div className="lrow-lead">
                    <StatusIcon status="idle" />
                  </div>
                  <div className="lrow-body">
                    <div className="lrow-title">
                      <span className="t">{x.title}</span>
                    </div>
                  </div>
                  <div className="lrow-trail" title={fmtDateTime(x.at)}>
                    {fmtDate(x.at)}
                  </div>
                </div>
              ),
            )}
          </div>
          <div className="pj-ws-foot">
            {sessions.length > SESSIONS_SHOWN ? (
              <button type="button" className="more-link" onClick={() => setAll(!all)}>
                {all ? 'Show fewer' : `Show ${sessions.length - SESSIONS_SHOWN} more`}
              </button>
            ) : (
              <span />
            )}
            {!t.loose && sessions.length > 0 && (
              <Button size="sm" variant="ghost" icon={<GitFork />} onClick={() => onSpinoff(t.name)} title="Move this workstream into its own project">
                Spin off…
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Workstreams({ p, onSpinoff, focus }: { p: ProjectDetail; onSpinoff: (name: string) => void; focus?: string | null }) {
  const byId = useMemo(() => new Map(p.sessions.map((s) => [s.id, s])), [p.sessions]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(focus ? [focus] : []));
  const [n, setN] = useState(() => {
    const i = focus ? p.threads.findIndex((t) => t.name === focus) : -1;
    return Math.max(SHOW, i + 1);
  });
  const rootRef = useRef<HTMLElement>(null);
  // Linked from a session page (?workstream=<name>): open it and bring it into view once.
  useEffect(() => {
    if (!focus) return;
    setOpen((o) => new Set(o).add(focus));
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-ws="${CSS.escape(focus)}"]`);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }, [focus]);
  if (!p.threads.length) return null;
  const toggle = (name: string) =>
    setOpen((o) => {
      const x = new Set(o);
      if (x.has(name)) x.delete(name);
      else x.add(name);
      return x;
    });
  const list = p.threads.slice(0, n);
  return (
    <section className="section pj-workstreams" id="pj-workstreams" aria-label="Workstreams" ref={rootRef}>
      <div className="section-title">
        <h2 title="Sessions about one goal inside this project, grouped by AI">
          Workstreams <span className="count">{p.threads.length}</span>
        </h2>
      </div>
      <Card flush>
        {list.map((t) => (
          <WorkstreamRow key={t.name} t={t} byId={byId} open={open.has(t.name)} onToggle={() => toggle(t.name)} onSpinoff={onSpinoff} defaultBranch={p.gitExtras?.defaultBranch?.replace(/^origin\//, '')} />
        ))}
        {p.threads.length > n && (
          <button type="button" className="pj-more pj-more-row" onClick={() => setN(p.threads.length)}>
            Show {p.threads.length - n} more
          </button>
        )}
      </Card>
    </section>
  );
}
