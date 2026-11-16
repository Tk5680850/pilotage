// What you can do with a session right now: continue it (live), resume / fork it (not live), or copy the
// resume command (Codex / Gemini). Rendered in the page header on desktop and as a sticky bar on the phone.
import React from 'react';
import { Copy, GitFork, Monitor, Play, Smartphone, Square, Terminal } from 'lucide-react';
import { api, useInvalidate, useWsl } from '../../api';
import { useApp } from '../AppContext';
import { useToast } from '../ui';
import { copy } from '../../util';
import type { SessionDetail } from '../../types';
import { harnessOf } from './shared';

export type SessionAction = {
  key: string;
  label: string;
  /** Shorter label for the phone bar. */
  short?: string;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
  desktopOnly?: boolean;
  danger?: boolean;
  title?: string;
};

export type ActionSet = { primary: SessionAction | null; secondary: SessionAction[]; note: string | null };

export function useSessionActions(s: SessionDetail): ActionSet {
  const { openNewSession } = useApp();
  const toast = useToast();
  const inv = useInvalidate();
  const wsl = useWsl();
  const harness = harnessOf(s);
  const copyResume: SessionAction = {
    key: 'copy',
    label: 'Copy resume command',
    short: 'Copy command',
    icon: <Copy />,
    title: s.resumeCommand,
    onClick: () => copy(s.resumeCommand).then(() => toast('Resume command copied')),
  };

  const l = s.live;
  if (l) {
    const secondary: SessionAction[] = [];
    if (l.kind === 'background' && l.bgId && wsl) {
      secondary.push({
        key: 'attach',
        label: 'Attach on PC',
        icon: <Monitor />,
        desktopOnly: true,
        title: 'Open this background session in a Windows Terminal tab',
        onClick: () =>
          api(`/api/sessions/${s.id}/attach`, { method: 'POST' })
            .then(() => toast('Opened in Windows Terminal'))
            .catch((e) => toast(e.message, true)),
      });
    }
    if (l.kind === 'background' && l.bgId) {
      secondary.push({
        key: 'stop',
        label: 'Stop',
        icon: <Square />,
        danger: true,
        title: 'Stop this background session (the conversation is kept)',
        onClick: () => {
          if (!confirm(`Stop “${s.title}”? The conversation is kept and can be resumed.`)) return;
          api(`/api/sessions/${s.id}/stop`, { method: 'POST' })
            .then(() => {
              toast('Stopped');
              inv('session', 'live', 'overview', 'sessions');
            })
            .catch((e) => toast(e.message, true));
        },
      });
    }
    return {
      primary: l.bridgeUrl ? { key: 'open', label: 'Open in Claude app', short: 'Open in Claude app', icon: <Smartphone />, href: l.bridgeUrl } : null,
      secondary,
      note: l.bridgeUrl ? null : l.kind === 'background' ? 'Running in the background on your PC' : 'Running in a terminal on your PC',
    };
  }

  if (s.kind === 'archived') {
    return {
      primary: {
        key: 'topic',
        label: 'New session on this topic',
        short: 'New session on this topic',
        icon: <Play />,
        title: 'The transcript is gone, so this starts a fresh session with a pointer to this one',
        onClick: () => openNewSession({ projectId: s.projectId || undefined, prompt: `Context: an earlier session about “${s.title}”. ` }),
      },
      secondary: [],
      note: null,
    };
  }

  if (harness === 'codex' && !wsl) {
    // No Windows Terminal to open it in: the resume command is the way back in.
    return { primary: { ...copyResume, short: 'Copy resume command' }, secondary: [], note: 'Resume it with this command in a terminal' };
  }

  if (harness === 'codex') {
    return {
      primary: {
        key: 'resume-codex',
        label: 'Resume on PC',
        icon: <Terminal />,
        title: 'Opens Codex in a Windows Terminal tab on your PC and resumes this session',
        onClick: () => {
          if (!confirm('Open Codex in a Windows Terminal tab on your PC and resume this session?')) return;
          api<{ note?: string; error?: string | null }>('/api/launch', { method: 'POST', body: { resumeId: s.id, mode: 'terminal', harness: 'codex' } })
            .then((r) => {
              toast(r?.note || 'Codex opened in Windows Terminal');
              inv('live', 'overview');
            })
            .catch((e) => toast(e.message, true));
        },
      },
      secondary: [copyResume],
      note: null,
    };
  }

  if (harness === 'gemini') {
    return { primary: { ...copyResume, short: 'Copy resume command' }, secondary: [], note: 'Gemini resumes the latest chat in that folder' };
  }

  const next = s.digest?.nextStep && s.digest.status !== 'done' && s.digest.status !== 'abandoned' ? s.digest.nextStep : '';
  return {
    primary: {
      key: 'resume',
      label: 'Resume',
      icon: <Play />,
      title: 'Continue this conversation',
      onClick: () => openNewSession({ resumeId: s.id, prompt: next ? `Let's continue. Next step: ${next}` : '' }),
    },
    secondary: [
      {
        key: 'fork',
        label: 'Fork',
        icon: <GitFork />,
        title: 'Start a new session from this conversation, keeping the original untouched',
        onClick: () => openNewSession({ resumeId: s.id, fork: true }),
      },
    ],
    note: null,
  };
}

