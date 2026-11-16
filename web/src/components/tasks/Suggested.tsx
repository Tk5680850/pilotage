// Tasks › Suggested: the triage list (SIMPLIFY §6). AI suggestions are kept apart from commitments until the user decides:
// Keep (→ To do) · Today (→ To do + today) · Not now (snooze 7 d) · Dismiss with a reason (Not a task · Already done · Duplicate).
// Every row shows where it came from (project + session/summary + the outcome that raised it), never a score.
// Keys (desktop): J/K move · 1 Keep · 2 Today · 3 Dismiss (then 1–3 picks the reason) · H Not now · Enter opens.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock, CornerDownRight, Inbox, Sun, Undo2, X } from 'lucide-react';
import { Button, Card, Disclosure, EmptyState, Kbd, Meta, ProjectGlyph, Snippet } from '../ui';
import type { WorkItem } from '../../types-extra';
import { ago, fmtDate, fmtDateTime, plural } from '../../util';
import { AiTag, useProjectIndex } from './TaskBits';
import { DISMISS_REASONS, SNOOZE_DAYS, suggestedAt, useMedia, useTaskActions } from './model';
import './tasks.css';

const PAGE = 10;
/** Dismiss reasons offered as chips; "Not now" (snooze) has its own button on the row (key H). */
const CHIP_REASONS = DISMISS_REASONS.filter((r) => r.value !== 'snooze');
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The "why" of a suggestion, from its detail: the outcome of the session block that raised it, or the part of a
 *  summary step that says more than the title. '' when it would only repeat the title. */
export function suggestionReason(it: Pick<WorkItem, 'title' | 'detail'>): string {
  const paras = (it.detail || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const p of paras) {
    const m = /^From: “[^”]*”\s*[—–-]\s*([\s\S]+)$/.exec(p);
    if (m) return m[1].trim();
  }
  let text = paras.filter((p) => !/^From the project (brief|summary)\.?$/i.test(p)).join(' ');
  const t = norm(it.title);
  if (norm(text).startsWith(t)) {
    // "Do X, then confirm Y." with title "Do X" → "Then confirm Y."
    const words = it.title.trim().split(/\s+/).length;
    text = text
      .split(/\s+/)
      .slice(words)
      .join(' ')
      .replace(/^[\s,.;:–—-]+/, '');
    text = text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
  }
  // A summary step often restates the title with a detail or two ("… ($120/month)"): not a reason.
  const known = new Set(t.split(' '));
  const novel = norm(text)
    .split(' ')
    .filter((w) => w.length > 2 && !known.has(w)).length;
  return text.length >= 20 && novel >= 4 ? text : '';
}

/** Where it came from, as a link to the session (or the project summary). */
export function SuggestionSource({ it }: { it: WorkItem }) {
  const s = it.source;
  if (s.kind === 'ai' && s.sessionId)
    return s.sessionTitle ? (
      <Link to={`/sessions/${s.sessionId}`} className="sg-src" title="Open the session it came from">
        <CornerDownRight aria-hidden="true" />
        <span className="truncate">From “{s.sessionTitle}”</span>
      </Link>
    ) : (
      <span className="sg-src">
        <CornerDownRight aria-hidden="true" />
        <span className="truncate">From a session that no longer exists</span>
      </span>
    );
  if (s.kind === 'brief')
    return (
      <Link to={`/projects/${it.projectId}`} className="sg-src" title="Open the project">
        <CornerDownRight aria-hidden="true" />
        <span className="truncate">From the {it.projectName} summary</span>
      </Link>
    );
  if (s.kind === 'idea') return <span className="sg-src">From one of your ideas</span>;
  if (s.kind === 'spinoff') return <span className="sg-src">From a spin-off kickoff</span>;
  return <span className="sg-src">Added by you</span>;
}

