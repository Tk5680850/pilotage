// Local-time day helpers for the Timeline (days are 'YYYY-MM-DD' in the browser's time zone, like the server's isoDay).
import { isoDay } from '../../util';
import type { DayActivity } from '../../types';

export type TimelineProject = { id: string; path: string; name: string; workspace: string; workspaceName: string };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}
export function shiftDay(day: string, n: number): string {
  return isoDay(addDays(parseDay(day), n).getTime());
}
/** Monday of the week containing d. */
export function startOfWeek(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}
export function isValidDay(s: string | null): s is string {
  if (!s || !DAY_RE.test(s)) return false;
  return isoDay(parseDay(s).getTime()) === s;
}
export function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || p;
}
export const monthShort = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short' });
export const dayMonth = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Activity weight used everywhere on the page: a commit counts as two prompts. */
export const score = (a: { prompts: number; commits: number } | undefined) => (a ? a.prompts + a.commits * 2 : 0);

export type DayMap = Map<string, DayActivity>;
