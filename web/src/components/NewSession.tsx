import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Cloud, ExternalLink, GitFork, Monitor, Search, Smartphone, TriangleAlert } from 'lucide-react';
import { useHarnesses } from '../api-extra';
import { api, useBootstrap, useInvalidate, useProjects, useSession, useWsl } from '../api';
import { useApp } from './AppContext';
import { Modal, Spinner, useToast, CopyButton, ProjectGlyph, SegmentedControl, Field } from './ui';
import type { Launch } from '../types';
import { ago, isPhone } from '../util';

const MODELS = [
  { value: '', label: 'Default' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
  { value: 'fable', label: 'Fable' },
];

function LaunchProgress({ launch, onClose }: { launch: Launch; onClose: () => void }) {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['launch', launch.id],
    queryFn: () => api<Launch>(`/api/launch/${launch.id}`),
    initialData: launch,
    refetchInterval: (q) => {
      const d = q.state.data as Launch | undefined;
      if (!d) return 1500;
      if (d.bridgeUrl || d.state === 'error' || Date.now() - d.createdAt > 4 * 60_000) return false;
      return 1500;
    },
  });
  const l = data || launch;
  const ready = !!l.bridgeUrl;
  return (
    <div className="modal-body" style={{ paddingTop: 10 }}>
      {l.state === 'error' ? (
        <div className="callout warn">
          <TriangleAlert size={18} />
          <div>
            <div className="bold">Could not start the session</div>
            <div className="small">{l.error}</div>
          </div>
        </div>
      ) : (
        <div className="launch-state">
          <div className={`launch-icon${ready ? ' ok' : ''}`}>{ready ? <CheckCircle2 size={26} /> : <Spinner size={24} />}</div>
          <div className="stack" style={{ gap: 6 }}>
            <div className="launch-title">
              {ready ? `“${l.name}” is running` : l.mode === 'terminal' ? 'Opening a terminal tab on your PC…' : 'Starting in the background…'}
            </div>
            <div className="small muted readable" style={{ margin: '0 auto' }}>
              {ready
                ? l.mode === 'terminal'
                  ? 'It is open in Windows Terminal, and you can continue it from your phone.'
                  : 'It runs on your PC without a window. Continue it in the Claude app.'
                : l.note || l.detail || 'Waiting for Claude to connect Remote Control…'}
            </div>
          </div>
          {ready && (
            <div className="stack" style={{ width: '100%', maxWidth: 360, gap: 10 }}>
              <a className="btn primary block lg" href={l.bridgeUrl!} target="_blank" rel="noreferrer">
                <Smartphone size={16} />
                Open in Claude app
                <ExternalLink size={14} />
              </a>
              <div className="cluster" style={{ justifyContent: 'center' }}>
                <CopyButton text={l.bridgeUrl!} label="Copy link" />
                {l.sessionId && (
                  <button
                    className="btn sm"
                    onClick={() => {
                      onClose();
                      navigate(`/sessions/${l.sessionId}`);
                    }}
                  >
                    View in Pilotage
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function NewSessionModal() {
  const { newSession: pre, closeNewSession } = useApp();
  const { data: projects } = useProjects();
  const { data: boot } = useBootstrap();
  const { data: resumeSession } = useSession(pre?.resumeId);
  const toast = useToast();
  const inv = useInvalidate();
  const phone = boot?.device.isPhone ?? isPhone();
  // Outside WSL2 + Windows there are no terminal tabs: every session starts in the background.
  const wsl = useWsl();
  const defaultMode = !wsl ? 'background' : (phone ? boot?.settings.launch.phoneMode : boot?.settings.launch.pcMode) || (phone ? 'background' : 'terminal');
  const [projectId, setProjectId] = useState(pre?.projectId || '');
  const [filter, setFilter] = useState('');
  const [name, setName] = useState(pre?.name || '');
  const [prompt, setPrompt] = useState(pre?.prompt || '');
  const [mode, setMode] = useState<'terminal' | 'background'>(defaultMode);
  const [model, setModel] = useState(boot?.settings.launch.model || '');
  const [fork, setFork] = useState(!!pre?.fork);
  const [harness, setHarness] = useState<'claude' | 'codex' | 'gemini'>('claude');
  const { data: harnesses } = useHarnesses();
  const effHarness = (resumeSession?.harness as 'claude' | 'codex' | 'gemini' | undefined) || harness;
  const claudeOnly = effHarness === 'claude';
  useEffect(() => {
    // Codex/Gemini run in a terminal tab only (no background mode, no fork, no Claude model names).
    if (!claudeOnly) {
      setMode('terminal');
      setFork(false);
    }
  }, [claudeOnly]);
  const [busy, setBusy] = useState(false);
  const [launch, setLaunch] = useState<Launch | null>(null);

  const resuming = !!pre?.resumeId;
  const project = projects?.find((p) => p.id === (projectId || resumeSession?.projectId));
  const list = useMemo(() => {
    const ps = (projects || []).filter((p) => p.status !== 'archived');
    const f = filter.toLowerCase();
    const filtered = f ? ps.filter((p) => `${p.name} ${p.displayPath} ${p.workspaceName}`.toLowerCase().includes(f)) : ps;
    return filtered.slice(0, f ? 30 : 10);
  }, [projects, filter]);

  async function start() {
    setBusy(true);
    try {
      const rec = await api<Launch>('/api/launch', {
        method: 'POST',
        body: { projectId: projectId || undefined, worktree: pre?.worktree, resumeId: pre?.resumeId, fork: claudeOnly && fork, name: name || undefined, prompt, mode: claudeOnly ? mode : 'terminal', model: claudeOnly ? model : '', harness: effHarness, ideaId: pre?.ideaId },
      });
      setLaunch(rec);
      inv('live', 'overview', 'ideas');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  const title = launch ? 'Session' : resuming ? (fork ? 'Fork session' : 'Resume session') : pre?.title || 'New session';
  return (
    <Modal
      title={title}
      onClose={closeNewSession}
      footer={
        launch ? (
          <button className="btn" onClick={closeNewSession}>
            Close
          </button>
        ) : (
          <>
            <button className="btn ghost" onClick={closeNewSession}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy || (!resuming && !projectId)} onClick={start}>
              {busy && <Spinner size={14} />}
              {resuming ? (fork ? 'Fork and start' : 'Resume') : 'Start session'}
            </button>
          </>
        )
      }
    >
      {launch ? (
        <LaunchProgress launch={launch} onClose={closeNewSession} />
      ) : (
        <div className="modal-body">
          {resuming ? (
            <div className="focus-card">
              <div className="overline">{fork ? 'Starts a new session from this conversation' : 'Continues this conversation'}</div>
              <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                {resumeSession?.projectName && <ProjectGlyph name={resumeSession.projectName} ws={resumeSession.workspace} size={28} />}
                <div className="grow">
                  <div className="bold">{resumeSession?.title || '…'}</div>
                  <div className="small faint">
                    {resumeSession?.projectName} · last active {ago(resumeSession?.lastAt)}
                  </div>
                </div>
              </div>
              {claudeOnly && (
                <label className="row small check-row">
                  <input type="checkbox" checked={fork} onChange={(e) => setFork(e.target.checked)} />
                  <GitFork size={14} className="faint" /> Fork instead (keep the original untouched)
                </label>
              )}
            </div>
          ) : (
            <div className="field">
              <label>Project</label>
              {project && projectId ? (
                <div className="focus-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <ProjectGlyph name={project.name} ws={project.workspace} color={project.color} size={32} />
                  <div className="grow">
                    <div className="bold truncate">{project.name}</div>
                    <div className="tiny faint truncate">{pre?.worktree ? `worktree ${pre.worktree.split('/').pop()}` : project.displayPath}</div>
                  </div>
                  <button className="btn sm ghost" onClick={() => setProjectId('')}>
                    Change
                  </button>
                </div>
              ) : (
                <div className="picker">
                  <div className="picker-search">
                    <Search size={15} />
                    <input placeholder="Search projects…" value={filter} onChange={(e) => setFilter(e.target.value)} autoFocus={!phone} />
                  </div>
                  <div className="picker-list">
                    {list.map((p) => (
                      <button type="button" key={p.id} className="picker-item" onClick={() => setProjectId(p.id)}>
                        <ProjectGlyph name={p.name} ws={p.workspace} color={p.color} size={26} />
                        <div className="grow">
                          <div className="truncate medium">{p.name}</div>
                          <div className="tiny faint truncate">
                            {p.workspaceName} · {p.displayPath}
                          </div>
                        </div>
                        <span className="tiny faint num">{ago(p.lastAt)}</span>
                      </button>
                    ))}
                    {!list.length && <div className="empty compact">No project matches</div>}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="field">
            <label>{resuming ? 'Message to continue with (optional)' : 'Goal / first prompt (optional)'}</label>
            <textarea className="textarea" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={resuming ? 'e.g. Continue where you left off and finish the export.' : 'e.g. Audit the settings page and list what exists. Ask before big changes.'} />
          </div>
          <div className="field">
            <label>Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={project ? `${project.name} – …` : 'Shown in Claude app and terminal tab'} maxLength={60} />
          </div>
          {!resuming && (harnesses?.harnesses || []).filter((h) => h.installed && h.enabled && (wsl || h.id === 'claude')).length > 1 && (
            <Field label="Agent">
              <SegmentedControl
                value={harness}
                onChange={(v) => setHarness(v as 'claude' | 'codex' | 'gemini')}
                options={(harnesses?.harnesses || []).filter((h) => h.installed && h.enabled && (wsl || h.id === 'claude')).map((h) => ({ value: h.id, label: h.id === 'claude' ? 'Claude Code' : h.id === 'codex' ? 'Codex' : 'Gemini' }))}
                label="Agent"
              />
            </Field>
          )}
          {claudeOnly && wsl && (
            <div className="field">
              <label>Where</label>
              <div className="choice-grid" role="radiogroup" aria-label="Where">
                {([
                  { value: 'terminal', icon: <Monitor size={17} />, title: 'Terminal on PC', hint: 'A Windows Terminal tab with Remote Control, so it also shows on your phone.' },
                  { value: 'background', icon: <Cloud size={17} />, title: 'Background', hint: 'No window on the PC. Continue it in the Claude app.' },
                ] as const).map((o) => (
                  <button type="button" key={o.value} role="radio" aria-checked={mode === o.value} className={`choice${mode === o.value ? ' on' : ''}`} onClick={() => setMode(o.value)}>
                    <span className="choice-icon">{o.icon}</span>
                    <span className="choice-title">{o.title}</span>
                    <span className="choice-hint">{o.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {claudeOnly ? (
            <Field label="Model">
              <SegmentedControl value={model} onChange={setModel} options={MODELS} label="Model" />
            </Field>
          ) : (
            <div className="hint">{effHarness === 'codex' ? 'Codex' : 'Gemini'} opens in a Windows Terminal tab on your PC (no phone link: only Claude Code has Remote Control).</div>
          )}
          <div className="hint">Permissions: {boot?.settings.launch.permissionMode === 'bypassPermissions' ? 'skip permission prompts (like your usual sessions)' : boot?.settings.launch.permissionMode}. Change in Settings.</div>
        </div>
      )}
    </Modal>
  );
}
