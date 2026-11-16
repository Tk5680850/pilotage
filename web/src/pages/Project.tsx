// Project detail: header, running strip, tabs Overview · Tasks · Sessions · Notes (docs/SIMPLIFY.md §7).
// `?tab=` picks the tab (old values still work: threads → overview, worktrees → sessions, docs/notes → notes, board → tasks).
// `?workstream=<name>` opens that workstream on the Overview (linked from the Session page).
// `?spinoff=1[&thread=<name>|&session=<id>]` opens the spin-off dialog (linked from the Session page).
import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { FolderX } from 'lucide-react';
import { ApiError, useProject } from '../api';
import { useWork } from '../api-extra';
import { Button, Callout, Card, EmptyState, LoadingCard, Section, Skeleton, Tabs } from '../components/ui';
import { ProjectHeader } from '../components/project/ProjectHeader';
import { EditProjectDialog } from '../components/project/EditProjectDialog';
import { SpinoffDialog } from '../components/project/SpinoffDialog';
import { OverviewTab } from '../components/project/OverviewTab';
import { TasksTab } from '../components/project/TasksTab';
import { SessionsTab } from '../components/project/SessionsTab';
import { DocsTab } from '../components/project/DocsTab';
import { NotesTab } from '../components/project/NotesTab';
import { RunningStrip } from '../components/project/RunningStrip';
import { errMsg, isOpen, useIsPhone } from '../components/project/lib';
import './Project.css';

type Tab = 'overview' | 'tasks' | 'sessions' | 'notes';
const TABS: Tab[] = ['overview', 'tasks', 'sessions', 'notes'];
const OLD_TABS: Record<string, Tab> = { threads: 'overview', board: 'tasks', worktrees: 'sessions', docs: 'notes' };

function HeaderSkeleton() {
  return (
    <div className="stack-lg" aria-busy="true" aria-label="Loading project">
      <Skeleton h={13} w={160} />
      <div className="row pj-skel-head">
        <Skeleton h={40} w={40} />
        <div className="grow stack">
          <Skeleton h={24} w="35%" />
          <Skeleton h={14} w="60%" />
        </div>
      </div>
      <Skeleton h={1} />
      <div className="grid-main">
        <div className="stack-lg">
          <LoadingCard lines={5} />
          <LoadingCard lines={3} />
        </div>
        <div className="stack-lg hide-mobile">
          <LoadingCard lines={4} />
        </div>
      </div>
    </div>
  );
}

/** Phone: the tab row scrolls sideways; fade the edge that has more tabs behind it. */
function useScrollFade(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('.tabs');
    if (!el) return;
    const on = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.classList.toggle('fade-r', max > 2 && el.scrollLeft < max - 2);
      el.classList.toggle('fade-l', max > 2 && el.scrollLeft > 2);
    };
    on();
    el.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    // keep the current tab in view (deep links to the last tab)
    el.querySelector<HTMLElement>('button.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return () => {
      el.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
    };
  }, [dep]);
  return ref;
}

