// Home (route `/`): the sections, top to bottom, as docs/SIMPLIFY.md §4 orders them. Each one renders nothing when it
// has nothing to show (except Today, which says how to plan something).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CornerDownRight, MoreHorizontal, Play, Plus, Smartphone, Sparkles, SunDim, X } from 'lucide-react';
import { api, useBootstrap, useDevices, useNet } from '../../api';
import { pickupHide, planFocus } from '../../api-extra';
import { useApp } from '../AppContext';
import { Button, Callout, Card, IconButton, Meta, PageHeader, ProjectGlyph, Section, Snippet, Spinner, StatusIcon, useToast } from '../ui';
import { Menu, TaskRow, TaskSheet, useProjectIndex } from '../tasks/TaskBits';
import { friendly, usePref, useTaskActions } from '../tasks/model';
import type { Overview, SessionSummary } from '../../types';
import type { WorkItem } from '../../types-extra';
import type { PickupItem, PlanProposal } from '../../types-v3';
import { ago, fmtDate, fmtDateTime, isoDay, plural } from '../../util';
import { HarnessTag, offerHomeUndo, sessionName, waited } from './TodayBits';
import { countRunning } from '../cards';

// ---------------------------------------------------------------- shared bits

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
/** "Good evening, Sam" (name from Settings → Your name, else detected on the server). */
export const homeTitle = (name?: string) => (name ? `${greeting()}, ${name}` : greeting());
export const useUserName = () => useBootstrap().data?.user?.name;
const dateLine = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

/** Optimistic edits of the cached overview (SSE refetches the truth right after). */
function useOverviewCache() {
  const qc = useQueryClient();
  return {
    patch: (fn: (o: Overview) => Overview) => qc.setQueryData<Overview>(['overview'], (o) => (o ? fn(o) : o)),
    refresh: () => qc.invalidateQueries({ queryKey: ['overview'] }),
  };
}

/** Keys hidden on this screen until the server agrees. A key the server no longer sends is forgotten, so the same
 *  row can come back later (e.g. a proposal reappears once its task is taken off today). */
