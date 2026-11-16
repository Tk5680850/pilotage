// More (phone): the pages that aren't tabs (Projects, Ideas, History, Portfolio & CV, Settings, How Pilotage works),
// plus Claude usage. Counts use the same rules as the desktop pages (Projects "current" = the Projects page filter).
import { Briefcase, ChevronRight, CircleHelp, FolderKanban, Gauge, History, Lightbulb, Settings } from 'lucide-react';
import { useBootstrap, useIdeas, useOverview, useProjects } from '../api';
import { Card, ListRow, Meter, PageHeader, USAGE_LABELS } from '../components/ui';
import { fmtDateTime, fmtTime, plural } from '../util';
import './More.css';

function UsageRow({ label, pct, resetsAt, sameDay }: { label: string; pct: number | null; resetsAt?: number; sameDay?: boolean }) {
  return (
    <div className="usage-line">
      <div className="spread">
        <span className="medium">{label}</span>
        <span className={`num medium${pct != null && pct >= 85 ? ' tone-red' : pct != null && pct >= 60 ? ' tone-amber' : ''}`}>{pct == null ? 'Unknown' : `${Math.round(pct)}%`}</span>
      </div>
      {pct != null ? <Meter pct={pct} label={label} /> : <div className="meter" aria-hidden="true" />}
      <div className="tiny faint">{pct == null ? 'Pilotage hasn’t seen a usage reading yet' : resetsAt ? `Resets ${sameDay ? fmtTime(resetsAt) : fmtDateTime(resetsAt)}` : ' '}</div>
    </div>
  );
}

export default function More() {
  const { data: o } = useOverview();
  const { data: boot } = useBootstrap();
  const { data: projects } = useProjects();
  const { data: ideas } = useIdeas();
  const u = o?.usage || boot?.usage;
  // same rule as the Projects page "Current" filter
  const current = projects ? projects.filter((p) => p.liveCount > 0 || p.status === 'active' || p.status === 'paused').length : null;
  const savedIdeas = ideas ? ideas.filter((i) => !i.doneAt).length : null;
  const possible = o?.scout?.newCount || 0;
  const ideasSub =
    savedIdeas == null && !o
      ? 'Things you might do'
      : [possible ? plural(possible, 'possible project') : null, savedIdeas ? plural(savedIdeas, 'saved idea') : null].filter(Boolean).join(' · ') || 'Nothing saved yet';
  const items = [
    { to: '/projects', icon: <FolderKanban />, label: 'Projects', sub: projects ? `${plural(projects.length, 'project')} · ${current} current` : 'Every repo and folder you work in' },
    { to: '/ideas', icon: <Lightbulb />, label: 'Ideas', sub: ideasSub },
    { to: '/history', icon: <History />, label: 'History', sub: 'What you did, day by day' },
    { to: '/portfolio', icon: <Briefcase />, label: 'Portfolio & CV', sub: 'Your projects as CV entries' },
    { to: '/settings', icon: <Settings />, label: 'Settings', sub: 'Phone access, devices, AI, defaults' },
    { to: '/guide', icon: <CircleHelp />, label: 'How Pilotage works', sub: 'What everything means, on one page' },
  ];
  const sameDay = (t?: number) => !!t && new Date(t).toDateString() === new Date().toDateString();
  return (
    <>
      <PageHeader title="More" />
      <Card flush className="more-menu">
        {items.map((i) => (
          <ListRow key={i.to} dense to={i.to} lead={<span className="more-ico">{i.icon}</span>} title={i.label} sub={i.sub} trail={<ChevronRight size={16} />} label={i.label} />
        ))}
      </Card>
      <Card title="Claude usage" icon={<Gauge />}>
        {u ? (
          <div className="stack-lg">
            <UsageRow label={USAGE_LABELS.five} pct={u.five ? u.five.pct : null} resetsAt={u.five?.resetsAt} sameDay={sameDay(u.five?.resetsAt)} />
            <UsageRow label={USAGE_LABELS.seven} pct={u.seven ? u.seven.pct : null} resetsAt={u.seven?.resetsAt} sameDay={sameDay(u.seven?.resetsAt)} />
          </div>
        ) : (
          <div className="small faint">Loading…</div>
        )}
      </Card>
      <div className="tiny faint more-foot">
        Pilotage {boot?.version} · this device: {boot?.device.name || '…'}
      </div>
    </>
  );
}
