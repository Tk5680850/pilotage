// Project card (grid) and row (list) for the Projects overview.
import React from 'react';
import { Link } from 'react-router-dom';
import { Eye, GitBranch, Pin } from 'lucide-react';
import { usePatchProject } from '../../api';
import { ProjectRunning, QuietTag, projectQuietDays, useRunningByProject } from '../cards';
import type { ProjectSummary } from '../../types';
import { Button, ListRow, Meta, ProjectGlyph, Snippet, useToast, WorkStatus } from '../ui';
import { ago, fmtDateTime, plainText, plural } from '../../util';
import { errMsg } from './lib';

function GitBit({ git }: { git: NonNullable<ProjectSummary['git']> }) {
  const changes = git.dirty + git.untracked;
  const title = [`Branch ${git.branch || 'detached'}`, changes ? `${plural(changes, 'uncommitted change')}` : 'No uncommitted changes', git.ahead ? `${git.ahead} to push` : ''].filter(Boolean).join(' · ');
  return (
    <span className="pt-git" title={title}>
      <GitBranch />
      <span className="truncate">{git.branch || 'detached'}</span>
      {changes > 0 && <span className="pt-dirty" role="img" aria-label={plural(changes, 'uncommitted change')} />}
    </span>
  );
}

/** Footer: last activity · open tasks · branch, and at most one grey "Gone quiet N d" tag (it replaces the time). */
function metaItems(p: ProjectSummary, tasks: number) {
  const quiet = projectQuietDays(p);
  return [
    quiet ? null : <span title={`Last activity ${fmtDateTime(p.lastAt)}`}>{p.lastAt ? ago(p.lastAt) : 'No activity yet'}</span>,
    tasks > 0 ? <span title={`${plural(tasks, 'task')} in To do or Doing`}>{plural(tasks, 'task')}</span> : null,
    p.git ? <GitBit git={p.git} /> : null,
    quiet ? <span title={`Last activity ${fmtDateTime(p.lastAt)}`}><QuietTag days={quiet} /></span> : null,
  ];
}

/** Running wins; otherwise only the states the user set themselves (paused / done / archived). Idle and dormant are
 *  just "old", which the last-activity time already says, so they aren't labelled on every row. */
function StatusSlot({ p, showStatus }: { p: ProjectSummary; showStatus: boolean }) {
  const running = useRunningByProject();
  if (p.liveCount > 0) return <ProjectRunning p={p} counts={running} />;
  if (showStatus && (p.status === 'paused' || p.status === 'done' || p.status === 'archived')) return <WorkStatus status={p.status} />;
  return null;
}

export function ProjectTile({ p, tasks, showStatus }: { p: ProjectSummary; tasks: number; showStatus: boolean }) {
  return (
    <Link to={`/projects/${p.id}`} className="card pcard pt-card" aria-label={`${p.name}, ${p.workspaceName}`}>
      <div className="pcard-head">
        <ProjectGlyph name={p.name} ws={p.workspace} color={p.color} size={32} title={p.workspaceName} />
        <div className="grow">
          <div className="pt-name">
            <span className="title truncate">{p.name}</span>
            {p.pinned && <Pin className="pt-pin" aria-label="Pinned" />}
          </div>
          <div className="sub truncate" title={p.path}>
            {p.displayPath}
          </div>
        </div>
        <StatusSlot p={p} showStatus={showStatus} />
      </div>
      {p.oneLiner && <Snippet text={p.oneLiner} lines={2} className="desc" />}
      <Meta items={metaItems(p, tasks)} />
    </Link>
  );
}

/** `showPath` when another project has the same name (several clones share a folder name). */
export function ProjectRow({ p, tasks, showStatus, showPath }: { p: ProjectSummary; tasks: number; showStatus: boolean; showPath: boolean }) {
  return (
    <ListRow
      to={`/projects/${p.id}`}
      label={p.name}
      lead={<ProjectGlyph name={p.name} ws={p.workspace} color={p.color} size={24} title={p.workspaceName} />}
      title={p.name}
      titleExtra={p.pinned ? <Pin className="pt-pin" aria-label="Pinned" /> : undefined}
      sub={p.oneLiner ? plainText(p.oneLiner) : undefined}
      meta={<Meta items={[showPath ? <span className="truncate pt-path" title={p.path}>{p.displayPath}</span> : null, ...metaItems(p, tasks)]} />}
      trail={<StatusSlot p={p} showStatus={showStatus} />}
    />
  );
}

/** A hidden project (Projects → Hidden): opens like any row, with a one-tap way back into the lists.
 *  `showPath` when another project has the same name, like ProjectRow. */
export function HiddenProjectRow({ p, showPath }: { p: ProjectSummary; showPath: boolean }) {
  const patch = usePatchProject(p.id);
  const toast = useToast();
  return (
    <ListRow
      to={`/projects/${p.id}`}
      label={p.name}
      className="pt-hidden-row"
      lead={<ProjectGlyph name={p.name} ws={p.workspace} color={p.color} size={24} title={p.workspaceName} />}
      title={p.name}
      sub={p.oneLiner ? plainText(p.oneLiner) : undefined}
      meta={<Meta items={[p.workspaceName, showPath ? <span className="truncate pt-path" title={p.path}>{p.displayPath}</span> : null, <span title={`Last activity ${fmtDateTime(p.lastAt)}`}>{p.lastAt ? ago(p.lastAt) : 'No activity yet'}</span>]} />}
      trail={
        <Button
          size="sm"
          icon={<Eye />}
          loading={patch.isPending}
          onClick={() => patch.mutate({ hidden: false }, { onSuccess: () => toast(`“${p.name}” is back in your lists`), onError: (e) => toast(errMsg(e), true) })}
        >
          Show again
        </Button>
      }
    />
  );
}
