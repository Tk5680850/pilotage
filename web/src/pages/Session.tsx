// Session detail: continue the work (phone-first), read the summary, then the conversation at its latest turn.
// Blueprint: docs/DESIGN.md §8 "Session".
import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bot, ChevronLeft, MessageSquareOff, Pencil, UserRound } from 'lucide-react';
import { api, ApiError, useInvalidate, useSession, useTurns } from '../api';
import { liveLabel, liveState } from '../components/cards';
import { Badge, Button, Callout, EmptyState, IconButton, LiveStatus, LoadingCard, Meta, PageHeader, ProjectGlyph, Skeleton, Snippet, WorkStatus, useToast } from '../components/ui';
import { ago, fmtDate, fmtDateTime, shortModel } from '../util';
import type { SessionDetail } from '../types';
import { Conversation } from '../components/session/Conversation';
import { SessionSummary } from '../components/session/SessionSummary';
import { SessionDetails } from '../components/session/SessionDetails';
import { HeaderActions, PhoneActionBar, useSessionActions } from '../components/session/SessionActions';
import { HARNESS_LABEL, harnessOf, useMedia } from '../components/session/shared';
import './Session.css';

function StatusOf({ s }: { s: SessionDetail }) {
  const st = liveState(s);
  if (st) return <LiveStatus state={st} label={liveLabel(s)} />;
  if (s.kind === 'archived') return <span title="Transcript removed by Claude Code, your prompts kept"><WorkStatus status="archived" label="Archived" /></span>;
  if (s.kind === 'automation')
    return (
      <span className="wstatus">
        <Bot size={13} /> Automation
      </span>
    );
  if (s.digest) return <WorkStatus status={s.digest.status} />;
  return null;
}

function RenameField({ s, onDone }: { s: SessionDetail; onDone: () => void }) {
  const [title, setTitle] = useState(s.title);
  const [busy, setBusy] = useState(false);
  const inv = useInvalidate();
  const toast = useToast();
  const save = () => {
    const next = title.trim();
    if (next === s.title) return onDone();
    setBusy(true);
    api(`/api/sessions/${s.id}`, { method: 'PATCH', body: { title: next } })
      .then(() => {
        toast(next ? 'Renamed in Pilotage' : 'Back to the original title');
        inv('session', 'sessions', 'overview', 'project', 'live', 'day');
        onDone();
      })
      .catch((e) => toast(e.message, true))
      .finally(() => setBusy(false));
  };
  return (
    <form
      className="sx-rename"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input
        className="input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onDone()}
        maxLength={120}
        autoFocus
        aria-label="Session title"
        placeholder="Empty restores the original title"
      />
      <div className="sx-rename-actions">
        <Button type="submit" size="sm" variant="primary" loading={busy}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <span className="hint">Renames it in Pilotage only, not in Claude Code.</span>
      </div>
    </form>
  );
}

/** "2 prompts from you · 18 messages": the same counts the Conversation card shows (a message = a prompt and its reply;
 *  background events hidden, like the default conversation view). */
function useCounts(s: SessionDetail) {
  const { data } = useTurns(s.id);
  const messages = data?.shown ?? null;
  return [
    s.humanPrompts > 0 ? <span title="Prompts you typed">{s.humanPrompts.toLocaleString('en-GB')} {s.humanPrompts === 1 ? 'prompt' : 'prompts'} from you</span> : null,
    messages ? <span title="Messages in the conversation below: each is a prompt and the reply to it">{messages.toLocaleString('en-GB')} {messages === 1 ? 'message' : 'messages'}</span> : null,
  ];
}

function HeaderMeta({ s }: { s: SessionDetail }) {
  const harness = harnessOf(s);
  const counts = useCounts(s);
  return (
    <Meta
      items={[
        s.projectId && s.projectName ? (
          <Link to={`/projects/${s.projectId}`} className="sx-proj">
            <ProjectGlyph name={s.projectName} ws={s.workspace} size={14} />
            {s.projectName}
          </Link>
        ) : (
          <span className="mono truncate" title={s.cwd}>
            {s.cwd.replace(/^\/home\/[^/]+/, '~')}
          </span>
        ),
        s.worktree ? <span title={`Worktree ${s.worktree}`}>{s.worktree}</span> : s.branch ? <span className="mono" title="Branch">{s.branch}</span> : null,
        <span title={fmtDateTime(s.startedAt)}>Started {fmtDate(s.startedAt)}</span>,
        <span title={fmtDateTime(s.lastAt)}>last active {ago(s.lastAt)}</span>,
        ...counts,
        s.model ? <span>{harness === 'claude' ? shortModel(s.model) : s.model}</span> : null,
        s.account ? (
          <span className="chip mono" title={`Claude account ${s.account}`}>
            <UserRound size={11} />
            {s.account}
          </span>
        ) : null,
      ]}
    />
  );
}

/** Desktop: a slim bar under the top bar once the page header has scrolled away. */
function CompactHeader({ s, visible, actions }: { s: SessionDetail; visible: boolean; actions: React.ReactNode }) {
  return (
    <div className="sx-sticky hide-mobile" aria-hidden={!visible}>
      <div className={`sx-sticky-bar${visible ? ' on' : ''}`}>
        {s.projectName && <ProjectGlyph name={s.projectName} ws={s.workspace} size={20} />}
        <span className="sx-sticky-title truncate">{s.title}</span>
        <StatusOf s={s} />
        <span className="grow" />
        {visible && actions}
      </div>
    </div>
  );
}

