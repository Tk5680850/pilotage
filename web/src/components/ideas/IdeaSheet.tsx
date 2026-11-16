// One idea, all its actions: a centered dialog on the PC, a bottom sheet on the phone.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, FolderPlus, ListChecks, Pencil, Play, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import type { ProjectSummary } from '../../types';
import { Button, Meta, Modal, ProjectGlyph, Spinner } from '../ui';
import { ago, fmtDateTime } from '../../util';
import { IdeaX, ProjectSelect, baseName, isMac, looksLikePhone } from './shared';

export type IdeaActions = {
  start: (idea: IdeaX, project?: ProjectSummary) => void;
  makeTask: (idea: IdeaX, projectId: string) => Promise<boolean>;
  newProject: (idea: IdeaX) => void;
  toggleDone: (idea: IdeaX) => Promise<boolean>;
  save: (idea: IdeaX, patch: { text?: string; projectId?: string | null }, msg: string) => Promise<boolean>;
  remove: (idea: IdeaX) => Promise<boolean>;
};

export function IdeaSheet({
  idea,
  project,
  projects,
  actions,
  onClose,
}: {
  idea: IdeaX;
  project: ProjectSummary | undefined;
  projects: ProjectSummary[] | undefined;
  actions: IdeaActions;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(idea.text);
  const [picking, setPicking] = useState(false);
  const [taskProject, setTaskProject] = useState(project?.id || '');
  const [busy, setBusy] = useState<string | null>(null);
  const done = !!idea.doneAt;
  const ai = idea.source === 'ai';

  const run = async (key: string, fn: () => Promise<boolean>, close = false) => {
    setBusy(key);
    const ok = await fn();
    setBusy(null);
    if (ok && close) onClose();
    return ok;
  };

  const saveText = async () => {
    const t = text.trim();
    if (!t) return;
    if (t === idea.text) return setEditing(false);
    if (await run('edit', () => actions.save(idea, { text: t }, 'Idea updated'))) setEditing(false);
  };

  const makeTask = () => {
    if (!project && !taskProject) return setPicking(true);
    return run('task', () => actions.makeTask(idea, taskProject || project!.id), true);
  };

  return (
    <Modal title={ai ? 'Idea suggested by AI' : 'Idea'} onClose={onClose} className="idea-sheet">
      <div className="modal-body">
        {editing ? (
          <div className="stack">
            <textarea
              className="textarea"
              rows={5}
              value={text}
              autoFocus
              aria-label="Idea text"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  saveText();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditing(false);
                  setText(idea.text);
                }
              }}
            />
            <div className="cluster" style={{ justifyContent: 'flex-end' }}>
              <span className="hint hide-mobile grow">{isMac ? '⌘' : 'Ctrl'} + Enter to save</span>
              <Button variant="ghost" onClick={() => (setEditing(false), setText(idea.text))}>
                Cancel
              </Button>
              <Button icon={<Check />} loading={busy === 'edit'} disabled={!text.trim()} onClick={saveText}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="stack">
            <p className={`idea-full pre-wrap${done ? ' done' : ''}`}>{idea.text}</p>
            <Meta
              items={[
                ai ? (
                  <span className="idea-ai">
                    <Sparkles aria-hidden="true" /> Suggested by AI
                  </span>
                ) : looksLikePhone(idea.source) ? (
                  `from ${idea.source}`
                ) : null,
                <span title={fmtDateTime(idea.createdAt)}>added {ago(idea.createdAt)}</span>,
                done ? <span title={fmtDateTime(idea.doneAt)}>done {ago(idea.doneAt)}</span> : null,
                idea.launchedAt ? <span title={fmtDateTime(idea.launchedAt)}>session started {ago(idea.launchedAt)}</span> : null,
                idea.workItemId ? 'became a task' : null,
              ]}
            />
          </div>
        )}

        <div className="field">
          <label htmlFor={`idea-${idea.id}-proj`}>Project</label>
          <div className="idea-proj-row">
            {project && <ProjectGlyph name={project.name} ws={project.workspace} color={project.color} size={22} />}
            <ProjectSelect
              id={`idea-${idea.id}-proj`}
              projects={projects}
              value={project?.id || (idea.projectPath ? '__keep__' : '')}
              label="Project for this idea"
              extra={idea.projectPath && !project ? <option value="__keep__">{baseName(idea.projectPath)}</option> : null}
              onChange={(v) => {
                if (v === '__keep__') return;
                setTaskProject(v);
                run('proj', () => actions.save(idea, { projectId: v || null }, v ? 'Project set' : 'Project removed'));
              }}
              disabled={busy === 'proj'}
            />
            {project && (
              <Link to={`/projects/${project.id}`} className="btn ghost icon" aria-label={`Open ${project.name}`} title={`Open ${project.name}`} onClick={onClose}>
                <ChevronRight size={16} />
              </Link>
            )}
          </div>
        </div>

        <div className="sheet-actions" role="group" aria-label="What to do with this idea">
          <SheetAction
            icon={<Play />}
            title="Start a session"
            hint={project ? `Claude starts in ${project.name} with this idea as the prompt.` : 'Pick the folder in the next step; the idea becomes the prompt.'}
            onClick={() => {
              onClose();
              actions.start(idea, project);
            }}
          />
          <SheetAction
            icon={busy === 'task' ? <Spinner size={16} /> : <ListChecks />}
            title="Make it a task"
            hint={project || taskProject ? 'Adds it to the project board and marks the idea done.' : 'Choose a project for it.'}
            onClick={makeTask}
            disabled={!!busy}
          >
            {picking && !project && (
              <div className="sheet-pick" onClick={(e) => e.stopPropagation()}>
                <ProjectSelect id={`idea-${idea.id}-task`} projects={projects} value={taskProject} onChange={setTaskProject} label="Project for the task" noneLabel="Choose a project…" />
                <Button size="sm" disabled={!taskProject} loading={busy === 'task'} onClick={() => run('task', () => actions.makeTask(idea, taskProject), true)}>
                  Add task
                </Button>
              </div>
            )}
          </SheetAction>
          <SheetAction
            icon={<FolderPlus />}
            title="Start a project from this"
            hint="A new folder with a CLAUDE.md written from the idea. You see the path before anything is created."
            onClick={() => {
              onClose();
              actions.newProject(idea);
            }}
          />
        </div>

        <div className="sheet-secondary">
          <Button icon={done ? <RotateCcw /> : <Check />} loading={busy === 'done'} onClick={() => run('done', () => actions.toggleDone(idea), true)}>
            {done ? 'Reopen' : 'Mark done'}
          </Button>
          {!editing && (
            <Button variant="ghost" icon={<Pencil />} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          <span className="grow" />
          <Button variant="ghost" className="idea-del" icon={<Trash2 />} loading={busy === 'del'} onClick={() => run('del', () => actions.remove(idea), true)}>
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SheetAction({ icon, title, hint, onClick, disabled, children }: { icon: React.ReactNode; title: string; hint: string; onClick: () => void; disabled?: boolean; children?: React.ReactNode }) {
  return (
    <div className="sheet-action-wrap">
      <button type="button" className="sheet-action" onClick={onClick} disabled={disabled}>
        <span className="sheet-action-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="sheet-action-text">
          <span className="sheet-action-title">{title}</span>
          <span className="sheet-action-hint">{hint}</span>
        </span>
        <ChevronRight size={16} className="faint" aria-hidden="true" />
      </button>
      {children}
    </div>
  );
}