function SuggestionRow({
  it,
  showProject,
  focused,
  chips,
  snoozed = false,
  onChips,
  onFocusRow,
  onOpen,
  rowRef,
}: {
  it: WorkItem;
  showProject: boolean;
  focused: boolean;
  chips: boolean;
  snoozed?: boolean;
  onChips: (open: boolean) => void;
  onFocusRow?: () => void;
  onOpen: () => void;
  rowRef?: (el: HTMLDivElement | null) => void;
}) {
  const { setStatus, setToday, dismiss } = useTaskActions();
  const phone = useMedia();
  const pindex = useProjectIndex();
  const project = pindex.get(it.projectId);
  const reason = suggestionReason(it);
  const reasons = CHIP_REASONS;
  return (
    <div ref={rowRef} className={`sg-row${focused ? ' focused' : ''}${chips ? ' chips-open' : ''}`} tabIndex={-1} onFocus={onFocusRow} role="listitem" aria-label={it.title}>
      <div className="sg-body">
        <button type="button" className="sg-title" onClick={onOpen} title="Open the task">
          {it.title}
        </button>
        <Meta
          className="sg-meta"
          items={[
            showProject ? (
              <span className="task-proj">
                <ProjectGlyph name={it.projectName} ws={it.workspace ?? project?.workspace} color={project?.color} size={14} />
                <span className="truncate">{it.projectName}</span>
              </span>
            ) : null,
            it.ai ? <AiTag /> : null,
            snoozed && it.snoozeUntil ? (
              <span title={fmtDateTime(it.snoozeUntil)}>Back {fmtDate(it.snoozeUntil)}</span>
            ) : (
              <span title={`Seen ${fmtDateTime(suggestedAt(it))}`}>{ago(suggestedAt(it))}</span>
            ),
          ]}
        />
        {reason && <Snippet text={reason} lines={2} className="sg-reason" />}
        <div className="sg-src-line">
          <SuggestionSource it={it} />
        </div>
      </div>
      <div className="sg-actions" role="group" aria-label="Decide">
        <Button size="sm" icon={<Check />} onClick={() => setStatus(it.id, 'todo')} title={phone ? undefined : 'Keep it in To do (1)'}>
          Keep
        </Button>
        <Button size="sm" icon={<Sun />} onClick={() => setToday(it.id, true)} title={phone ? undefined : 'Keep it and add it to today (2)'}>
          Today
        </Button>
        {snoozed ? (
          <Button size="sm" variant="ghost" icon={<Undo2 />} onClick={() => dismiss(it.id, 'unsnooze')} title="Show it in Suggested again now">
            Bring back
          </Button>
        ) : (
          <Button size="sm" variant="ghost" icon={<Clock />} onClick={() => dismiss(it.id, 'snooze')} title={`Hide it for ${SNOOZE_DAYS} days${phone ? '' : ' (H)'}`}>
            Not now
          </Button>
        )}
        <Button size="sm" variant={chips ? 'subtle' : 'ghost'} icon={<X />} onClick={() => onChips(!chips)} aria-expanded={chips} title={phone ? undefined : 'Dismiss (3)'}>
          Dismiss
        </Button>
      </div>
      {chips && (
        <div className="sg-chips" role="group" aria-label="Why dismiss it?">
          <span className="sg-chips-label">Why?</span>
          {reasons.map((r, i) => (
            <button
              key={r.value}
              type="button"
              className="sg-chip"
              title={r.hint}
              onClick={() => {
                onChips(false);
                dismiss(it.id, r.value);
              }}
            >
              {r.label}
              {!phone && <Kbd>{i + 1}</Kbd>}
            </button>
          ))}
          <button type="button" className="sg-chip ghost" onClick={() => onChips(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

/** The triage list. `items` = suggestions to show (already filtered); `snoozed` = hidden ones, in a fold below. */
export function SuggestedList({
  items,
  snoozed,
  showProject = true,
  active,
  onOpen,
  emptyAction,
  filtered = false,
}: {
  items: WorkItem[];
  snoozed: WorkItem[];
  showProject?: boolean;
  /** The keyboard shortcuts listen only while the tab is on screen. */
  active: boolean;
  onOpen: (id: string) => void;
  emptyAction?: React.ReactNode;
  /** a search/filter is narrowing the list (changes the empty state) */
  filtered?: boolean;
}) {
  const phone = useMedia();
  const { setStatus, setToday, dismiss } = useTaskActions();
  const sorted = useMemo(() => [...items].sort((a, b) => suggestedAt(b) - suggestedAt(a)), [items]);
  const snoozedSorted = useMemo(() => [...snoozed].sort((a, b) => (a.snoozeUntil || 0) - (b.snoozeUntil || 0)), [snoozed]);
  const [limit, setLimit] = useState(PAGE);
  const shown = sorted.slice(0, limit);
  const [focusIdx, setFocusIdx] = useState(0);
  const [kb, setKb] = useState(false);
  const [chipsFor, setChipsFor] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const idx = Math.max(0, Math.min(focusIdx, shown.length - 1));

  const focusRow = (i: number) => {
    const el = refs.current[i];
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest' });
  };
  // A decided row leaves the list; keep the keyboard on the same slot (the next suggestion moves up).
  const n = shown.length;
  const shownKey = shown.map((x) => x.id).join(',');
  useEffect(() => {
    if (phone || !kb || !n) return;
    if (document.activeElement === document.body || !document.activeElement) focusRow(Math.min(focusIdx, n - 1));
  }, [shownKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // latest values for the key handler
  const st = useRef({ shown, idx, kb, chipsFor });
  st.current = { shown, idx, kb, chipsFor };
  useEffect(() => {
    if (!active || phone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || document.querySelector('.overlay, .menu-pop')) return;
      const { shown, idx, kb, chipsFor } = st.current;
      if (!shown.length) return;
      const k = e.key.toLowerCase();
      const cur = shown[idx];
      const inList = !!listRef.current?.contains(document.activeElement);
      if (chipsFor && cur && chipsFor === cur.id) {
        if (/^[1-3]$/.test(k)) {
          e.preventDefault();
          const r = CHIP_REASONS[Number(k) - 1];
          setChipsFor(null);
          dismiss(cur.id, r.value);
          return;
        }
        if (k === 'escape') {
          e.preventDefault();
          setChipsFor(null);
          focusRow(idx);
          return;
        }
      }
      const arrow = k === 'arrowdown' || k === 'arrowup';
      if (arrow && !inList) return; // don't hijack page scrolling
      if (k === 'enter' && document.activeElement !== refs.current[idx]) return; // Enter on a button presses the button
      if (!['j', 'k', 'arrowdown', 'arrowup', '1', '2', '3', 'h', 'enter'].includes(k)) return;
      e.preventDefault();
      if (!kb) {
        // the first key only picks the first row (never acts on a row the user can't see highlighted)
        setKb(true);
        setFocusIdx(0);
        focusRow(0);
        return;
      }
      if (k === 'j' || k === 'arrowdown') {
        const i = Math.min(shown.length - 1, idx + 1);
        setFocusIdx(i);
        setChipsFor(null);
        focusRow(i);
      } else if (k === 'k' || k === 'arrowup') {
        const i = Math.max(0, idx - 1);
        setFocusIdx(i);
        setChipsFor(null);
        focusRow(i);
      } else if (k === '1') setStatus(cur.id, 'todo');
      else if (k === '2') setToday(cur.id, true);
      else if (k === '3') setChipsFor(cur.id);
      else if (k === 'h') dismiss(cur.id, 'snooze');
      else if (k === 'enter') onOpen(cur.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, phone, dismiss, setStatus, setToday, onOpen]);

  const snoozedFold =
    snoozedSorted.length > 0 ? (
      <Disclosure summary={<>{plural(snoozedSorted.length, 'snoozed suggestion')} <span className="faint">hidden with Not now</span></>} className="task-fold">
        <Card flush className="sg-list">
          {snoozedSorted.map((it) => (
            <SuggestionRow key={it.id} it={it} showProject={showProject} focused={false} snoozed chips={chipsFor === it.id} onChips={(o) => setChipsFor(o ? it.id : null)} onOpen={() => onOpen(it.id)} />
          ))}
        </Card>
      </Disclosure>
    ) : null;

  if (!sorted.length)
    return (
      <>
        <Card>
          {filtered ? (
            <EmptyState compact icon={<Inbox />} title="No suggestions match" body="Try another search or project." action={emptyAction} />
          ) : (
            <EmptyState icon={<Inbox />} title="No suggestions" body="Pilotage reads your sessions and suggests tasks here." action={emptyAction} />
          )}
        </Card>
        {snoozedFold}
      </>
    );

  return (
    <>
      {!phone && (
        <div className="sg-keys faint tiny" aria-hidden="true">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd> move · <Kbd>1</Kbd> Keep · <Kbd>2</Kbd> Today · <Kbd>3</Kbd> Dismiss · <Kbd>H</Kbd> Not now
        </div>
      )}
      <Card flush className="sg-list">
        <div ref={listRef} role="list" aria-label="Suggested tasks">
          {shown.map((it, i) => (
            <SuggestionRow
              key={it.id}
              it={it}
              showProject={showProject}
              focused={!phone && kb && i === idx}
              chips={chipsFor === it.id}
              onChips={(o) => setChipsFor(o ? it.id : null)}
              onFocusRow={() => {
                setFocusIdx(i);
                setKb(true);
              }}
              onOpen={() => onOpen(it.id)}
              rowRef={(el) => (refs.current[i] = el)}
            />
          ))}
        </div>
        {sorted.length > limit && (
          <div className="task-more-row">
            <button type="button" className="task-more" onClick={() => setLimit(sorted.length)}>
              Show {sorted.length - limit} more
            </button>
          </div>
        )}
      </Card>
      {snoozedFold}
    </>
  );
}
