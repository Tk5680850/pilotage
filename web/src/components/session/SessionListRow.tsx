// One session in a list (Sessions page, project Sessions tab, project Overview).
// Lead = run state or AI status glyph; title (+ Codex/Gemini tag); one line of summary; quiet meta; time on the right.
import React from 'react';
import { Link } from 'react-router-dom';
import { Archive, Bot, GitBranch } from 'lucide-react';
import type { SessionSummary } from '../../types';
import { Dot, Meta, ProjectGlyph, Snippet, StatusIcon, statusInfo } from '../ui';
import { ago, fmtDate, fmtDateTime, fmtTime, plural, shortModel } from '../../util';
import { HarnessTag } from './LiveRows';
import { runLabel, runState } from './shared';
import './live.css';

function Lead({ s }: { s: SessionSummary }) {
  if (s.live) return <StatusIcon status={runState(s)} title={runLabel(s)} />;
  // the AI summary's status says how the work stood back then, not that anything is running (always grey/green/amber)
  if (s.digest) return <StatusIcon status={s.digest.status} title={`Summary: ${statusInfo(s.digest.status).label.toLowerCase()}`} />;
  if (s.kind === 'automation') return <Bot size={14} className="faint" aria-label="Automation" />;
  if (s.kind === 'archived') return <Archive size={14} className="faint" aria-label="Archived" />;
  return <Dot />;
}

/** Hide the branch when it's the usual one (main / master / the repo default): it would repeat on every row. */
const USUAL = new Set(['main', 'master']);

export function SessionListRow({
  s,
  showProject = true,
  showBranch = false,
  defaultBranch,
  when = 'ago',
}: {
  s: SessionSummary;
  showProject?: boolean;
  /** Branch / worktree on every row (project Sessions tab). The worktree name always shows. */
  showBranch?: boolean;
  defaultBranch?: string | null;
  /** Trailing time: relative, clock time (Today / Yesterday buckets) or date (older buckets). */
  when?: 'ago' | 'time' | 'date';
}) {
  const text = s.match || s.digest?.summary || s.lastPrompt;
  const branch = !s.worktree && showBranch && s.branch && !USUAL.has(s.branch) && s.branch !== defaultBranch ? s.branch : null;
  const trail = when === 'time' ? fmtTime(s.lastAt) : when === 'date' ? fmtDate(s.lastAt) : ago(s.lastAt);
  return (
    <div className="lrow clickable sx-lrow">
      <Link to={`/sessions/${s.id}`} className="lrow-link" aria-label={s.title} />
      <div className="lrow-lead">
        <Lead s={s} />
      </div>
      <div className="lrow-body">
        <div className="lrow-title">
          <span className="t">{s.title}</span>
          <HarnessTag s={s} />
        </div>
        {text && <Snippet text={text} lines={s.match ? 2 : 1} className="lrow-sub" />}
        <Meta
          items={[
            showProject && s.projectName ? (
              <span className="sx-proj-meta">
                {s.workspace && <ProjectGlyph name={s.projectName} ws={s.workspace} size={14} />}
                <span className="truncate">{s.projectName}</span>
              </span>
            ) : null,
            s.worktree ? (
              <span className="sx-branch" title={`Worktree ${s.worktree}${s.branch ? ` · branch ${s.branch}` : ''}`}>
                <GitBranch aria-hidden="true" />
                <span className="truncate">{s.worktree}</span>
              </span>
            ) : branch ? (
              <span className="sx-branch" title={`Branch ${branch}`}>
                <GitBranch aria-hidden="true" />
                <span className="truncate">{branch}</span>
              </span>
            ) : null,
            s.humanPrompts > 0 ? plural(s.humanPrompts, 'prompt') : null,
            s.model ? shortModel(s.model) : null,
            s.kind === 'automation' ? <span title={`Scheduled or headless run${s.automation ? ` (${s.automation})` : ''}`}>Automation</span> : null,
            s.kind === 'archived' ? <span title="Transcript removed by Claude Code, your prompts kept">Archived</span> : null,
          ]}
        />
      </div>
      <div className="lrow-trail">
        {s.live ? (
          <span className={`live-word st-word-${runState(s)}`}>{runLabel(s)}</span>
        ) : (
          <span className="num" title={fmtDateTime(s.lastAt)}>
            {trail}
          </span>
        )}
      </div>
    </div>
  );
}