export default function Project() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const phone = useIsPhone();
  const tabParam = params.get('tab');
  const tab: Tab = tabParam && TABS.includes(tabParam as Tab) ? (tabParam as Tab) : (tabParam && OLD_TABS[tabParam]) || 'overview';
  const { data: p, error, isLoading, refetch } = useProject(id);
  const { data: work } = useWork({ project: id });
  const [editing, setEditing] = useState(false);
  const [spinoff, setSpinoff] = useState<{ thread?: string | null; session?: string | null } | null>(null);
  // remembered from the first render: old ?tab=worktrees links open the Worktrees disclosure
  const [wantWorktrees] = useState(tabParam === 'worktrees');
  const tabsRef = useScrollFade(`${!!p}:${tab}`);

  // Deep link from the Session page: open the spin-off dialog once, then clean the URL.
  useEffect(() => {
    if (params.get('spinoff') !== '1') return;
    setSpinoff({ thread: params.get('thread'), session: params.get('session') });
    const n = new URLSearchParams(params);
    n.delete('spinoff');
    n.delete('thread');
    n.delete('session');
    setParams(n, { replace: true });
  }, [params, setParams]);

  // Old tab names in the URL become the new ones (so the address bar matches what's shown).
  useEffect(() => {
    if (!tabParam || TABS.includes(tabParam as Tab)) return;
    const n = new URLSearchParams(params);
    if (tab === 'overview') n.delete('tab');
    else n.set('tab', tab);
    setParams(n, { replace: true });
  }, [tabParam]);

  const go = (t: Tab) => {
    const n = new URLSearchParams(params);
    n.delete('doc');
    n.delete('workstream');
    if (t === 'overview') n.delete('tab');
    else n.set('tab', t);
    setParams(n, { replace: true });
  };
  const goAndScroll = (t: Tab) => {
    go(t);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (isLoading) return <HeaderSkeleton />;
  if (error || !p) {
    const notFound = (error instanceof ApiError && error.status === 404) || !error;
    return (
      <Card>
        {notFound ? (
          <EmptyState
            icon={<FolderX />}
            title="Project not found"
            body="It may have been moved or renamed on disk. Hidden projects are listed under Projects → Hidden."
            action={
              <>
                <Link className="btn" to="/projects">
                  Back to projects
                </Link>
                <Link className="btn ghost" to="/projects?f=hidden">
                  Hidden projects
                </Link>
              </>
            }
          />
        ) : (
          <div className="card-body">
            <Callout tone="danger" title="Couldn’t load this project" action={<Button size="sm" onClick={() => refetch()}>Try again</Button>}>
              {errMsg(error)}
            </Callout>
          </div>
        )}
      </Card>
    );
  }

  const openTasks = (work?.items || []).filter((i) => isOpen(i.status) && i.status !== 'inbox').length;
  const notesCount = p.docs.length + p.links.length;
  const withYou = p.sessions.filter((s) => s.kind === 'interactive').length;
  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'tasks', label: 'Tasks', count: work && openTasks ? openTasks : undefined },
    // "with you" only, like the Sessions tab's default view (automations can run into the hundreds)
    { value: 'sessions', label: 'Sessions', count: withYou || undefined },
    { value: 'notes', label: 'Notes', count: notesCount || undefined },
  ];
  const readingDoc = phone && !!params.get('doc');
  return (
    <>
      <ProjectHeader p={p} onEdit={() => setEditing(true)} onSpinoff={() => setSpinoff({})}>
        <div ref={tabsRef} className="pj-tabs-wrap">
          <Tabs value={tab} onChange={go} items={tabs} className="pj-tabs" />
        </div>
      </ProjectHeader>
      {tab !== 'sessions' && <RunningStrip sessions={p.sessions} onSeeAll={() => goAndScroll('sessions')} />}
      <div role="tabpanel" aria-label={tabs.find((t) => t.value === tab)?.label} className="pj-panel">
        {tab === 'overview' && <OverviewTab p={p} go={goAndScroll} onSpinoff={(thread) => setSpinoff({ thread })} focusWorkstream={params.get('workstream')} />}
        {tab === 'tasks' && <TasksTab p={p} />}
        {tab === 'sessions' && <SessionsTab p={p} openWorktrees={wantWorktrees} />}
        {tab === 'notes' &&
          (readingDoc ? (
            <DocsTab p={p} />
          ) : (
            <div className="stack-xl">
              <NotesTab p={p} />
              <Section title="Docs" count={p.docs.length || undefined}>
                <DocsTab p={p} />
              </Section>
            </div>
          ))}
      </div>
      {editing && <EditProjectDialog p={p} onClose={() => setEditing(false)} />}
      {spinoff && <SpinoffDialog p={p} thread={spinoff.thread} session={spinoff.session} onClose={() => setSpinoff(null)} />}
    </>
  );
}
