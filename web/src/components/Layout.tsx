import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Briefcase, CircleHelp, FolderKanban, History, Home, Lightbulb, ListChecks, MessagesSquare, MoreHorizontal, Plus, Search, Settings, SquareTerminal, TriangleAlert } from 'lucide-react';
import { useBootstrap, useOverview, useProjects } from '../api';
import type { SessionDetail, SessionSummary } from '../types';
import { useApp } from './AppContext';
import { EmptyState, Kbd, Meter, USAGE_LABELS, WorkspaceAvatar } from './ui';
import { fmtTime, plural } from '../util';
import { liveState, runningWord, type RunCounts } from './cards';
import { NewSessionModal } from './NewSession';
import { CommandPalette } from './CommandPalette';
import { Menu } from './tasks/TaskBits';
import { InstallHint } from './InstallHint';

const WS_VISIBLE = 8;

/** Running sessions by state: what the Sessions badge and the workspace presence dots show. */
export function runningCounts(live: SessionSummary[] | undefined) {
  let needs = 0;
  let working = 0;
  let open = 0;
  for (const s of live || []) {
    const st = liveState(s);
    if (st === 'needs-you') needs++;
    else if (st === 'working') working++;
    else open++;
  }
  return { needs, working, open, total: needs + working + open };
}

/** Sessions badge: needs-you count (amber) when something waits for you, else the working count (accent). */
function SessionsBadge({ live, phone = false }: { live: SessionSummary[] | undefined; phone?: boolean }) {
  const c = runningCounts(live);
  if (!c.needs && !c.working) return null;
  const needs = c.needs > 0;
  const n = needs ? c.needs : c.working;
  const title = needs ? `${plural(c.needs, 'session')} need${c.needs === 1 ? 's' : ''} you` : `${plural(c.working, 'session')} working`;
  if (phone)
    return (
      <span className={`pip${needs ? ' needs' : ' working'}`} aria-label={title} title={title}>
        {n}
      </span>
    );
  return (
    <span className={`count num ${needs ? 'needs' : 'live'}`} title={title} aria-label={title}>
      <span className="live-pip" />
      {n}
    </span>
  );
}

function UsageBox() {
  const { data } = useOverview();
  const u = data?.usage;
  if (!u || (!u.five && !u.seven)) return null;
  const row = (label: string, pct: number, resetsAt?: number) => (
    <div className="usage-row" title={resetsAt ? `Resets at ${fmtTime(resetsAt)}` : undefined}>
      <span>{label}</span>
      <span className="v">{Math.round(pct)}%</span>
      <Meter pct={pct} label={label} size="sm" />
    </div>
  );
  return (
    <div className="usage" aria-label="Claude usage">
      {u.five && row(USAGE_LABELS.five, u.five.pct, u.five.resetsAt)}
      {u.seven && row(USAGE_LABELS.seven, u.seven.pct, u.seven.resetsAt)}
    </div>
  );
}

