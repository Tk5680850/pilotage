// Year heatmap: 53 weeks × 7 days, accent scale by activity quantile. Fills the card on desktop; on phones the
// cells stay ≥ 14px and the grid scrolls sideways inside the card, opened at the current week.
// Keyboard: the selected day is the only tab stop; arrows move by day (↑↓) and week (←→).
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { isoDay, plural } from '../../util';
import type { DayActivity } from '../../types';
import { addDays, dayMonth, monthShort, parseDay, score, shiftDay, startOfWeek, type DayMap } from './dates';

const WEEKS = 53;
type Cell = { day: string; date: Date; act: DayActivity | undefined; level: number } | null;

function tip(d: Date, a: DayActivity | undefined) {
  const y = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${dayMonth(d)}${y}: ${plural(a?.prompts || 0, 'prompt')}, ${plural(a?.commits || 0, 'commit')}`;
}

/** `onSelect`'s second argument says how the day was picked: a tap/click on a cell, or the keyboard. */
export function Heatmap({ byDay, today, selected, onSelect }: { byDay: DayMap; today: string; selected: string; onSelect: (d: string, via: 'pointer' | 'key') => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef(false);

  const { weeks, months, first } = useMemo(() => {
    const end = parseDay(today);
    const start = addDays(startOfWeek(end), -(WEEKS - 1) * 7);
    // quantile levels over the active days in the window, so one huge day doesn't flatten the rest
    const scores: number[] = [];
    for (let i = 0; i < WEEKS * 7; i++) {
      const d = addDays(start, i);
      if (d > end) break;
      const s = score(byDay.get(isoDay(d.getTime())));
      if (s > 0) scores.push(s);
    }
    scores.sort((a, b) => a - b);
    const n = scores.length;
    const levelOf = (s: number) => {
      if (s <= 0 || n === 0) return 0;
      let lo = 0;
      let hi = n;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (scores[mid] <= s) lo = mid + 1;
        else hi = mid;
      }
      return Math.min(4, Math.max(1, Math.ceil((4 * lo) / n)));
    };
    const weeks: Cell[][] = [];
    for (let w = 0; w < WEEKS; w++) {
      const col: Cell[] = [];
      for (let r = 0; r < 7; r++) {
        const date = addDays(start, w * 7 + r);
        if (date > end) {
          col.push(null);
          continue;
        }
        const day = isoDay(date.getTime());
        const act = byDay.get(day);
        col.push({ day, date, act, level: levelOf(score(act)) });
      }
      weeks.push(col);
    }
    const raw: { w: number; label: string }[] = [];
    let prev = -1;
    for (let w = 0; w < WEEKS; w++) {
      const d = addDays(start, w * 7);
      if (d.getMonth() !== prev) raw.push({ w, label: monthShort(d) });
      prev = d.getMonth();
    }
    const months = raw.filter((l, i) => !raw[i + 1] || raw[i + 1].w - l.w >= 3);
    return { weeks, months, first: isoDay(start.getTime()) };
  }, [byDay, today]);

  // Open on the current week (phones scroll sideways).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);
  // Keep the selected day in view when it changes (keyboard or prev/next day buttons).
  useEffect(() => {
    const btn = gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${selected}"]`);
    const sc = scrollRef.current;
    if (btn && sc) {
      const b = btn.getBoundingClientRect();
      const r = sc.getBoundingClientRect();
      if (b.left < r.left + 30) sc.scrollLeft -= r.left + 30 - b.left;
      else if (b.right > r.right - 10) sc.scrollLeft += b.right - (r.right - 10);
    }
    if (focusNext.current) {
      focusNext.current = false;
      btn?.focus();
    }
  }, [selected]);

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowLeft' ? -7 : e.key === 'ArrowRight' ? 7 : e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : e.key === 'Home' ? -9999 : e.key === 'End' ? 9999 : 0;
    if (!step) return;
    e.preventDefault();
    let next = step === -9999 ? first : step === 9999 ? today : shiftDay(selected, step);
    if (next > today) next = today;
    if (next < first) next = first;
    focusNext.current = true;
    onSelect(next, 'key');
  };

  return (
    <div className="tl-heat">
      <div className="tl-heat-scroll" ref={scrollRef}>
        <div className="tl-heat-inner">
          <div className="tl-months-row" aria-hidden="true">
            <span className="tl-months-gutter" />
            <div className="tl-months">
              {months.map((l) => (
                <span key={l.w} style={{ gridColumn: `${l.w + 1} / span 3` }}>
                  {l.label}
                </span>
              ))}
            </div>
          </div>
          <div className="tl-heat-body">
            <div className="tl-wd" aria-hidden="true">
              <span>Mon</span>
              <span />
              <span>Wed</span>
              <span />
              <span>Fri</span>
              <span />
              <span />
            </div>
            <div className="tl-grid" role="group" aria-label="Activity over the last 12 months. Use the arrow keys to move between days." ref={gridRef} onKeyDown={onKey}>
              {weeks.map((col, w) =>
                col.map((c, r) => {
                  if (!c) return <span key={`${w}-${r}`} className="tl-c empty" />;
                  const t = tip(c.date, c.act);
                  const sel = c.day === selected;
                  const cls = ['tl-c', c.level ? `l${c.level}` : '', sel ? 'sel' : '', c.day === today ? 'today' : ''].filter(Boolean).join(' ');
                  return <button type="button" key={c.day} data-day={c.day} className={cls} title={t} aria-label={t} aria-pressed={sel} tabIndex={sel ? 0 : -1} onClick={() => onSelect(c.day, 'pointer')} />;
                }),
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="tl-heat-foot">
        <span className="tiny faint">Pick a day to see what you did</span>
        <div className="tl-legend" aria-hidden="true" title="Prompts plus commits that day">
          <span>Less</span>
          <span className="tl-c" />
          <span className="tl-c l1" />
          <span className="tl-c l2" />
          <span className="tl-c l3" />
          <span className="tl-c l4" />
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
