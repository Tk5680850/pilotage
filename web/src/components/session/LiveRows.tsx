// Running sessions (moved here from the old Live page): one row per running session with its actions
// (Open in Claude app · View · Attach on PC · Stop), the Needs you / Working / Open groups, and the
// "Started from Pilotage" launches. Used by Sessions and the project page.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Cloud, Monitor, Smartphone, Square } from 'lucide-react';
import { api, useInvalidate, useWsl } from '../../api';
import { Button, Card, Disclosure, IconButton, Meta, ProjectGlyph, Section, Snippet, Spinner, StatusIcon, Tooltip, useToast } from '../ui';
import type { Launch, SessionSummary } from '../../types';
import { ago, fmtDateTime } from '../../util';
import { HARNESS_LABEL, RUN_LABEL, errText, harnessOf, runLabel, runState, sortRunning, type RunState } from './shared';
import './live.css';

export function HarnessTag({ s }: { s: Pick<SessionSummary, 'harness'> }) {
  const h = harnessOf(s);
  if (h === 'claude') return null;
  return <span className="sx-harness">{HARNESS_LABEL[h]}</span>;
}

export function LiveSessionRow({ s, showProject = true }: { s: SessionSummary; showProject?: boolean }) {
  const toast = useToast();
  const inv = useInvalidate();
  const l = s.live!;
  const st = runState(s);
  const bg = l.kind === 'background';
  const text = l.detail || s.lastPrompt;
  const stop = () => {
    if (!confirm(`Stop “${s.title}”? The conversation is kept and can be resumed later.`)) return;
    api(`/api/sessions/${s.id}/stop`, { method: 'POST' })
      .then(() => {
        toast('Stopped');
        inv('live', 'overview', 'project');
      })
      .catch((e) => toast(errText(e), true));
  };
  const wsl = useWsl();
  const attach = () =>
    api(`/api/sessions/${s.id}/attach`, { method: 'POST' })
      .then(() => toast('Opened in Windows Terminal'))
      .catch((e) => toast(errText(e), true));
  return (
    <div className={`lrow clickable live-srow st-${st}`}>
      <Link to={`/sessions/${s.id}`} className="lrow-link" aria-label={`${s.title} (${runLabel(s)})`} />
      <div className="lrow-lead">
        <StatusIcon status={st} title={runLabel(s)} />
      </div>
      <div className="lrow-body">
        <div className="lrow-title">
          <span className="t">{s.title}</span>
          <HarnessTag s={s} />
        </div>
        {text && <Snippet text={text} lines={st === 'needs-you' ? 2 : 1} quote={!l.detail} className="lrow-sub" />}
        <Meta
          items={[
            showProject ? (
              <span className="sx-proj-meta">
                {s.workspace && <ProjectGlyph name={s.projectName || s.cwd} ws={s.workspace} size={14} />}
                <span className="truncate">{s.projectName || s.cwd.split('/').pop()}</span>
              </span>
            ) : null,
            <span className="mi" title={bg ? 'Runs in the background on your PC, no window' : 'Runs in a Windows Terminal tab on your PC'}>
              {bg ? <Cloud /> : <Monitor />}
              {bg ? 'Background' : 'Terminal'}
            </span>,
            s.worktree ? <span className="truncate live-branch" title={`Worktree ${s.worktree}`}>{s.worktree}</span> : s.branch ? <span className="truncate live-branch" title={`Branch ${s.branch}`}>{s.branch}</span> : null,
            <span title={`Last activity ${fmtDateTime(s.lastAt)}`}>{ago(s.lastAt)}</span>,
          ]}
        />
      </div>
      <div className="live-srow-actions">
        {l.bridgeUrl ? (
          <a className="btn sm live-open" href={l.bridgeUrl} target="_blank" rel="noreferrer">
            <Smartphone /> Open in Claude app
          </a>
        ) : (
          <span className="tiny faint live-nolink" title="This session was started without Remote Control, so the Claude app can’t open it">
            No app link
          </span>
        )}
        <Link className="btn sm ghost live-view" to={`/sessions/${s.id}`}>
          View
        </Link>
        {bg && l.bgId && (
          <>
            {wsl && (
              <Tooltip label="Bring it into a Windows Terminal tab">
                <Button size="sm" variant="ghost" icon={<Monitor />} className="hide-mobile" onClick={attach}>
                  Attach on PC
                </Button>
              </Tooltip>
            )}
            <IconButton icon={<Square />} label="Stop this background session" className="live-stop" onClick={stop} />
          </>
        )}
      </div>
    </div>
  );
}

