// History rail: prompts per week (last 8 weeks) and where the last 30 days went, by project.
// This week's total lives in the "This week" card only (no second copy of the same number here).
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, MiniBars, ProjectGlyph } from '../ui';
import { isoDay, plural, wsColor } from '../../util';
import type { DayActivity } from '../../types';
import { addDays, basename, dayMonth, parseDay, score, shiftDay, startOfWeek, type DayMap, type TimelineProject } from './dates';

type CSSVars = React.CSSProperties & Record<`--${string}`, string>;

export function WeeksCard({ byDay, today }: { byDay: DayMap; today: string }) {
  const weeks = useMemo(() => {
    const end = parseDay(today);
    const thisWeek = startOfWeek(end);
    const out: { start: Date; prompts: number; commits: number; current: boolean }[] = [];
    for (let i = 7; i >= 0; i--) {
      const start = addDays(thisWeek, -7 * i);
      let prompts = 0;
      let commits = 0;
      for (let d = 0; d < 7; d++) {
        const a = byDay.get(isoDay(addDays(start, d).getTime()));
        if (!a) continue;
        prompts += a.prompts;
        commits += a.commits;
      }
      out.push({ start, prompts, commits, current: i === 0 });
    }
    return out;
  }, [byDay, today]);
  const avg = Math.round(weeks.slice(0, -1).reduce((a, w) => a + w.prompts, 0) / 7);
  return (
    <Card title="Prompts per week" actions={<span className="tiny faint">last 8 weeks</span>}>
      <div className="stack-lg">
        <div className="tl-weeks">
          <MiniBars data={weeks.map((w) => w.prompts)} titles={weeks.map((w) => `Week of ${dayMonth(w.start)}: ${plural(w.prompts, 'prompt')}, ${plural(w.commits, 'commit')}`)} height={56} />
          <div className="tl-weeks-labels" aria-hidden="true">
            {weeks.map((w, i) => (
              <span key={w.start.getTime()} className={w.current ? 'cur' : ''}>
                {w.current ? 'Now' : i === 0 || w.start.getMonth() !== weeks[i - 1].start.getMonth() ? dayMonth(w.start) : w.start.getDate()}
              </span>
            ))}
          </div>
        </div>
        <div className="tiny faint">Before this week: {plural(avg, 'prompt')} a week on average.</div>
      </div>
    </Card>
  );
}

export function ProjectsMonthCard({ days, projByPath, today }: { days: DayActivity[]; projByPath: Map<string, TimelineProject>; today: string }) {
  const { rows, workspaces, total, more } = useMemo(() => {
    const since = shiftDay(today, -29);
    const agg = new Map<string, { prompts: number; commits: number }>();
    for (const d of days) {
      if (d.day < since || d.day > today) continue;
      for (const [path, v] of Object.entries(d.projects || {})) {
        const a = agg.get(path) || { prompts: 0, commits: 0 };
        a.prompts += v.prompts;
        a.commits += v.commits;
        agg.set(path, a);
      }
    }
    const all = [...agg.entries()]
      .map(([path, v]) => ({ path, p: projByPath.get(path), ...v, score: score(v) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const ws = new Map<string, { key: string; name: string; score: number }>();
    for (const x of all) {
      const key = x.p?.workspace || x.path;
      const w = ws.get(key) || { key, name: x.p?.workspaceName || basename(x.path), score: 0 };
      w.score += x.score;
      ws.set(key, w);
    }
    return { rows: all.slice(0, 8), more: Math.max(0, all.length - 8), workspaces: [...ws.values()].sort((a, b) => b.score - a.score), total: all.reduce((a, x) => a + x.score, 0) };
  }, [days, projByPath, today]);
  const max = Math.max(1, ...rows.map((r) => r.score));
  const pct = (n: number) => Math.round((n / (total || 1)) * 100);

  return (
    <Card title="Last 30 days by project">
      {rows.length === 0 ? (
        <div className="small faint">No project activity in the last 30 days.</div>
      ) : (
        <div className="stack-lg">
          <div className="stack">
            <div className="tl-wsbar" role="img" aria-label={`Share by workspace: ${workspaces.map((w) => `${w.name} ${pct(w.score)}%`).join(', ')}`}>
              {workspaces.map((w) => (
                <span key={w.key} style={{ flexGrow: w.score, '--ws': wsColor(w.key) } as CSSVars} title={`${w.name}: ${pct(w.score)}%`} />
              ))}
            </div>
            <div className="tl-wslegend">
              {workspaces.slice(0, 5).map((w) => (
                <span key={w.key}>
                  <ProjectGlyph name={w.name} ws={w.key} size={14} />
                  {w.name}
                  <span className="num faint">{pct(w.score)}%</span>
                </span>
              ))}
            </div>
          </div>
          <div className="tl-prows">
            {rows.map((r) => {
              const name = r.p?.name || basename(r.path);
              const label = (
                <>
                  <ProjectGlyph name={name} ws={r.p?.workspace || r.path} size={16} />
                  <span className="truncate">{name}</span>
                </>
              );
              return (
                <div key={r.path} className="tl-prow">
                  <div className="tl-prow-top">
                    {r.p ? (
                      <Link to={`/projects/${r.p.id}`} className="tl-prow-name" title={r.path}>
                        {label}
                      </Link>
                    ) : (
                      <span className="tl-prow-name" title={r.path}>
                        {label}
                      </span>
                    )}
                    <span className="tiny faint num tl-prow-count">{[r.prompts > 0 && plural(r.prompts, 'prompt'), r.commits > 0 && plural(r.commits, 'commit')].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="tl-pbar">
                    <span style={{ width: `${Math.max(2, (r.score / max) * 100)}%`, '--ws': wsColor(r.p?.workspace || r.path) } as CSSVars} />
                  </div>
                </div>
              );
            })}
          </div>
          {more > 0 && <div className="tiny faint">And {plural(more, 'more project')}.</div>}
        </div>
      )}
    </Card>
  );
}
