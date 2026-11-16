// Overview (docs/SIMPLIFY.md §7): Summary → What's next → Workstreams → Possible projects → Automations;
// side column: Details (folder, dates, git, open-in buttons), dev servers and spin-offs when there are any.
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bot, Check, Code2, Copy, FolderOpen, GitFork, MessagesSquare, Plus, RefreshCw, Server, Sparkles, Square, SquareTerminal, X } from 'lucide-react';
import { api, useInvalidate, useWsl } from '../../api';
import { taskDismiss, useScout, useSpinoffs, useWork } from '../../api-extra';
import type { ProjectDetail } from '../../types';
import type { WorkItem } from '../../types-extra';
import { Button, Card, ClampText, Disclosure, EmptyState, IconButton, Meta, ProjectGlyph, Section, Snippet, Spinner, StatusIcon, useToast } from '../ui';
import { ago, copy, fmtDate, fmtDateTime, isoDay, plural } from '../../util';
import { TaskRow, TaskSheet } from '../tasks/TaskBits';
import { useTaskActions } from '../tasks/model';
import { ScoutCards } from '../ideas/ScoutCards';
import { SessionListRow } from '../session/SessionListRow';
import { Workstreams } from './Workstreams';
import { clipTitle, errMsg, normalizeTitle, storageGet, storageSet } from './lib';

type Go = (tab: 'tasks' | 'sessions' | 'notes') => void;