function Sidebar() {
  const { data: overview } = useOverview();
  const { data: projects } = useProjects();
  const loc = useLocation();
  const [allWs, setAllWs] = useState(false);
  const work = overview?.work;
  const tasksOpen = work ? (work.todoCount || 0) + (work.doingCount || 0) : 0;
  const possible = overview?.scout?.newCount || 0;
  // running sessions per workspace; the dot shows the most urgent state: needs-you > working > open
  const wsRun = new Map<string, RunCounts>();
  for (const s of overview?.live || []) {
    if (!s.workspace) continue;
    const st = liveState(s);
    const c = wsRun.get(s.workspace) || { needs: 0, working: 0, open: 0 };
    if (st === 'needs-you') c.needs++;
    else if (st === 'working') c.working++;
    else c.open++;
    wsRun.set(s.workspace, c);
  }
  const workspaces = new Map<string, { name: string; n: number; live: number; active: number; only: string | null }>();
  for (const p of projects || []) {
    const w = workspaces.get(p.workspace) || { name: p.workspaceName, n: 0, live: 0, active: 0, only: null };
    w.n++;
    w.live += p.liveCount;
    w.only = w.n === 1 ? p.id : null;
    if (p.status === 'active') w.active++;
    workspaces.set(p.workspace, w);
  }
  const ws = [...workspaces.entries()].sort((a, b) => b[1].live - a[1].live || b[1].active - a[1].active || b[1].n - a[1].n);
  const curWs = loc.pathname === '/projects' ? new URLSearchParams(loc.search).get('ws') : null;
  const curProject = loc.pathname.startsWith('/projects/') ? decodeURIComponent(loc.pathname.slice('/projects/'.length)) : null;
  const shown = allWs ? ws : ws.slice(0, WS_VISIBLE);
  const nav = (to: string, icon: React.ReactNode, label: string, badge?: React.ReactNode, opts: { end?: boolean; title?: string } = {}) => (
    <NavLink to={to} end={opts.end} title={opts.title} className={({ isActive }) => `nav-item${isActive && !(to === '/projects' && curWs) ? ' active' : ''}`}>
      {icon}
      <span>{label}</span>
      {badge}
    </NavLink>
  );
  const sub = (to: string, icon: React.ReactNode, label: string) => (
    <NavLink to={to} className={({ isActive }) => `nav-item sub${isActive ? ' active' : ''}`}>
      {icon}
      <span>{label}</span>
    </NavLink>
  );
  const count = (n: number, title: string) => (n > 0 ? <span className="count num" title={title}>{n}</span> : undefined);
  const c = overview?.counts;
  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="/icon.svg" alt="" />
        Pilotage
      </div>
      <nav className="nav-primary" aria-label="Main">
        {nav('/', <Home size={16} />, 'Home', undefined, { end: true })}
        {nav('/sessions', <MessagesSquare size={16} />, 'Sessions', <SessionsBadge live={overview?.live} />, {
          title: c?.interactive !== undefined ? `${plural(c.interactive, 'session')} with you${c.automated ? ` · ${plural(c.automated, 'automation')}` : ''}` : undefined,
        })}
        {nav('/tasks', <ListChecks size={16} />, 'Tasks', count(tasksOpen, `${work?.todoCount || 0} to do · ${work?.doingCount || 0} doing`))}
        {nav('/projects', <FolderKanban size={16} />, 'Projects')}
        {nav('/ideas', <Lightbulb size={16} />, 'Ideas', count(possible, `${plural(possible, 'new possible project')}`))}
      </nav>
      {ws.length > 0 && (
        <div className="nav-section">
          <span>Workspaces</span>
        </div>
      )}
      {shown.map(([key, w]) => {
        const run = runningWord(wsRun.get(key));
        const st = run ? (run.state === 'idle_live' ? 'open' : run.state) : null;
        const to = w.only ? `/projects/${w.only}` : `/projects?ws=${encodeURIComponent(key)}`;
        const active = w.only ? curProject === w.only : curWs === key;
        return (
          <NavLink key={key} to={to} className={() => `nav-item ws${active ? ' active' : ''}`} title={run ? `${w.name}: ${run.title}` : w.only ? `${w.name} (one project)` : w.name}>
            <span className="ws-wrap">
              <WorkspaceAvatar ws={key} name={w.name} size={18} />
              {st && run && <span className={`presence ${st}`} aria-label={run.title} />}
            </span>
            <span className="truncate">{w.name}</span>
            {!w.only && (
              <span className="count num" title={plural(w.n, 'project')}>
                {w.n}
              </span>
            )}
          </NavLink>
        );
      })}
      {ws.length > WS_VISIBLE && (
        <button type="button" className="nav-item more" onClick={() => setAllWs(!allWs)}>
          <span className="ws-more-ico">
            <MoreHorizontal size={14} />
          </span>
          <span>{allWs ? 'Show fewer' : `${ws.length - WS_VISIBLE} more`}</span>
        </button>
      )}
      <div className="sidebar-foot">
        <nav className="nav-secondary" aria-label="More">
          {sub('/history', <History size={15} />, 'History')}
          {sub('/portfolio', <Briefcase size={15} />, 'Portfolio & CV')}
          {sub('/settings', <Settings size={15} />, 'Settings')}
          {sub('/guide', <CircleHelp size={15} />, 'How Pilotage works')}
        </nav>
        <UsageBox />
      </div>
    </aside>
  );
}

/** The current project when on a project page (or a session of one): ＋ actions start from it. */
function useCurrentProjectId() {
  const qc = useQueryClient();
  const projectMatch = useMatch('/projects/:id');
  const sessionMatch = useMatch('/sessions/:id');
  const sid = sessionMatch?.params.id;
  return projectMatch?.params.id || (sid ? qc.getQueryData<SessionDetail>(['session', sid])?.projectId : null) || undefined;
}

/** Phone ＋: a small action sheet (New session · Add task · Capture idea). On a project page (or a session of one)
 *  it starts from that project. */
