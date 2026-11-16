// How Pilotage works (/guide): the five objects, where they come from, the phone, and what the AI costs.
// Spec: docs/SIMPLIFY.md §1 and §9. MODEL_LINES are the one-liners every page reuses as subtitle / empty-state text.
import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, FolderKanban, Gauge, Lightbulb, ListChecks, MessagesSquare, Smartphone, Sparkles, Waypoints } from 'lucide-react';
import { useBootstrap, useOverview } from '../api';
import { Card, PageHeader } from '../components/ui';
import { plural } from '../util';
import './Guide.css';

/** One line per object. Reuse these as page subtitles and empty states so every place says the same thing. */
export const MODEL_LINES = {
  project: 'A repo or folder you work in.',
  session: 'One conversation with Claude Code, Codex or Gemini.',
  workstream: 'Sessions about one goal inside a project, grouped by AI.',
  task: 'Something you’ve decided to do. AI suggests tasks from your sessions; you keep or dismiss them.',
  idea: 'Something you might do, including possible new projects the AI spotted in your work.',
} as const;

const OBJECTS: { key: keyof typeof MODEL_LINES; name: string; icon: React.ReactNode; to: string; where: string }[] = [
  { key: 'project', name: 'Project', icon: <FolderKanban />, to: '/projects', where: 'Projects' },
  { key: 'session', name: 'Session', icon: <MessagesSquare />, to: '/sessions', where: 'Sessions' },
  { key: 'workstream', name: 'Workstream', icon: <Waypoints />, to: '/projects', where: 'Inside each project' },
  { key: 'task', name: 'Task', icon: <ListChecks />, to: '/tasks', where: 'Tasks' },
  { key: 'idea', name: 'Idea', icon: <Lightbulb />, to: '/ideas', where: 'Ideas' },
];

export default function Guide() {
  const { data: o } = useOverview();
  const { data: boot } = useBootstrap();
  const ai = boot?.settings.ai;
  const u = o?.usage || boot?.usage;
  const c = o?.counts;
  const now =
    c && c.interactive !== undefined
      ? [plural(c.interactive, 'session'), c.automated ? plural(c.automated, 'automation') : null, c.archived ? `${c.archived} archived` : null].filter(Boolean).join(' · ') + ` in ${plural(c.projects, 'project')}`
      : c
        ? `${plural(c.sessions, 'session')} in ${plural(c.projects, 'project')}`
        : null;

  return (
    <>
      <PageHeader title="How Pilotage works" subtitle="Pilotage reads your coding sessions on this PC and turns them into a short list of things to act on." />

      <section className="gd-section" aria-labelledby="gd-objects">
        <h2 id="gd-objects" className="gd-h">Five things, the same name everywhere</h2>
        <Card flush className="gd-objects">
          {OBJECTS.map((x) => (
            <Link key={x.key} to={x.to} className="gd-obj">
              <span className="gd-ico" aria-hidden="true">
                {x.icon}
              </span>
              <span className="gd-obj-body">
                <span className="gd-obj-name">{x.name}</span>
                <span className="gd-obj-line">{MODEL_LINES[x.key]}</span>
              </span>
              <span className="gd-obj-where">
                {x.where}
                <ChevronRight size={14} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </Card>
        <p className="gd-note">
          <Link to="/" className="link">
            Home
          </Link>{' '}
          brings them together: sessions that need you, the tasks you picked for today, what’s running, and what you can pick up again.
        </p>
      </section>

      <div className="gd-grid">
        <Card title="Where things come from" icon={<Sparkles />} className="gd-card">
          <ol className="gd-steps">
            <li>
              <b>Your sessions.</b> Pilotage reads the Claude Code, Codex and Gemini sessions saved on this PC. It never changes them.
            </li>
            <li>
              <b>Grouped into projects.</b> Each git repository (with its worktrees) or folder is a project. Top folders in your home are workspaces.
            </li>
            <li>
              <b>Read by AI.</b> It writes summaries, groups sessions into workstreams, suggests tasks and spots possible projects. You decide what to keep.
            </li>
          </ol>
          <p className="gd-foot">Nothing is sent anywhere else.{now ? ` Right now: ${now}.` : ''}</p>
        </Card>

        <Card title="On your phone" icon={<Smartphone />} className="gd-card">
          <ul className="gd-list">
            <li>Pilotage runs on this PC. A paired phone opens it over your Wi-Fi or VPN.</li>
            <li>
              A running session has <b>Open in Claude app</b>: the same conversation continues in the Claude app.
            </li>
            <li>
              <b>＋</b> in the tab bar starts a session, adds a task or captures an idea.
            </li>
          </ul>
          <p className="gd-foot">
            <Link to="/settings#phone" className="link">
              Pair a phone in Settings
            </Link>
          </p>
        </Card>

        <Card title="What AI costs" icon={<Gauge />} className="gd-card">
          <ul className="gd-list">
            <li>AI work runs on your own Claude plan, through Claude Code, unless you pick another provider in Settings.</li>
            <li>{ai ? `It pauses itself when the 5-hour limit passes ${ai.maxFiveHourPct}% or the weekly limit passes ${ai.maxSevenDayPct}%.` : 'It pauses itself above the usage limits you set in Settings.'}</li>
            {ai && !ai.enabled && <li>AI is turned off at the moment: no summaries, suggestions or plans are written.</li>}
          </ul>
          <p className="gd-foot">
            {u && (u.five || u.seven) ? (
              <>
                Now: {[u.five ? `5-hour limit ${Math.round(u.five.pct)}%` : null, u.seven ? `weekly limit ${Math.round(u.seven.pct)}%` : null].filter(Boolean).join(' · ')}.{' '}
              </>
            ) : null}
            <Link to="/settings#ai" className="link">
              AI settings
            </Link>
          </p>
        </Card>
      </div>
    </>
  );
}