export function LaunchRow({ l }: { l: Launch }) {
  const ready = !!l.bridgeUrl;
  const failed = l.state === 'error';
  const project = l.cwd.split('/').filter(Boolean).pop() || l.cwd;
  return (
    <div className={`lrow launch-row${l.sessionId ? ' clickable' : ''}`}>
      {l.sessionId && <Link to={`/sessions/${l.sessionId}`} className="lrow-link" aria-label={l.name} />}
      <div className="lrow-lead">{failed ? <StatusIcon status="error" title="Didn’t start" /> : ready ? <CheckCircle2 size={15} className="faint" aria-label="Running" /> : <Spinner size={14} />}</div>
      <div className="lrow-body">
        <div className="lrow-title">
          <span className="t">{l.name}</span>
        </div>
        {failed ? (
          <Snippet text={`Didn’t start: ${errText(new Error(l.error || ''))}`} className="lrow-sub tone-red" />
        ) : !ready ? (
          <div className="lrow-sub">{l.note || l.detail || 'Starting… waiting for Claude to connect.'}</div>
        ) : null}
        <Meta
          items={[
            <span className="mi">
              {l.mode === 'background' ? <Cloud /> : <Monitor />}
              {l.mode === 'background' ? 'Background' : 'Terminal'}
            </span>,
            <span title={l.cwd}>{project}</span>,
            <span title={fmtDateTime(l.createdAt)}>started {ago(l.createdAt)}</span>,
          ]}
        />
      </div>
      {ready && (
        <div className="live-srow-actions">
          <a className="btn sm live-open" href={l.bridgeUrl!} target="_blank" rel="noreferrer">
            <Smartphone /> Open in Claude app
          </a>
        </div>
      )}
    </div>
  );
}

const GROUPS: RunState[] = ['needs-you', 'working', 'idle_live'];

/** Needs you (amber) · Working · Open (idle, folded to `foldOpen` + "Show N more"). Each group only when non-empty. */
export function RunningGroups({ live, showProject = true, foldOpen = 3 }: { live: SessionSummary[]; showProject?: boolean; foldOpen?: number }) {
  const [allOpen, setAllOpen] = useState(false);
  const list = sortRunning(live);
  return (
    <>
      {GROUPS.map((g) => {
        const items = list.filter((s) => runState(s) === g);
        if (!items.length) return null;
        const folded = g === 'idle_live' && !allOpen && items.length > foldOpen + 1;
        const shown = folded ? items.slice(0, foldOpen) : items;
        return (
          <Section key={g} title={<span className="sx-group-title"><StatusIcon status={g} />{RUN_LABEL[g]}</span>} count={items.length}>
            <Card flush className={`live-group live-${g}`}>
              {shown.map((s) => (
                <LiveSessionRow key={s.id} s={s} showProject={showProject} />
              ))}
              {g === 'idle_live' && items.length > foldOpen + 1 && (
                <button type="button" className="live-fold" onClick={() => setAllOpen(!allOpen)} aria-expanded={allOpen}>
                  {allOpen ? 'Show fewer' : `Show ${items.length - foldOpen} more open`}
                </button>
              )}
            </Card>
          </Section>
        );
      })}
    </>
  );
}

/** Recent launches from Pilotage, as a small folded section (open while one is still starting). */
export function LaunchesSection({ launches, max = 6 }: { launches: Launch[]; max?: number }) {
  const list = [...launches].sort((a, b) => b.createdAt - a.createdAt).slice(0, max);
  if (!list.length) return null;
  const starting = list.some((l) => !l.bridgeUrl && l.state !== 'error' && Date.now() - l.createdAt < 10 * 60e3);
  return (
    <Disclosure
      className="sx-launches"
      defaultOpen={starting}
      summary={
        <>
          Started from Pilotage <span className="faint num">{list.length}</span>
          {starting && <Spinner size={12} />}
        </>
      }
    >
      <Card flush>
        {list.map((l) => (
          <LaunchRow key={l.id} l={l} />
        ))}
      </Card>
    </Disclosure>
  );
}
