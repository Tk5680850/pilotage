// "This week": what got attention, per project, readable in five seconds. Counts come from the activity data;
// the one-line "what" comes from the work-block titles of each day of the week (same queries as the day panel).
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { CalendarRange } from 'lucide-react';
import { api } from '../../api';
import { Card, EmptyState, Meta, ProjectGlyph } from '../ui';
import { isoDay, plural, wsColor } from '../../util';
import type { BlockView } from '../../types';
import { addDays, basename, dayMonth, parseDay, score, startOfWeek, type DayMap, type TimelineProject } from './dates';

type CSSVars = React.CSSProperties & Record<`--${string}`, string>;
type DayBlocks = { day: string; blocks: (BlockView & { kind: string; title: string; project: string | null })[] };
const SHOWN = 6;

export function WeekSummary({ byDay, today, projByPath, projById }: { byDay: DayMap; today: string; projByPath: Map<string, TimelineProject>; projById: Map<string, TimelineProject> }) {
  const { days, lastWeekDays, monday } = useMemo(() => {
    const end = parseDay(today);
    const mon = startOfWeek(end);
    const n = Math.round((end.getTime() - mon.getTime()) / 86400e3) + 1;
    const days = Array.from({ length: n }, (_, i) => isoDay(addDays(mon, i).getTime()));
    const lastWeekDays = Array.from({ length: n }, (_, i) => isoDay(addDays(mon, i - 7).getTime()));
    return { days, lastWeekDays, monday: mon };
  }, [today]);

  const dayQueries = useQueries({
    queries: days.map((d) => ({ queryKey: ['day', d], queryFn: () => api<DayBlocks>(`/api/timeline/day/${d}`), staleTime: 60_000 })),
  });
  const titlesReady = dayQueries.every((q) => !q.isLoading);
  const dayData = dayQueries.map((q) => q.data);

  const sum = useMemo(() => {
    const per = new Map<string, { path: string; prompts: number; commits: number; days: number }>();
    let prompts = 0;
    let commits = 0;
    let active = 0;
    for (const d of days) {
      const a = byDay.get(d);
      if (!a) continue;
      prompts += a.prompts;
      commits += a.commits;
      if (score(a) > 0) active++;
      for (const [path, v] of Object.entries(a.projects || {})) {
        if (score(v) <= 0) continue;
        const x = per.get(path) || { path, prompts: 0, commits: 0, days: 0 };
        x.prompts += v.prompts;
        x.commits += v.commits;
        x.days++;
        per.set(path, x);
      }
    }
    const last = lastWeekDays.reduce((acc, d) => acc + (byDay.get(d)?.prompts || 0), 0);
    // what: block titles of this week per project, biggest blocks first, no repeats
    const titles = new Map<string, string[]>();
    const seen = new Set<string>();
    const blocks = dayData.flatMap((x) => x?.blocks || []).filter((b) => b.kind === 'block');
    blocks.sort((a, b) => b.prompts - a.prompts || b.endAt - a.endAt);
    for (const b of blocks) {
      const pid = b.projectId ?? b.project;
      const p = pid ? projById.get(pid) : undefined;
      if (!p || seen.has(b.key)) continue;
      seen.add(b.key);
      const title = (b.digest?.title || b.title || '').trim();
      if (!title) continue;
      const list = titles.get(p.path) || [];
      if (list.length < 3 && !list.some((t) => t.toLowerCase() === title.toLowerCase())) list.push(title);
      titles.set(p.path, list);
    }
    const rows = [...per.values()].map((x) => ({ ...x, score: score(x), p: projByPath.get(x.path), what: titles.get(x.path) || [] })).sort((a, b) => b.score - a.score);
    return { rows, prompts, commits, active, last };
  }, [byDay, days, lastWeekDays, dayData, projByPath, projById]);

  const max = Math.max(1, ...sum.rows.map((r) => r.score));
  // compared with the same days of last week (Monday up to today's weekday)
  const delta = sum.last > 0 ? Math.round(((sum.prompts - sum.last) / sum.last) * 100) : null;

  return (
    <Card
      title="This week"
      icon={<CalendarRange />}
      actions={<span className="tiny faint">since {dayMonth(monday)}</span>}
      className="tl-week"
    >
      {sum.rows.length === 0 ? (
        <EmptyState compact title="Nothing yet this week" body="Sessions and commits since Monday show up here." />
      ) : (
        <div className="tl-week-body">
          <div className="tl-week-lead">
            <span className="tl-week-num num">{sum.prompts.toLocaleString()}</span>
            <span className="muted">
              {sum.prompts === 1 ? 'prompt' : 'prompts'} across {plural(sum.rows.length, 'project')}
            </span>
            {delta !== null && delta !== 0 && (
              <span className={`tl-week-delta num ${delta > 0 ? 'up' : 'down'}`} title={`Last week by this day: ${plural(sum.last, 'prompt')}`}>
                {delta > 0 ? '↑' : '↓'} {Math.abs(delta)}% vs last week
              </span>
            )}
          </div>
          <Meta className="tl-week-meta" items={[plural(sum.commits, 'commit'), `${sum.active} of ${days.length} days active`]} />
          <div className="tl-week-rows">
            {sum.rows.slice(0, SHOWN).map((r) => {
              const name = r.p?.name || basename(r.path);
              const body = (
                <>
                  <ProjectGlyph name={name} ws={r.p?.workspace || r.path} size={22} />
                  <div className="tl-week-main">
                    <div className="tl-week-top">
                      <span className="tl-week-name truncate">{name}</span>
                      <span className="tl-week-count num">
                        {r.prompts > 0 ? plural(r.prompts, 'prompt') : ''}
                        {r.prompts > 0 && r.commits > 0 ? ' · ' : ''}
                        {r.commits > 0 ? plural(r.commits, 'commit') : ''}
                      </span>
                    </div>
                    <div className="tl-week-bar">
                      <span style={{ width: `${Math.max(3, (r.score / max) * 100)}%`, '--ws': wsColor(r.p?.workspace || r.path) } as CSSVars} />
                    </div>
                    <div className="tl-week-what clamp-1">{r.what.length ? r.what.join(' · ') : titlesReady ? (r.prompts ? `${plural(r.days, 'day')} of work` : 'Commits only') : ' '}</div>
                  </div>
                </>
              );
              return r.p ? (
                <Link key={r.path} to={`/projects/${r.p.id}`} className="tl-week-row">
                  {body}
                </Link>
              ) : (
                <div key={r.path} className="tl-week-row">
                  {body}
                </div>
              );
            })}
          </div>
          {sum.rows.length > SHOWN && <div className="tiny faint">and {plural(sum.rows.length - SHOWN, 'more project')}</div>}
        </div>
      )}
    </Card>
  );
}