/** Phone: the page opens at the latest turn, far below the header, so a title strip under the top bar says
 *  which session this is (and where it lives) before you tap Resume, with a way back. */
function PhoneTitleBar({ s, visible }: { s: SessionDetail; visible: boolean }) {
  const navigate = useNavigate();
  const loc = useLocation();
  const fallback = s.projectId ? `/projects/${s.projectId}` : '/sessions';
  // Opened straight from a link (no in-app history): go up to the project instead of leaving Pilotage.
  const back = () => (loc.key !== 'default' ? navigate(-1) : navigate(fallback));
  const where = s.projectName || s.cwd.replace(/^\/home\/[^/]+/, '~');
  return (
    <div className="sx-ptitle hide-desktop" aria-hidden={!visible}>
      <div className={`sx-ptitle-bar${visible ? ' on' : ''}`}>
        <IconButton icon={<ChevronLeft />} label="Back" onClick={back} className="sx-ptitle-back" tabIndex={visible ? undefined : -1} />
        {s.projectName && <ProjectGlyph name={s.projectName} ws={s.workspace} size={24} />}
        <div className="sx-ptitle-text">
          <span className="sx-ptitle-name truncate">{s.title}</span>
          <span className="sx-ptitle-sub truncate">{where}</span>
        </div>
        <StatusOf s={s} />
      </div>
    </div>
  );
}

function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="card">
      <EmptyState
        icon={<MessageSquareOff />}
        title="Session not found"
        body="It may have been removed by Claude Code, or the link is wrong."
        action={
          <>
            <Button size="sm" icon={<ArrowLeft />} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/sessions'))}>
              Back
            </Button>
            <Link className="btn sm ghost" to="/sessions">
              All sessions
            </Link>
          </>
        }
      />
    </div>
  );
}

function Loading() {
  return (
    <>
      <div className="stack" aria-busy="true">
        <Skeleton h={13} w={160} />
        <Skeleton h={28} w="55%" />
        <Skeleton h={13} w="40%" />
      </div>
      <div className="grid-main">
        <div className="stack-lg">
          <LoadingCard lines={3} />
          <LoadingCard lines={6} />
        </div>
        <LoadingCard lines={4} />
      </div>
    </>
  );
}

function SessionView({ s }: { s: SessionDetail }) {
  const phone = useMedia();
  const set = useSessionActions(s);
  const [editing, setEditing] = useState(false);
  const headRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => setEditing(false), [s.id]);
  useEffect(() => {
    const el = headRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '-52px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const harness = harnessOf(s);
  const st = liveState(s);
  const showSummary = s.kind !== 'automation' && (s.blocksDetail.length > 0 || !!s.recap);

  return (
    <>
      <CompactHeader s={s} visible={scrolled && !phone} actions={<HeaderActions set={set} size="sm" />} />
      <PhoneTitleBar s={s} visible={scrolled && phone} />
      <div ref={headRef}>
        <PageHeader
          className="sx-head"
          crumbs={[{ label: 'Sessions', to: '/sessions' }, ...(s.projectId && s.projectName ? [{ label: <><ProjectGlyph name={s.projectName} ws={s.workspace} size={16} />{s.projectName}</>, to: `/projects/${s.projectId}` }] : [])]}
          title={editing ? <RenameField s={s} onDone={() => setEditing(false)} /> : s.title}
          status={
            editing ? undefined : (
              <>
                <StatusOf s={s} />
                {harness !== 'claude' && <Badge>{HARNESS_LABEL[harness]}</Badge>}
                {s.hidden && <Badge tone="plain">Hidden from lists</Badge>}
                <IconButton icon={<Pencil />} label="Rename (in Pilotage only)" onClick={() => setEditing(true)} className="sx-rename-btn" />
              </>
            )
          }
          subtitle={<HeaderMeta s={s} />}
          actions={phone ? undefined : <HeaderActions set={set} />}
        />
      </div>

      {s.live?.detail &&
        (st === 'needs-you' ? (
          <Callout tone="warn" title="Claude is waiting for you">
            <Snippet text={s.live.detail} lines={3} />
          </Callout>
        ) : (
          <div className="sx-livedetail">
            <Snippet text={s.live.detail} lines={2} />
          </div>
        ))}

      <div className="grid-main sx-grid">
        <div className="stack-lg sx-main">
          {showSummary && <SessionSummary s={s} collapsible={phone} />}
          <Conversation s={s} />
        </div>
        <SessionDetails s={s} />
      </div>
      <PhoneActionBar set={set} />
    </>
  );
}

export default function Session() {
  const { id } = useParams();
  const { data: s, error, isLoading, refetch } = useSession(id);
  if (isLoading) return <Loading />;
  if (error instanceof ApiError && error.status === 404) return <NotFound />;
  if (error || !s)
    return (
      <div className="card">
        <EmptyState
          title="Couldn’t load this session"
          body={error instanceof Error ? error.message : 'Unknown error'}
          action={
            <>
              <Button size="sm" onClick={() => refetch()}>
                Try again
              </Button>
              <Link className="btn sm ghost" to="/sessions">
                All sessions
              </Link>
            </>
          }
        />
      </div>
    );
  return <SessionView key={s.id} s={s} />;
}