function CreateSheet({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const { openNewSession } = useApp();
  const navigate = useNavigate();
  const projectId = useCurrentProjectId();
  return (
    <Menu
      anchor={anchor}
      title="Create"
      className="create-sheet"
      onClose={onClose}
      items={[
        { key: 'session', label: 'New session', sub: projectId ? 'Start Claude in this project' : 'Start Claude in a project', icon: <SquareTerminal />, onSelect: () => openNewSession(projectId ? { projectId } : {}) },
        { key: 'task', label: 'Add task', sub: projectId ? "To this project's tasks" : 'Something you’ve decided to do', icon: <ListChecks />, onSelect: () => navigate(projectId ? `/tasks?new=1&project=${encodeURIComponent(projectId)}` : '/tasks?new=1') },
        { key: 'idea', label: 'Capture idea', sub: 'Something you might do later', icon: <Lightbulb />, onSelect: () => navigate('/ideas?new=1') },
      ]}
    />
  );
}

function BottomNav() {
  const { data: overview } = useOverview();
  const loc = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const plusRef = useRef<HTMLButtonElement>(null);
  const moreActive = ['/projects', '/ideas', '/history', '/timeline', '/portfolio', '/settings', '/guide', '/more'].some((p) => loc.pathname.startsWith(p));
  const work = overview?.work;
  const tasksOpen = work ? (work.todoCount || 0) + (work.doingCount || 0) : 0;
  const item = (to: string, icon: React.ReactNode, label: string, extra?: React.ReactNode, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
      <span className="ico">{icon}</span>
      {label}
      {extra}
    </NavLink>
  );
  return (
    <nav className="bottom-nav" aria-label="Main">
      {item('/', <Home />, 'Home', undefined, true)}
      {item('/sessions', <MessagesSquare />, 'Sessions', <SessionsBadge live={overview?.live} phone />)}
      <button ref={plusRef} type="button" className={`tab-create${createOpen ? ' active' : ''}`} onClick={() => setCreateOpen(true)} aria-label="New: session, task or idea" aria-haspopup="menu" aria-expanded={createOpen}>
        <span className="ico">
          <Plus />
        </span>
        New
      </button>
      {item('/tasks', <ListChecks />, 'Tasks', tasksOpen > 0 ? <span className="pip count-pip" aria-label={`${tasksOpen} to do or doing`}>{tasksOpen}</span> : undefined)}
      <NavLink to="/more" className={() => (moreActive ? 'active' : '')}>
        <span className="ico">
          <MoreHorizontal />
        </span>
        More
      </NavLink>
      {createOpen && <CreateSheet anchor={plusRef.current} onClose={() => setCreateOpen(false)} />}
    </nav>
  );
}

/** One page's render error stays inside the page: the sidebar and tab bar keep working, and navigating clears it. */
class PageBoundary extends React.Component<{ resetKey: string; children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    const e = this.state.error;
    if (!e) return this.props.children;
    // a lazy page chunk that is gone after a rebuild: only a reload fixes it
    const stale = /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(e.message);
    return (
      <EmptyState
        icon={<TriangleAlert />}
        title={stale ? 'Pilotage was updated' : 'This page hit a problem'}
        body={
          <>
            {stale ? 'Reload to get the new version of this page.' : 'The rest of Pilotage still works. Reloading usually fixes it.'}
            {!stale && <span className="page-crash-detail mono">{e.message}</span>}
          </>
        }
        action={
          <>
            <button className="btn primary" onClick={() => location.reload()}>
              Reload
            </button>
            <Link className="btn" to="/">
              Back to Home
            </Link>
          </>
        }
      />
    );
  }
}

// Browser toolbar / status bar color. index.html keys it on the OS scheme; a forced theme overrides both metas.
const CHROME_COLOR = { dark: '#0e1014', light: '#f6f7f9' } as const;
function applyThemeColor(theme: string) {
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const media = m.getAttribute('media') || '';
    const own = media.includes('light') ? CHROME_COLOR.light : CHROME_COLOR.dark;
    m.content = theme === 'light' || theme === 'dark' ? CHROME_COLOR[theme] : own;
  });
}

/** After a deploy, pages that were already open still run the old code. Offer a reload, and do it by itself when
 *  the page comes back to the foreground (phone unlocked, tab revisited) with nothing being typed or open. */
function UpdateNotice() {
  const { data: boot } = useBootstrap();
  const first = React.useRef<string | null>(null);
  if (boot?.build && first.current === null) first.current = boot.build;
  const updated = !!boot?.build && !!first.current && boot.build !== first.current;
  useEffect(() => {
    if (!updated) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const busy = document.querySelector('.modal, [role="dialog"]') || (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName));
      if (!busy) window.location.reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [updated]);
  if (!updated) return null;
  return (
    <div className="update-notice" role="status">
      <span>Pilotage was updated</span>
      <button className="btn sm primary" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}

export function Layout() {
  const { openNewSession, openPalette, newSession, paletteOpen } = useApp();
  const { data: boot } = useBootstrap();
  const loc = useLocation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openPalette();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPalette]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  useEffect(() => {
    const theme = boot?.settings.ui.theme || 'system';
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    applyThemeColor(theme);
  }, [boot?.settings.ui.theme]);
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <header className="topbar">
          <div className="mobile-brand">
            <img src="/icon.svg" alt="" />
            Pilotage
          </div>
          <button className="search-trigger" onClick={openPalette} aria-label="Search">
            <Search size={15} />
            <span className="label">Search or jump to…</span>
            <Kbd>Ctrl K</Kbd>
          </button>
          <div className="topbar-right">
            <button className="btn primary hide-mobile" onClick={() => openNewSession({})}>
              <Plus size={16} />
              New session
            </button>
          </div>
        </header>
        <main className="content">
          <InstallHint />
          <PageBoundary resetKey={loc.pathname}>
            <Outlet />
          </PageBoundary>
        </main>
      </div>
      <BottomNav />
      <UpdateNotice />
      {newSession && <NewSessionModal />}
      {paletteOpen && <CommandPalette />}
    </div>
  );
}