function ActionButton({ a, variant, size, block }: { a: SessionAction; variant: 'primary' | 'secondary' | 'ghost'; size: 'sm' | 'md'; block?: boolean }) {
  const cls = ['btn', variant !== 'secondary' && variant, size === 'sm' && 'sm', a.danger && variant !== 'primary' && 'danger', a.desktopOnly && 'hide-mobile', block && 'grow'].filter(Boolean).join(' ');
  if (a.href)
    return (
      <a className={cls} href={a.href} target="_blank" rel="noreferrer" title={a.title}>
        {a.icon}
        {a.label}
      </a>
    );
  return (
    <button type="button" className={cls} onClick={a.onClick} title={a.title}>
      {a.icon}
      {a.label}
    </button>
  );
}

/** Desktop: buttons in the header (and in the compact sticky header). All secondary: the shell's New session
 *  is the one primary button on desktop (DESIGN §2.6); only the phone bar below fills its first action. */
export function HeaderActions({ set, size = 'md' }: { set: ActionSet; size?: 'sm' | 'md' }) {
  return (
    <div className="sx-actions">
      {set.note && !set.primary && <span className="small faint">{set.note}</span>}
      {set.primary && <ActionButton a={set.primary} variant="secondary" size={size} />}
      {set.secondary.map((a) => (
        <ActionButton key={a.key} a={a} variant="secondary" size={size} />
      ))}
    </div>
  );
}

/** Phone: fixed bar above the tab bar. The first action fills the width. */
export function PhoneActionBar({ set }: { set: ActionSet }) {
  const secondary = set.secondary.filter((a) => !a.desktopOnly);
  if (!set.primary && !secondary.length && !set.note) return null;
  return (
    <>
      <div className="sx-bar-spacer hide-desktop" aria-hidden="true" />
      <div className="sx-bar hide-desktop" role="toolbar" aria-label="Session actions">
        {set.primary ? (
          set.primary.href ? (
            <a className="btn primary grow" href={set.primary.href} target="_blank" rel="noreferrer">
              {set.primary.icon}
              {set.primary.short || set.primary.label}
            </a>
          ) : (
            <button type="button" className="btn primary grow" onClick={set.primary.onClick}>
              {set.primary.icon}
              {set.primary.short || set.primary.label}
            </button>
          )
        ) : (
          set.note && <span className="small faint grow">{set.note}</span>
        )}
        {secondary.map((a) => (
          <button key={a.key} type="button" className={`btn${a.danger ? ' danger' : ''}`} onClick={a.onClick} title={a.title} aria-label={a.label}>
            {a.icon}
            {a.short || a.label}
          </button>
        ))}
      </div>
    </>
  );
}
