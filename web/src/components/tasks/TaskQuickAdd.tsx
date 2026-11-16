// "Add a task" as ONE compact line (SIMPLIFY §6 fresh-eyes fix): [+ title…] [project chip] [Add].
// The project is a small chip over a native <select> (the OS picker sheet on phones), or fixed on a project page.
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { useProjects } from '../../api';
import { Button, Kbd, ProjectGlyph } from '../ui';
import type { ProjectSummary } from '../../types';
import type { WorkItem } from '../../types-extra';
import { useMedia, usePref, useTaskActions } from './model';
import './tasks.css';

type Proj = Pick<ProjectSummary, 'id' | 'name' | 'workspace' | 'workspaceName' | 'color' | 'status' | 'lastAt'>;

/** Project chip: glyph + name + chevron, with a transparent native select on top (keyboard and phone friendly). */
function ProjectChip({ value, projects, onChange }: { value: string; projects: Proj[]; onChange: (id: string) => void }) {
  const p = projects.find((x) => x.id === value);
  const groups = useMemo(() => {
    const m = new Map<string, Proj[]>();
    for (const x of projects) {
      const g = m.get(x.workspaceName) || [];
      g.push(x);
      m.set(x.workspaceName, g);
    }
    return [...m.entries()];
  }, [projects]);
  return (
    <span className="task-add-chip" title={p ? `Project: ${p.name}` : 'Pick a project'}>
      {p ? <ProjectGlyph name={p.name} ws={p.workspace} color={p.color} size={16} /> : null}
      <span className="truncate">{p ? p.name : 'Project'}</span>
      <ChevronDown aria-hidden="true" />
      <select className="task-add-chip-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Project for the new task">
        {!p && <option value="">Pick a project</option>}
        {groups.map(([ws, ps]) => (
          <optgroup key={ws} label={ws}>
            {ps.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </span>
  );
}

export function TaskQuickAdd({
  projectId,
  defaultProject = '',
  inputRef,
  compact = false,
  onAdded,
  placeholder,
}: {
  /** Fixed project (project page): no picker. */
  projectId?: string;
  /** Preselected project (Tasks page filter); the chip still lets the user change it. */
  defaultProject?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
  compact?: boolean;
  onAdded?: (it: WorkItem) => void;
  placeholder?: string;
}) {
  const { create } = useTaskActions();
  const phone = useMedia();
  const { data: allProjects } = useProjects();
  const [lastProject, setLastProject] = usePref<string>('pilotage.tasks.lastProject', '');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState('');
  useEffect(() => {
    if (defaultProject) setPicked(defaultProject);
  }, [defaultProject]);
  const projects = useMemo(
    () => (allProjects || []).filter((p) => p.status !== 'archived').sort((a, b) => a.workspaceName.localeCompare(b.workspaceName) || a.name.localeCompare(b.name)),
    [allProjects],
  );
  const fallback = useMemo(() => [...projects].sort((a, b) => b.lastAt - a.lastAt)[0]?.id || '', [projects]);
  const pid = projectId || picked || defaultProject || (projects.some((p) => p.id === lastProject) ? lastProject : '') || fallback;

  const add = async () => {
    const t = title.trim();
    if (!t || !pid || busy) return;
    setBusy(true);
    const it = await create({ projectId: pid, title: t, status: 'todo' });
    setBusy(false);
    if (it) {
      setTitle('');
      if (!projectId) setLastProject(pid);
      inputRef?.current?.focus();
      onAdded?.(it);
    }
  };

  return (
    <form
      className={`task-add${compact ? ' compact' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <div className="input-wrap task-add-input">
        <Plus />
        <input
          ref={inputRef}
          className="input"
          placeholder={placeholder || (projectId ? 'Add a task to To do…' : 'Add a task…')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && (setTitle(''), (e.target as HTMLInputElement).blur())}
          aria-label="New task title"
          enterKeyHint="done"
          maxLength={200}
        />
        {!phone && !title && !compact && inputRef && <Kbd>N</Kbd>}
      </div>
      {!projectId && <ProjectChip value={pid} projects={projects} onChange={setPicked} />}
      <Button type="submit" size="sm" className="task-add-btn" disabled={!title.trim() || !pid} loading={busy}>
        Add
      </Button>
    </form>
  );
}