// ---------------------------------------------------------------- summary
function SummaryCard({ p }: { p: ProjectDetail }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const b = p.brief;
  const run = () => {
    setBusy(true);
    api('/api/ai/run', { method: 'POST', body: { scope: 'project', projectId: p.id } })
      .then(() => toast('Summarizing… the summary updates here when it’s done'))
      .catch((e) => toast(errMsg(e), true))
      .finally(() => setTimeout(() => setBusy(false), 5000));
  };
  return (
    <Card
      title="Summary"
      icon={<Sparkles />}
      className="pj-summary"
      actions={
        <>
          {p.briefAt > 0 && (
            <span className="tiny faint" title={fmtDateTime(p.briefAt)}>
              Updated {ago(p.briefAt)}
            </span>
          )}
          {b && <IconButton icon={busy ? <Spinner size={14} /> : <RefreshCw />} label="Summarize again" onClick={run} disabled={busy} />}
        </>
      }
    >
      {b && (b.description || b.currentState) ? (
        <div className="stack-lg">
          {b.description && (
            <ClampText lines={3} className="muted">
              {b.description}
            </ClampText>
          )}
          {b.currentState && (
            <div className="stack-sm">
              <div className="pj-label">Where it stands</div>
              <ClampText lines={4} className="lead pj-lead">
                {b.currentState}
              </ClampText>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          compact
          icon={<Sparkles />}
          title="No summary yet"
          body={
            p.briefError
              ? 'The last attempt didn’t work out. It will be retried, or write it now.'
              : p.sessionCount
                ? 'The AI writes one after it has summarized the sessions here.'
                : 'No sessions here yet. A summary can still be written from the code, README and git history.'
          }
          action={
            <Button size="sm" variant="ghost" icon={busy ? <Spinner size={13} /> : <Sparkles />} onClick={run} disabled={busy}>
              Write it now
            </Button>
          }
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- what's next
/** The task an AI next step already became (kept, suggested, done or dismissed), if any. */
function findStepTask(step: string, i: number, items: WorkItem[]) {
  const n = normalizeTitle(step);
  const head = n.slice(0, 60);
  return items.find(
    (it) =>
      (it.source.kind === 'brief' && it.source.step === i && normalizeTitle(it.detail || it.title).startsWith(head.slice(0, 30))) ||
      normalizeTitle(it.title) === n ||
      (head.length > 20 && normalizeTitle(it.detail).startsWith(head)),
  );
}

const hideKey = (pid: string) => `pl.project.${pid}.hiddenSteps`;
const stepKey = (step: string) => normalizeTitle(step).slice(0, 80);
function useHiddenSteps(pid: string): [Set<string>, (step: string) => void] {
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(storageGet(hideKey(pid)) || '[]'));
    } catch {
      return new Set();
    }
  });
  const hide = (step: string) =>
    setHidden((h) => {
      const n = new Set(h).add(stepKey(step));
      storageSet(hideKey(pid), JSON.stringify([...n].slice(-60)));
      return n;
    });
  return [hidden, hide];
}

function SuggestedStep({ p, step, task, onHide }: { p: ProjectDetail; step: string; task: WorkItem | undefined; onHide: () => void }) {
  const { create, setStatus } = useTaskActions();
  const toast = useToast();
  const [busy, setBusy] = useState<'' | 'keep' | 'dismiss'>('');
  const keep = async () => {
    setBusy('keep');
    if (task) await setStatus(task.id, 'todo');
    else {
      const first = step.split(/(?<=[.!?])\s/)[0];
      await create({ projectId: p.id, title: clipTitle(first, 120), detail: step, status: 'todo' });
    }
    setBusy('');
  };
  const dismiss = async () => {
    setBusy('dismiss');
    if (task) await taskDismiss(task.id, 'not-a-task').catch((e) => toast(errMsg(e), true));
    else toast('Dismissed');
    onHide();
    setBusy('');
  };
  return (
    <div className="lrow pj-sug">
      <div className="lrow-lead">
        <StatusIcon status="queued" title="Suggested" />
      </div>
      <div className="lrow-body">
        <Snippet text={step} lines={2} className="pj-sug-text" />
        <div className="tiny faint">Suggested · from the summary’s next steps</div>
      </div>
      <div className="pj-sug-actions">
        <Button size="sm" variant="ghost" icon={<Check />} loading={busy === 'keep'} onClick={keep} title="Keep it as a task in To do">
          Keep
        </Button>
        <Button size="sm" variant="ghost" icon={<X />} loading={busy === 'dismiss'} onClick={dismiss} title="Not a task: hide it">
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function QuickAdd({ projectId }: { projectId: string }) {
  const { create } = useTaskActions();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    const it = await create({ projectId, title: t, status: 'todo' });
    setBusy(false);
    if (it) setTitle('');
  };
  return (
    <form className="pj-quickadd compact" onSubmit={submit}>
      <div className="input-wrap grow">
        <Plus />
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task to To do…" aria-label="New task title" maxLength={200} enterKeyHint="done" />
      </div>
      <Button type="submit" size="sm" disabled={!title.trim()} loading={busy}>
        Add
      </Button>
    </form>
  );
}

const MAX_TASKS = 5;
const MAX_SUGGESTED = 3;

function WhatsNext({ p, go }: { p: ProjectDetail; go: Go }) {
  const { data: work, isLoading } = useWork({ project: p.id });
  const [openId, setOpenId] = useState<string | null>(null);
  const [hidden, hide] = useHiddenSteps(p.id);
  const [allSug, setAllSug] = useState(false);
  const items = work?.items || [];
  const today = isoDay(Date.now());
  const rank = (it: WorkItem) => (it.plannedFor && it.plannedFor <= today ? 0 : it.status === 'doing' ? 1 : 2);
  // Today first, then Doing, then To do (server order inside each: priority, due date).
  const open = items.filter((it) => it.status === 'todo' || it.status === 'doing').sort((a, b) => rank(a) - rank(b));
  const top = open.slice(0, MAX_TASKS);
  const suggested = useMemo(() => {
    const now = Date.now();
    return (p.brief?.nextSteps || [])
      .map((step, i) => ({ step, task: findStepTask(step, i, items) }))
      .filter(({ step, task }) => !hidden.has(stepKey(step)) && (!task || (task.status === 'inbox' && !(task.snoozeUntil && task.snoozeUntil > now))));
  }, [p.brief, items, hidden]);
  const otherSuggested = items.filter((it) => it.status === 'inbox').length - suggested.filter((x) => x.task).length;
  const openItem = openId ? items.find((i) => i.id === openId) : undefined;

  return (
    <Card
      title="What’s next"
      flush
      className="pj-next"
      actions={
        <button type="button" className="btn sm ghost" onClick={() => go('tasks')}>
          All tasks
        </button>
      }
      footer={<QuickAdd projectId={p.id} />}
    >
      {isLoading ? (
        <div className="pj-card-note small faint">Loading tasks…</div>
      ) : (
        <>
          {top.map((it) => (
            <TaskRow key={it.id} it={it} showProject={false} quick hoverQuick onOpen={() => setOpenId(it.id)} />
          ))}
          {open.length > top.length && (
            <button type="button" className="pj-more pj-more-row" onClick={() => go('tasks')}>
              {plural(open.length - top.length, 'more task')} in Tasks
            </button>
          )}
          {(allSug ? suggested : suggested.slice(0, MAX_SUGGESTED)).map(({ step, task }) => (
            <SuggestedStep key={stepKey(step)} p={p} step={step} task={task} onHide={() => hide(step)} />
          ))}
          {!allSug && suggested.length > MAX_SUGGESTED && (
            <button type="button" className="pj-more pj-more-row" onClick={() => setAllSug(true)}>
              Show {plural(suggested.length - MAX_SUGGESTED, 'more suggestion')}
            </button>
          )}
          {!top.length && !suggested.length && <div className="pj-card-note small faint">Nothing planned here. Add a task below, or keep one from Tasks › Suggested.</div>}
          {otherSuggested > 0 && (
            <button type="button" className="pj-more pj-more-row" onClick={() => go('tasks')}>
              {plural(otherSuggested, 'other suggestion')} from your sessions in Tasks › Suggested
            </button>
          )}
        </>
      )}
      {openItem && <TaskSheet key={openItem.id} it={openItem} onClose={() => setOpenId(null)} />}
    </Card>
  );
}

// ---------------------------------------------------------------- when the AI hasn't grouped anything yet
function RecentSessions({ p, go }: { p: ProjectDetail; go: Go }) {
  const recent = p.sessions
    .filter((s) => s.kind !== 'automation' && !s.live && !s.hidden)
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, 5);
  if (!recent.length) return null;
  return (
    <Card
      title="Recent sessions"
      icon={<MessagesSquare />}
      flush
      actions={
        <button type="button" className="btn sm ghost" onClick={() => go('sessions')}>
          All sessions
        </button>
      }
    >
      {recent.map((s) => (
        <SessionListRow key={s.id} s={s} showProject={false} showBranch />
      ))}
    </Card>
  );
}

// ---------------------------------------------------------------- possible projects
function PossibleProjects({ p }: { p: ProjectDetail }) {
  const { data } = useScout(p.id);
  const has = (data?.candidates || []).some((c) => c.status === 'new' && c.projectId === p.id);
  if (!has) return null;
  return (
    <Section title="Possible projects">
      <ScoutCards projectId={p.id} compact />
    </Section>
  );
}

// ---------------------------------------------------------------- automations (one folded line)
function Automations({ p }: { p: ProjectDetail }) {
  if (!p.automations.length) return null;
  const last = Math.max(...p.automations.map((a) => a.lastAt || 0));
  return (
    <Disclosure
      className="pj-autos"
      summary={
        <span className="pj-autos-sum">
          <Bot size={15} className="faint" aria-hidden="true" />
          {plural(p.automations.length, 'automation')}
          {last > 0 && (
            <span className="faint" title={fmtDateTime(last)}>
              · last run {ago(last)}
            </span>
          )}
        </span>
      }
    >
      <Card flush>
        {p.automations.map((a) => (
          <div key={a.name} className={`lrow${a.lastSessionId ? ' clickable' : ''}`}>
            {a.lastSessionId && <Link to={`/sessions/${a.lastSessionId}`} className="lrow-link" aria-label={`${a.name}, last run`} />}
            <div className="lrow-body">
              <div className="lrow-title">
                <span className="t">{a.name.replace(/^./, (c) => c.toUpperCase())}</span>
              </div>
              {a.lastResult && <Snippet text={a.lastResult} lines={2} className="lrow-sub" />}
              <Meta items={[plural(a.runs, 'run'), <span title={fmtDateTime(a.lastAt)}>last {ago(a.lastAt)}</span>]} />
            </div>
          </div>
        ))}
      </Card>
    </Disclosure>
  );
}

// ---------------------------------------------------------------- side column
function DetailsCard({ p, go }: { p: ProjectDetail; go: Go }) {
  const toast = useToast();
  const wsl = useWsl(); // a terminal tab needs Windows Terminal; VS Code and the folder open natively elsewhere
  const first = Math.min(...[p.firstAt, p.gitExtras?.firstCommitAt || 0].filter((x) => x > 0), Infinity);
  const g = p.gitFull?.ok ? p.gitFull : null;
  const changes = g ? g.dirty + g.untracked : 0;
  const log = p.gitExtras?.recentLog || [];
  const open = (what: 'vscode' | 'shell' | 'explorer') =>
    api('/api/open', { method: 'POST', body: { what, projectId: p.id } })
      .then(() => toast(what === 'vscode' ? 'Opening VS Code on your PC…' : what === 'explorer' ? 'Opening the folder on your PC…' : 'Opened a terminal tab on your PC'))
      .catch((e) => toast(errMsg(e), true));
  return (
    <Card
      title="Details"
      className="pj-details"
      actions={
        g?.webUrl ? (
          <a className="btn sm ghost" href={g.webUrl} target="_blank" rel="noreferrer" title="Open the repository on the web">
            Remote <ArrowUpRight />
          </a>
        ) : undefined
      }
    >
      <div className="stack-lg">
        <dl className="kv">
          <dt>Folder</dt>
          <dd className="pj-path-dd">
            <span className="mono small break">{p.displayPath}</span>
            <IconButton icon={<Copy />} label="Copy folder path" onClick={() => copy(p.path).then(() => toast('Path copied'))} />
          </dd>
          {Number.isFinite(first) && (
            <>
              <dt>Started</dt>
              <dd>{fmtDate(first)}</dd>
            </>
          )}
          <dt>Last activity</dt>
          <dd title={fmtDateTime(p.lastAt)}>{p.lastAt ? ago(p.lastAt) : '—'}</dd>
          {p.isGit && (
            <>
              <dt>Branch</dt>
              <dd>
                {g ? (
                  <>
                    <span className="mono">{g.branch || 'detached'}</span>
                    <span className="tiny faint">
                      {[changes ? null : 'clean', g.ahead ? `${g.ahead} to push` : '', g.behind ? `${g.behind} to pull` : ''].filter(Boolean).join(' · ')}
                    </span>
                    {changes > 0 && <span className="tiny tone-amber">{plural(changes, 'uncommitted change')}</span>}
                  </>
                ) : (
                  <span className="faint">Reading the repository…</span>
                )}
              </dd>
            </>
          )}
          {g?.lastCommitAt ? (
            <>
              <dt>Last commit</dt>
              <dd>
                <span className="clamp-2" title={g.lastCommitMsg}>
                  {g.lastCommitMsg || '—'}
                </span>
                <span className="tiny faint" title={fmtDateTime(g.lastCommitAt)}>
                  {ago(g.lastCommitAt)}
                </span>
              </dd>
            </>
          ) : null}
          {p.worktreeCount > 0 && (
            <>
              <dt>Worktrees</dt>
              <dd>
                <button type="button" className="link pj-linkbtn" onClick={() => go('sessions')} title="Listed at the bottom of the Sessions tab">
                  {p.worktreeCount}
                </button>
              </dd>
            </>
          )}
          {p.stack.length > 0 && (
            <>
              <dt>Stack</dt>
              <dd>{p.stack.join(' · ')}</dd>
            </>
          )}
        </dl>
        <div className="pj-openin" role="group" aria-label="Open on your PC">
          <Button size="sm" icon={<Code2 />} onClick={() => open('vscode')} title="Open this folder in VS Code on your PC">
            VS Code
          </Button>
          {wsl && (
            <Button size="sm" icon={<SquareTerminal />} onClick={() => open('shell')} title="Open a terminal tab here on your PC">
              Terminal
            </Button>
          )}
          <Button size="sm" icon={<FolderOpen />} onClick={() => open('explorer')} title={wsl ? 'Open the folder in Explorer on your PC' : 'Open the folder in your file manager'}>
            Folder
          </Button>
        </div>
        {log.length > 0 && (
          <Disclosure summary="Recent commits" className="pj-commits">
            <div className="stack-sm">
              {log.slice(0, 12).map((c, i) => (
                <div key={i} className="pj-commit small">
                  <span className="faint num">{fmtDate(Date.parse(`${c.d}T12:00:00`))}</span>
                  <span className="clamp-2">{c.s}</span>
                </div>
              ))}
            </div>
          </Disclosure>
        )}
      </div>
    </Card>
  );
}

function ServersCard({ p }: { p: ProjectDetail }) {
  const toast = useToast();
  const inv = useInvalidate();
  if (!p.processes.length) return null;
  const stop = (pid: number, ports: number[]) => {
    if (!confirm(`Stop the dev server on ${ports.length ? `port ${ports.join(', ')}` : `pid ${pid}`}?`)) return;
    api(`/api/processes/${pid}/stop`, { method: 'POST' })
      .then(() => {
        toast('Stopped');
        setTimeout(() => inv('project'), 2000);
      })
      .catch((e) => toast(errMsg(e), true));
  };
  return (
    <Card title="Dev servers" icon={<Server />} count={p.processes.length} flush>
      {p.processes.map((x) => (
        <div key={x.pid} className="lrow">
          <div className="lrow-body">
            <div className="cluster">
              {x.ports.map((port) => (
                <a key={port} className="link mono small" href={`http://localhost:${port}`} target="_blank" rel="noreferrer">
                  localhost:{port}
                </a>
              ))}
              {!x.ports.length && <span className="small">pid {x.pid}</span>}
            </div>
            <div className="tiny faint mono truncate" title={x.cmd}>
              {x.cmd}
            </div>
            <Meta items={[<span title={fmtDateTime(x.startedAt)}>since {ago(x.startedAt)}</span>, x.deleted ? <span className="tone-amber">folder deleted</span> : null, x.publicBind ? <span className="tone-amber">open to the network</span> : null]} />
          </div>
          <div className="lrow-trail">
            <IconButton icon={<Square />} label="Stop this server" onClick={() => stop(x.pid, x.ports)} />
          </div>
        </div>
      ))}
    </Card>
  );
}

function RelationsCard({ p }: { p: ProjectDetail }) {
  const { data } = useSpinoffs(p.id);
  const from = (data || []).filter((r) => r.toProjectId === p.id && r.fromProjectId);
  const to = (data || []).filter((r) => r.fromProjectId === p.id);
  if (!from.length && !to.length) return null;
  return (
    <Card title="Spin-offs" icon={<GitFork />} flush>
      {from.map((r) => (
        <RelRow key={r.id} to={r.fromRegistered ? `/projects/${r.fromProjectId}` : undefined} glyph={r.fromName || '?'} label="Spun off from" name={r.fromName || r.from || ''} sub={r.threadName ? `Workstream “${r.threadName}”` : undefined} at={r.createdAt} />
      ))}
      {to.map((r) => (
        <RelRow key={r.id} to={r.toRegistered ? `/projects/${r.toProjectId}` : undefined} glyph={r.toName} label="Spun off" name={r.toName} sub={r.toDisplayPath} at={r.createdAt} />
      ))}
    </Card>
  );
}

function RelRow({ to, glyph, label, name, sub, at }: { to?: string; glyph: string; label: string; name: string; sub?: string; at: number }) {
  return (
    <div className={`lrow${to ? ' clickable' : ''}`}>
      {to && <Link to={to} className="lrow-link" aria-label={`${label} ${name}`} />}
      <div className="lrow-lead">
        <ProjectGlyph name={glyph} size={20} />
      </div>
      <div className="lrow-body">
        <div className="tiny faint">{label}</div>
        <div className="lrow-title">
          <span className="t">{name}</span>
        </div>
        {sub && <div className="tiny faint truncate">{sub}</div>}
      </div>
      <div className="lrow-trail" title={fmtDateTime(at)}>
        {fmtDate(at)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- tab
export function OverviewTab({ p, go, onSpinoff, focusWorkstream }: { p: ProjectDetail; go: Go; onSpinoff: (thread: string) => void; focusWorkstream?: string | null }) {
  return (
    <div className="grid-main pj-overview">
      <div className="stack-xl pj-main-col">
        <SummaryCard p={p} />
        <WhatsNext p={p} go={go} />
        {p.threads.length ? <Workstreams p={p} onSpinoff={onSpinoff} focus={focusWorkstream} /> : <RecentSessions p={p} go={go} />}
        <PossibleProjects p={p} />
        <Automations p={p} />
      </div>
      <aside className="stack-lg pj-rail" aria-label="Project details">
        <DetailsCard p={p} go={go} />
        <ServersCard p={p} />
        <RelationsCard p={p} />
      </aside>
    </div>
  );
}
