// Project › Tasks: the same Tasks UI as /tasks (components/tasks/TasksView), filtered to this project, with the same
// two tabs (To do · Suggested). The tab is `?tasks=suggested` because the project page already uses `?tab=`.
import React from 'react';
import type { ProjectDetail } from '../../types';
import type { WorkItem } from '../../types-extra';
import { TaskQuickAdd } from '../tasks/TaskQuickAdd';
import { TasksView, useTasksTab } from '../tasks/TasksView';

/** Add a task to this project's To do (kept for the project Overview's card footer). One compact line. */
export function QuickAdd({ projectId, compact = false, onAdded }: { projectId: string; compact?: boolean; onAdded?: (it: WorkItem) => void }) {
  return <TaskQuickAdd projectId={projectId} compact={compact} onAdded={onAdded} />;
}

export function TasksTab({ p }: { p: ProjectDetail }) {
  const [tab, setTab] = useTasksTab('tasks');
  return <TasksView projectId={p.id} tab={tab} onTab={setTab} inlineTabs />;
}