function useGone(present: string[]) {
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const sig = present.join('|');
  useEffect(() => {
    setGone((g) => {
      if (!g.size) return g;
      const keep = new Set([...g].filter((k) => present.includes(k)));
      return keep.size === g.size ? g : keep;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  const add = (k: string) => setGone((g) => new Set(g).add(k));
  const drop = (k: string) =>
    setGone((g) => {
      const n = new Set(g);
      n.delete(k);
      return n;
    });
  return { gone, add, drop };
}

function Proj({ name, ws, color }: { name: string; ws?: string | null; color?: string | null }) {
  return (
    <span className="home-proj">
      <ProjectGlyph name={name || '?'} ws={ws} color={color} size={14} />
      <span className="truncate">{name}</span>
    </span>
  );
}

const sessionProject = (s: SessionSummary) => s.projectName || s.cwd.split('/').pop() || s.cwd;

// ---------------------------------------------------------------- 1. header

/** Shown when there's no plan for today: one plain sentence about right now. */
function nowLine(o: Overview) {
  // same words as Sessions: "N need you" / "N working", else "N open"
  const c = countRunning(o.live.filter((s) => s.live));
  const today = o.plan?.today.length || 0;
  const parts: string[] = [];
  if (c.needs) parts.push(`${plural(c.needs, 'session')} need${c.needs === 1 ? 's' : ''} you`);
  if (c.working) parts.push(`${plural(c.working, 'session')} working`);
  else if (c.open && !c.needs) parts.push(`${plural(c.open, 'session')} open`);
  if (today) parts.push(`${plural(today, 'task')} for today`);
  if (!parts.length) return 'Nothing is running right now.';
  return `${parts.join(', ')}.`.replace(/^./, (c) => c.toUpperCase());
}

export function HomeHeader({ o }: { o: Overview }) {
  const toast = useToast();
  const name = useUserName();
  const [busy, setBusy] = useState(false);
  const d = o.daily;
  const stale = !!d && d.day !== isoDay(Date.now());
  const headline = (d && !stale && d.headline?.trim()) || nowLine(o);
  const run = () => {
    setBusy(true);
    api('/api/ai/run', { method: 'POST', body: { scope: 'daily' } })
      .then(() => toast('Writing today’s plan. It shows up here by itself.'))
      .catch((e) => toast(friendly(e), true))
      .finally(() => setTimeout(() => setBusy(false), 6000));
  };
  const status = d ? (
    <span title={fmtDateTime(d.at)}>{stale ? `Today’s plan was last written ${fmtDate(d.at)}` : `Updated ${ago(d.at)}`}</span>
  ) : o.ai.enabled ? (
    <span>No plan for today yet</span>
  ) : null;
  const refresh = o.ai.enabled ? (
    <button type="button" className="home-refresh" onClick={run} disabled={busy} aria-label={d && !stale ? 'Refresh today’s plan' : 'Write today’s plan now'}>
      {busy ? (
        <>
          <Spinner size={12} /> Writing…
        </>
      ) : d && !stale ? (
        'Refresh'
      ) : (
        'Write it now'
      )}
    </button>
  ) : null;
  return (
    <PageHeader
      className="home-head"
      eyebrow={dateLine()}
      title={homeTitle(name)}
      subtitle={
        <>
          <p className="home-headline">{headline}</p>
          {(status || refresh) && (
            <div className="home-updated">
              {status}
              {status && refresh && <span aria-hidden="true">·</span>}
              {refresh}
            </div>
          )}
        </>
      }
    />
  );
}

// ---------------------------------------------------------------- 2. phone setup (PC only, until a phone is paired)

export function PhoneSetup() {
  const { data: devs } = useDevices();
  const { data: net } = useNet();
  const [dismissed, setDismissed] = usePref<'0' | '1'>('pilotage.today.phoneSetupDismissed', '0');
  if (!devs || !net || dismissed === '1') return null;
  if (devs.devices.some((d) => /android|iphone|ipad|mobile/i.test(d.ua))) return null;
  return (
    <Callout
      icon={<Smartphone size={18} />}
      title="Put Pilotage on your phone"
      action={
        <div className="row">
          <Link to="/settings" className="btn sm">
            Set up
          </Link>
          <Button size="sm" variant="ghost" onClick={() => setDismissed('1')}>
            Not now
          </Button>
        </div>
      }
    >
      {net.firewallRule ? 'Pair it in Settings → Devices and scan the QR code.' : 'Enable phone access in Settings, then pair it with a QR code.'} About two minutes.
    </Callout>
  );
}

// ---------------------------------------------------------------- 3. needs you

function NeedsRow({ s }: { s: SessionSummary }) {
  const url = s.live?.bridgeUrl;
  const question = s.live?.detail?.trim();
  return (
    <div className="lrow clickable home-row needs-row">
      <Link to={`/sessions/${s.id}`} className="lrow-link" aria-label={`${s.title}: view the session`} />
      <div className="lrow-lead">
        <StatusIcon status="needs-you" title="Needs you" />
      </div>
      <div className="lrow-body">
        <div className="lrow-title">
          <span className="t">{s.title}</span>
          <HarnessTag s={s} />
        </div>
        {question ? <Snippet text={question} lines={2} className="needs-q" /> : <div className="needs-q faint">Waiting for your answer</div>}
        <Meta
          items={[
            <Proj name={sessionProject(s)} ws={s.workspace} />,
            <span className="tone-amber" title={fmtDateTime(s.lastAt)}>
              {waited(s.lastAt)}
            </span>,
          ]}
        />
      </div>
      <div className="needs-action">
        {url ? (
          <a className="btn sm needs-open" href={url} target="_blank" rel="noreferrer" aria-label={`Open “${s.title}” in the Claude app`} title="Answer it in the Claude app">
            <Smartphone /> Open in Claude app
          </a>
        ) : (
          <Link className="btn sm needs-open" to={`/sessions/${s.id}`} aria-label={`View “${s.title}”`}>
            View
          </Link>
        )}
      </div>
    </div>
  );
}

export function NeedsYou({ list }: { list: SessionSummary[] }) {
  if (!list.length) return null;
  return (
    <Section title="Needs you" icon={<StatusIcon status="needs-you" title="Needs you" />} count={list.length}>
      <Card flush className="home-card needs-card">
        {list.map((s) => (
          <NeedsRow key={s.id} s={s} />
        ))}
      </Card>
    </Section>
  );
}

// ---------------------------------------------------------------- 4. today

function PlannedTask({ it, onOpen, onUnplan, quick }: { it: WorkItem; onOpen: () => void; onUnplan: () => void; quick: boolean }) {
  const pindex = useProjectIndex();
  return (
    <div className="home-task">
      <TaskRow it={it} project={pindex.get(it.projectId)} quick={quick} showSource={false} onOpen={onOpen} />
      <IconButton icon={<SunDim />} label={`Remove “${it.title}” from today`} title="Remove from today" className="home-unplan" onClick={onUnplan} />
    </div>
  );
}

/** Where the look-alike task already is. A Suggested one isn't "your" task yet, so say which list it sits in. */
function matchLine(p: PlanProposal) {
  if (!p.matchId) return null;
  if (p.matchStatus === 'inbox') return 'in Suggested tasks';
  if (p.matchStatus === 'todo' || p.matchStatus === 'doing') return 'in your To do';
  return 'in your tasks';
}

function ProposalRow({ p, onAccept, onDismiss }: { p: PlanProposal; onAccept: () => void; onDismiss: () => void }) {
  const { openNewSession } = useApp();
  const pindex = useProjectIndex();
  const proj = p.projectId ? pindex.get(p.projectId) : undefined;
  const name = p.projectName || proj?.name || '';
  return (
    <div className="prop-row">
      <ProjectGlyph name={name || '?'} ws={p.workspace ?? proj?.workspace} color={proj?.color} size={24} />
      <div className="prop-body">
        <div className="prop-title">{p.title}</div>
        <Snippet text={p.why} lines={2} className="prop-why" />
        <div className="prop-foot">
          <Meta items={[name ? <Proj name={name} ws={p.workspace ?? proj?.workspace} color={proj?.color} /> : null, matchLine(p)]} />
          <div className="prop-actions">
            <Button size="sm" icon={<Plus />} onClick={onAccept} aria-label={`Add “${p.title}” to today`}>
              Add to today
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Play />}
              aria-label={`Start a session for “${p.title}”`}
              title="Open the New session dialog with Claude’s suggested first prompt"
              onClick={() => openNewSession({ projectId: p.projectId || undefined, prompt: p.action, name: sessionName(p.title) })}
            >
              Start
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss} aria-label={`Not today: hide “${p.title}” until tomorrow`} title="Hide it until tomorrow">
              Not today
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TodayPlan({ o, phone }: { o: Overview; phone: boolean }) {
  const toast = useToast();
  const cache = useOverviewCache();
  const plan = o.plan;
  const tasks = plan?.today || [];
  const proposals = plan?.proposals || [];
  const { setToday } = useTaskActions();
  const goneProps = useGone(proposals.map((p) => p.key));
  const [openId, setOpenId] = useState<string | null>(null);
  const lastOpen = useRef<WorkItem | null>(null);

  const shownProps = proposals.filter((p) => !goneProps.gone.has(p.key)).slice(0, 3);
  const openItem = openId ? tasks.find((t) => t.id === openId) || (lastOpen.current?.id === openId ? lastOpen.current : undefined) : undefined;
  if (openItem) lastOpen.current = openItem;

  // Same action (and undo toast, Ctrl+Z) as "Remove from today" in the task menus; the row leaves at once.
  const unplan = (it: WorkItem) => {
    cache.patch((o) => (o.plan ? { ...o, plan: { ...o.plan, today: o.plan.today.filter((t) => t.id !== it.id) } } : o));
    setToday(it.id, false);
  };

  const accept = (p: PlanProposal) => {
    goneProps.add(p.key);
    planFocus(p.key, 'accept')
      .then((r) => {
        const it = r as WorkItem;
        if (it && 'id' in it)
          cache.patch((o) => (o.plan && !o.plan.today.some((t) => t.id === it.id) ? { ...o, plan: { ...o.plan, today: [...o.plan.today, it] } } : o));
        toast('Added to today');
      })
      .catch((e) => {
        goneProps.drop(p.key);
        toast(friendly(e), true);
      })
      .finally(cache.refresh);
  };

  // "Not today" waits for the undo toast to run out before it tells the server (there's no server-side undo).
  const dismiss = (p: PlanProposal) => {
    goneProps.add(p.key);
    offerHomeUndo(
      'Hidden until tomorrow',
      () => goneProps.drop(p.key),
      () =>
        planFocus(p.key, 'dismiss')
          .catch((e) => {
            goneProps.drop(p.key);
            toast(friendly(e), true);
          })
          .finally(cache.refresh),
    );
  };

  const empty = !tasks.length && !shownProps.length;
  return (
    <Section
      title="Today"
      count={tasks.length || undefined}
      actions={
        empty ? undefined : (
          <Link to="/tasks" className="small link">
            Pick from Tasks
          </Link>
        )
      }
    >
      {empty && (
        <div className="home-empty">
          Nothing planned.{' '}
          <Link to="/tasks" className="link">
            Pick something from Tasks
          </Link>
        </div>
      )}
      {!tasks.length && shownProps.length > 0 && <p className="home-none">You haven’t picked anything for today yet.</p>}
      {tasks.length > 0 && (
        <Card flush className="home-card home-today">
          {tasks.map((t) => (
            <PlannedTask key={t.id} it={t} quick={!phone} onOpen={() => setOpenId(t.id)} onUnplan={() => unplan(t)} />
          ))}
        </Card>
      )}
      {shownProps.length > 0 && (
        <div className="home-props">
          <div className="home-props-label">
            <Sparkles /> Claude suggests for today
          </div>
          <Card flush className="home-card prop-card">
            {shownProps.map((p) => (
              <ProposalRow key={p.key} p={p} onAccept={() => accept(p)} onDismiss={() => dismiss(p)} />
            ))}
          </Card>
        </div>
      )}
      {openItem && <TaskSheet key={openItem.id} it={openItem} onClose={() => setOpenId(null)} />}
    </Section>
  );
}

// ---------------------------------------------------------------- 5. working

function WorkingRow({ s }: { s: SessionSummary }) {
  const detail = s.live?.detail?.trim();
  return (
    <div className="lrow dense clickable home-row work-row">
      <Link to={`/sessions/${s.id}`} className="lrow-link" aria-label={`${s.title}: open the session`} />
      <div className="lrow-lead">
        <StatusIcon status="working" title="Working" />
      </div>
      <div className="work-line">
        <span className="work-t">
          <span className="truncate">{s.title}</span>
          <HarnessTag s={s} />
        </span>
        <span className="work-meta">
          <Proj name={sessionProject(s)} ws={s.workspace} />
          {(detail || s.lastPrompt) && (
            <>
              <span className="work-dot" aria-hidden="true">
                ·
              </span>
              <span className="work-detail">{detail || `“${s.lastPrompt.replace(/\s+/g, ' ').trim()}”`}</span>
            </>
          )}
        </span>
      </div>
      <span className="work-ago num" title={fmtDateTime(s.lastAt)}>
        {ago(s.lastAt)}
      </span>
    </div>
  );
}

function IdleLine({ n, more }: { n: number; more: boolean }) {
  return (
    <Link to="/sessions" className="home-idle">
      <span>{more ? `${n} more ${n === 1 ? 'session' : 'sessions'} open (idle)` : `${plural(n, 'session')} open (idle)`}</span>
      <span className="home-idle-go">
        Sessions <ArrowRight />
      </span>
    </Link>
  );
}

export function Working({ working, idle }: { working: SessionSummary[]; idle: SessionSummary[] }) {
  if (!working.length) return idle.length ? <IdleLine n={idle.length} more={false} /> : null;
  const shown = working.slice(0, 5);
  const more = working.length - shown.length;
  return (
    <Section title="Working" count={working.length}>
      <Card flush className="home-card">
        {shown.map((s) => (
          <WorkingRow key={s.id} s={s} />
        ))}
        {more > 0 && (
          <Link to="/sessions" className="lrow dense clickable home-more">
            <span>{more} more working</span>
            <ArrowRight />
          </Link>
        )}
      </Card>
      {idle.length > 0 && <IdleLine n={idle.length} more />}
    </Section>
  );
}

// ---------------------------------------------------------------- 6. pick up

function resumePrompt(p: PickupItem) {
  return p.nextStep && p.status !== 'done' && p.status !== 'abandoned' ? `Let's continue. Next step: ${p.nextStep}` : '';
}

function PickupRow({ p, phone, onHide }: { p: PickupItem; phone: boolean; onHide: () => void }) {
  const { openNewSession } = useApp();
  const pindex = useProjectIndex();
  const [menu, setMenu] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const resume = () => openNewSession({ resumeId: p.sessionId, prompt: resumePrompt(p) });
  const open = p.status !== 'done' && p.status !== 'abandoned';
  const line = (open && p.nextStep) || p.summary;
  return (
    <div className="lrow clickable home-row pick-row">
      <Link to={`/sessions/${p.sessionId}`} className="lrow-link" aria-label={`${p.title}: open the session`} />
      <div className="lrow-lead">
        <StatusIcon status={p.status || 'idle'} />
      </div>
      <div className="lrow-body">
        <div className="lrow-title">
          <span className="t">{p.title}</span>
        </div>
        {line && (
          <div className={`pick-line${open && p.nextStep ? ' is-next' : ''}`}>
            {open && p.nextStep && <CornerDownRight aria-label="Next step" />}
            <Snippet text={line} lines={1} />
          </div>
        )}
        <Meta
          items={[
            <Proj name={p.projectName} ws={p.workspace} color={pindex.get(p.projectId)?.color} />,
            p.quietDays > 0 ? (
              <span className="quiet-tag" title={`Last active ${fmtDateTime(p.lastAt)}`}>
                Gone quiet {p.quietDays} d
              </span>
            ) : (
              <span title={fmtDateTime(p.lastAt)}>{ago(p.lastAt)}</span>
            ),
          ]}
        />
      </div>
      {phone ? (
        <div className="pick-actions">
          <button
            ref={moreRef}
            type="button"
            className="btn sm ghost icon"
            aria-label={`Actions for “${p.title}”`}
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu(true)}
          >
            <MoreHorizontal />
          </button>
          {menu && (
            <Menu
              anchor={moreRef.current}
              title={p.title}
              onClose={() => setMenu(false)}
              items={[
                ...(p.resumable ? [{ key: 'resume', label: 'Resume', sub: 'Continue this conversation', icon: <Play size={15} />, onSelect: resume }] : []),
                { key: 'hide', label: 'Not now', sub: 'Hide it from Home until it changes', icon: <X size={15} />, onSelect: onHide },
              ]}
            />
          )}
        </div>
      ) : (
        <div className="pick-actions">
          {p.resumable && (
            <Button size="sm" variant="ghost" className="pick-resume" icon={<Play />} onClick={resume} aria-label={`Resume “${p.title}”`} title="Continue this conversation">
              Resume
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onHide} aria-label={`Not now: hide “${p.title}” from Home`} title="Hide it from Home until it changes">
            Not now
          </Button>
        </div>
      )}
    </div>
  );
}

export function PickUp({ items, phone }: { items: PickupItem[]; phone: boolean }) {
  const toast = useToast();
  const cache = useOverviewCache();
  const gone = useGone(items.map((p) => p.key));
  const list = useMemo(() => items.filter((p) => !gone.gone.has(p.key)).slice(0, 5), [items, gone.gone]);
  if (!list.length) return null;
  const hide = (p: PickupItem) => {
    gone.add(p.key);
    pickupHide(p.key)
      .then(() =>
        offerHomeUndo('Hidden from Home', () => {
          cache.patch((o) => (o.pickup && !o.pickup.some((x) => x.key === p.key) ? { ...o, pickup: [...o.pickup, p].sort((a, b) => b.lastAt - a.lastAt) } : o));
          gone.drop(p.key);
          pickupHide(p.key, false)
            .catch((e) => toast(friendly(e), true))
            .finally(cache.refresh);
        }),
      )
      .catch((e) => {
        gone.drop(p.key);
        toast(friendly(e), true);
      });
  };
  return (
    <Section
      title="Pick up"
      actions={
        <Link to="/sessions" className="small link">
          All sessions
        </Link>
      }
    >
      <Card flush className="home-card">
        {list.map((p) => (
          <PickupRow key={p.key} p={p} phone={phone} onHide={() => hide(p)} />
        ))}
      </Card>
    </Section>
  );
}

// ---------------------------------------------------------------- 7. footer

export function HomeFooter({ o }: { o: Overview }) {
  const suggested = o.suggestedCount || 0;
  const possible = o.scout?.newCount || 0;
  const runs = o.counts.automationRuns48h || 0;
  const parts = [
    suggested ? (
      <Link to="/tasks?tab=suggested" className="home-foot-link">
        {plural(suggested, 'suggested task')}
      </Link>
    ) : null,
    possible ? (
      <Link to="/ideas" className="home-foot-link">
        {plural(possible, 'possible project')}
      </Link>
    ) : null,
    runs ? (
      <Link to="/sessions?kind=automation" className="home-foot-link" title="Automation runs in the last 48 hours">
        {plural(runs, 'automation run')} in 48 h
      </Link>
    ) : null,
  ];
  if (!parts.some(Boolean)) return null;
  return (
    <nav className="home-foot" aria-label="To review on other pages">
      <Meta items={parts} />
    </nav>
  );
}
