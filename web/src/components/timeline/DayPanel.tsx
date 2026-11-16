// The selected day: counts, a project split bar, the work that started that day in time order (24-hour times in
// their own column), then work that started earlier and carried on into the day (labelled as such), and automation
// runs folded away. The list under "Today" only shows today's work.
import React from 'react';
import { Link } from 'react-router-dom';
import { Bot, CalendarDays, ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react';
import { useDay } from '../../api';
import { BlockRow } from '../cards';
import { Button, Disclosure, EmptyState, IconButton, ListRow, Meta, ProjectGlyph, Skeleton } from '../ui';
import { fmtDate, fmtDay, fmtTime, plural, wsColor } from '../../util';
import type { BlockView, DayActivity } from '../../types';
import { basename, parseDay, score, shiftDay, type TimelineProject } from './dates';
import { useMedia } from '../session/shared';

type DayBlock = BlockView & { kind: string; title: string; project: string | null };
type CSSVars = React.CSSProperties & Record<`--${string}`, string>;

function SplitBar({ act, projByPath }: { act: DayActivity | undefined; projByPath: Map<string, TimelineProject> }) {
  const rows = Object.entries(act?.projects || {})
    .map(([path, v]) => ({ path, p: projByPath.get(path), ...v, score: score(v) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!rows.length) return null;
  const total = rows.reduce((a, r) => a + r.score, 0);
  return (
    <div className="tl-split">
      <div className="tl-split-bar" role="img" aria-label={`Split by project: ${rows.map((r) => `${r.p?.name || basename(r.path)} ${Math.round((r.score / total) * 100)}%`).join(', ')}`}>
        {rows.map((r) => (
          <span key={r.path} style={{ flexGrow: r.score, '--ws': wsColor(r.p?.workspace || r.path) } as CSSVars} title={`${r.p?.name || basename(r.path)}: ${plural(r.prompts, 'prompt')}, ${plural(r.commits, 'commit')}`} />
        ))}
      </div>
      <div className="tl-split-legend">
        {rows.slice(0, 6).map((r) => {
          const name = r.p?.name || basename(r.path);
          const inner = (
            <>
              <ProjectGlyph name={name} ws={r.p?.workspace || r.path} size={14} />
              <span className="truncate">{name}</span>
              <span className="num faint">{r.prompts ? r.prompts : plural(r.commits, 'commit')}</span>
            </>
          );
          return r.p ? (
            <Link key={r.path} to={`/projects/${r.p.id}`} className="tl-split-item" title={`${name}: ${plural(r.prompts, 'prompt')}, ${plural(r.commits, 'commit')}`}>
              {inner}
            </Link>
          ) : (
            <span key={r.path} className="tl-split-item">
              {inner}
            </span>
          );
        })}
        {rows.length > 6 && <span className="tl-split-item faint">+{rows.length - 6} more</span>}
      </div>
    </div>
  );
}

export function DayPanel({ day, today, act, onSelect, projByPath, projById }: { day: string; today: string; act: DayActivity | undefined; onSelect: (d: string) => void; projByPath: Map<string, TimelineProject>; projById: Map<string, TimelineProject> }) {
  const { data, isLoading, error, refetch } = useDay(day);
  const phone = useMedia();
  const dayStart = parseDay(day).getTime();
  const blocks = (data?.blocks || []) as DayBlock[];
  const work = blocks.filter((b) => b.kind !== 'automation' && b.startAt >= dayStart);
  // started on an earlier day and continued into this one
  const carried = blocks.filter((b) => b.kind !== 'automation' && b.startAt < dayStart).sort((a, b) => b.endAt - a.endAt);
  const autos = blocks.filter((b) => b.kind === 'automation');
  const when = (t: number) => (t < dayStart ? fmtDate(t) : fmtTime(t));
  const isToday = day === today;

  return (
    <div className="card tl-day">
      <div className="tl-day-head">
        <div className="tl-day-title">
          <h2 title={fmtDate(dayStart, { day: 'numeric', month: 'long', year: 'numeric' })}>{fmtDay(dayStart)}</h2>
          <Meta items={[plural(act?.prompts || 0, 'prompt'), plural(act?.commits || 0, 'commit'), plural(act?.sessions || 0, 'session')]} />
        </div>
        <div className="tl-day-nav">
          {!isToday && (
            <Button size="sm" variant="ghost" onClick={() => onSelect(today)}>
              Today
            </Button>
          )}
          <IconButton icon={<ChevronLeft />} label="Previous day" variant="secondary" onClick={() => onSelect(shiftDay(day, -1))} />
          <IconButton icon={<ChevronRight />} label="Next day" variant="secondary" onClick={() => onSelect(shiftDay(day, 1))} disabled={day >= today} />
        </div>
      </div>

      <SplitBar act={act} projByPath={projByPath} />

      <div className="tl-day-body">
        {isLoading ? (
          <div className="tl-day-skel" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="tl-entry">
                <div className="tl-time">
                  <Skeleton h={12} w={34} />
                </div>
                <div className="stack tl-skel-row">
                  <Skeleton h={14} w={`${70 - i * 12}%`} />
                  <Skeleton h={12} w={`${88 - i * 10}%`} />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <EmptyState icon={<TriangleAlert />} title="Couldn’t load this day" body={(error as Error).message} action={<Button size="sm" onClick={() => refetch()}>Try again</Button>} compact />
        ) : work.length === 0 && carried.length === 0 && autos.length === 0 ? (
          <EmptyState
            icon={<CalendarDays />}
            title={isToday ? 'Nothing recorded yet today' : 'Nothing recorded this day'}
            body={(act?.commits || 0) > 0 ? `${plural(act?.commits || 0, 'commit')}, but no sessions.` : 'No sessions or commits.'}
            compact
          />
        ) : (
          <>
            {work.length > 0 && (
              <div className="tl-entries">
                {work.map((b) => (
                  <div key={b.key || `${b.sessionId}-${b.startAt}`} className="tl-entry">
                    <div className="tl-time num" title={b.startAt < dayStart ? `Started ${fmtDate(b.startAt)}, ${fmtTime(b.startAt)}` : `${fmtTime(b.startAt)} → ${fmtTime(b.endAt)}`}>
                      {when(b.startAt)}
                    </div>
                    <BlockRow b={{ ...b, projectId: b.projectId ?? b.project }} showSession={!phone} />
                  </div>
                ))}
              </div>
            )}
            {carried.length > 0 && (
              <div className="tl-carried">
                <div className="tl-carried-head">
                  {work.length === 0 ? `Nothing new started ${isToday ? 'today' : 'this day'}. ` : ''}Started earlier, continued {isToday ? 'today' : 'this day'}
                </div>
                <div className="tl-entries">
                  {carried.map((b) => (
                    <div key={b.key || `${b.sessionId}-${b.startAt}`} className="tl-entry">
                      <div className="tl-time num" title={`Started ${fmtDate(b.startAt)}, ${fmtTime(b.startAt)}`}>
                        since {fmtDate(b.startAt)}
                      </div>
                      <BlockRow b={{ ...b, projectId: b.projectId ?? b.project }} showSession={!phone} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {autos.length > 0 && (
              <div className="tl-autos">
                <Disclosure summary={<span>{plural(autos.length, 'automation run')}</span>}>
                  <div className="tl-auto-list">
                    {autos.map((b) => {
                      const p = b.project ? projById.get(b.project) : undefined;
                      return (
                        <ListRow
                          key={`${b.sessionId}-${b.startAt}`}
                          dense
                          to={`/sessions/${b.sessionId}`}
                          lead={<Bot size={14} className="faint" />}
                          title={b.title || 'Automation'}
                          titleExtra={p ? <span className="tiny faint truncate tl-auto-proj">{p.name}</span> : undefined}
                          trail={<span className="num">{when(b.startAt)}</span>}
                        />
                      );
                    })}
                  </div>
                </Disclosure>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
