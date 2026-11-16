// Running sessions of a project, as one compact line under the header ("1 working · <title> · Open in Claude app").
import React from 'react';
import { Link } from 'react-router-dom';
import { Smartphone } from 'lucide-react';
import type { SessionSummary } from '../../types';
import { StatusIcon } from '../ui';
import { runLabel, runState, runSummary, sortRunning } from '../session/shared';

export function RunningStrip({ sessions, onSeeAll }: { sessions: SessionSummary[]; onSeeAll: () => void }) {
  const live = sortRunning(sessions.filter((s) => s.live));
  if (!live.length) return null;
  const top = live[0];
  const st = runState(top);
  const url = top.live?.bridgeUrl;
  return (
    <div className={`pj-run st-${st}`} role="status" aria-label={`Running: ${runSummary(live)}`}>
      <StatusIcon status={st} title={runLabel(top)} />
      <div className="pj-run-text">
        <span className="pj-run-count">{runSummary(live)}</span>
        <Link to={`/sessions/${top.id}`} className="pj-run-title truncate" title={top.title}>
          {top.title}
        </Link>
      </div>
      <div className="pj-run-actions">
        {url ? (
          <a className="btn sm pj-run-open" href={url} target="_blank" rel="noreferrer">
            <Smartphone /> Open in Claude app
          </a>
        ) : (
          <Link className="btn sm ghost" to={`/sessions/${top.id}`}>
            View
          </Link>
        )}
        {live.length > 1 && (
          <button type="button" className="btn sm ghost" onClick={onSeeAll}>
            All {live.length}
          </button>
        )}
      </div>
    </div>
  );
}
