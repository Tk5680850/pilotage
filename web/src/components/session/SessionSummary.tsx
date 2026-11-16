// Summary of a session, one card: the AI summaries (latest part of the session first), then Claude's own recap
// as a disclosure inside the same card. Each open next step shows whether it is already a task; the whole
// session can be spun off into a new project.
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, CornerDownRight, ListPlus, Split } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, useInvalidate } from '../../api';
import { Button, ClampText, Disclosure, Meta, StatusIcon, useToast } from '../ui';
import { ago, fmtDate, fmtDateTime, plural } from '../../util';
import type { BlockView, SessionDetail } from '../../types';
import type { WorkItem, WorkList } from '../../types-extra';
import { clipWords } from './shared';

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const WORK_LABEL: Record<string, string> = { inbox: 'Suggested', todo: 'To do', doing: 'Doing', done: 'Done', dropped: 'Dropped' };

function blockRange(b: BlockView) {
  const a = fmtDate(b.startAt);
  const z = fmtDate(b.endAt);
  return a === z ? a : `${a} → ${z}`;
}

function NextStep({ s, b, existing }: { s: SessionDetail; b: BlockView; existing: WorkItem | undefined }) {
  const d = b.digest!;
  const toast = useToast();
  const inv = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<WorkItem | null>(null);
  const item = added || existing;
  const add = () => {
    if (!s.projectId) return;
    setBusy(true);
    const title = clipWords(d.nextStep, 190);
    api<WorkItem>('/api/work', {
      method: 'POST',
      body: { projectId: s.projectId, title, detail: `${title !== d.nextStep ? `${d.nextStep}\n\n` : ''}From “${d.title || b.fallbackTitle}” in the session “${s.title}”.`, sessionId: s.id },
    })
      .then((w) => {
        setAdded(w);
        toast(`Added to ${s.projectName || 'project'} tasks`);
        inv('work', 'overview', 'project');
      })
      .catch((e) => toast(e.message, true))
      .finally(() => setBusy(false));
  };
  return (
    <div className="sx-next">
      <div className="next-step">
        <CornerDownRight size={13} />
        <span className="break">{d.nextStep}</span>
      </div>
      {s.projectId &&
        (item ? (
          <span className="sx-intasks" title={item.title}>
            <Check size={13} /> {item.status === 'done' || item.status === 'dropped' ? `Task ${WORK_LABEL[item.status].toLowerCase()}` : `In Tasks · ${WORK_LABEL[item.status] || item.status}`}
          </span>
        ) : (
          <Button size="sm" variant="ghost" icon={<ListPlus />} loading={busy} onClick={add} title="Add this next step to the project's tasks">
            Add as task
          </Button>
        ))}
    </div>
  );
}

function BlockDigest({ s, b, existing, live }: { s: SessionDetail; b: BlockView; existing: WorkItem | undefined; live: boolean }) {
  const d = b.digest!;
  const open = d.status !== 'done' && d.status !== 'abandoned';
  return (
    <div className="sx-block">
      <div className="sx-block-lead">
        <StatusIcon status={live ? 'idle_live' : d.status} title={live ? 'Session is running' : undefined} />
      </div>
      <div className="sx-block-body">
        <div className="sx-block-title">{d.title || b.fallbackTitle}</div>
        <Meta items={[<span title={`${fmtDateTime(b.startAt)} → ${fmtDateTime(b.endAt)}`}>{blockRange(b)}</span>, b.prompts > 0 ? plural(b.prompts, 'prompt') : null, d.topic || null]} />
        {(d.outcome || d.summary) && (
          <ClampText lines={2} className="sx-block-text">
            {d.outcome || d.summary}
          </ClampText>
        )}
        {d.nextStep && open && <NextStep s={s} b={b} existing={existing} />}
      </div>
    </div>
  );
}

export function SessionSummary({ s, collapsible }: { s: SessionDetail; collapsible: boolean }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(!collapsible);
  const [all, setAll] = useState(false);
  const pid = s.projectId;
  const { data: work } = useQuery({ queryKey: ['work', `project=${pid}&status=all`], queryFn: () => api<WorkList>(`/api/work?project=${pid}&status=all`), enabled: !!pid, staleTime: 30_000 });
  const digests = useMemo(() => [...s.blocksDetail].reverse().filter((b) => b.digest), [s.blocksDetail]);
  const undigested = s.blocksDetail.length - digests.length;

  // A task already made from a block (by the AI extractor or by hand) is shown instead of the button.
  const findTask = (b: BlockView) => {
    const items = (work?.items || []).filter((w) => w.source?.sessionId === s.id || w.source?.blockKey === b.key);
    const want = norm(clipWords(b.digest?.nextStep || '', 190));
    return items.find((w) => w.source?.blockKey === b.key) || items.find((w) => norm(w.title) === want || norm(w.detail || '').startsWith(want));
  };

  const shown = all ? digests : digests.slice(0, 4);
  const spin = s.projectId ? (
    <Button size="sm" variant="ghost" icon={<Split />} onClick={() => navigate(`/projects/${s.projectId}?spinoff=1&session=${encodeURIComponent(s.id)}`)} title="Start a new project from this session's work">
      Spin off into a new project…
    </Button>
  ) : null;

  const recap = s.recap ? (
    <Disclosure
      className="sx-recap-d"
      defaultOpen={!digests.length}
      summary={
        <span title={fmtDateTime(s.recapAt)}>
          Claude’s own recap <span className="faint">· {ago(s.recapAt)}</span>
        </span>
      }
    >
      <ClampText lines={6} className="sx-recap-text">
        {s.recap}
      </ClampText>
    </Disclosure>
  ) : null;

  const body = (
    <div className="sx-summary-body">
      {digests.length > 0 ? (
        <div className="sx-blocks">
          {shown.map((b) => (
            <BlockDigest key={b.key} s={s} b={b} existing={findTask(b)} live={!!s.live && b.key === s.blocksDetail[s.blocksDetail.length - 1]?.key} />
          ))}
        </div>
      ) : (
        <div className="small faint sx-nosum">{s.blocksDetail.length ? 'The AI hasn’t summarized this session yet. It does this in the background.' : 'Nothing to summarize yet.'}</div>
      )}
      {(digests.length > 4 || (undigested > 0 && digests.length > 0)) && (
        <div className="sx-summary-foot">
          {digests.length > 4 && (
            <button type="button" className="more-link" onClick={() => setAll(!all)}>
              {all ? 'Show fewer' : `Show ${plural(digests.length - 4, 'earlier part')}`}
            </button>
          )}
          {undigested > 0 && digests.length > 0 && <span className="tiny faint">The latest work isn’t summarized yet</span>}
        </div>
      )}
      {recap}
      {collapsible && spin && <div className="sx-summary-spin">{spin}</div>}
    </div>
  );

  if (collapsible)
    return (
      <div className="card sx-summary">
        <button type="button" className="sx-summary-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <ChevronRight size={16} className="sx-chev" />
          <span className="sx-summary-h">Summary</span>
          <span className="tiny faint truncate">{digests[0] ? digests[0].digest!.title || digests[0].fallbackTitle : s.recap ? 'Claude’s own recap' : ''}</span>
        </button>
        {open && body}
      </div>
    );

  return (
    <div className="card sx-summary">
      <div className="card-head">
        <h2>Summary</h2>
        {spin}
      </div>
      {body}
    </div>
  );
}
