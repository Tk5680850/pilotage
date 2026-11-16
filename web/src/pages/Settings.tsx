// Settings: phone & security, AI, sources & accounts, new-session defaults, projects & scanning, name & appearance, about.
// Desktop: sticky section index on the left (jump list + scroll spy) + sections on the right. Rarely used sections
// start folded to one line with their status (the page used to be a 6000px scroll); a click on the header or on the
// index opens them, and what you open is remembered on this device. Phone: each section collapses into a tappable
// row with a one-line status, so the page opens as a short menu.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, FolderSearch, Info, Layers, Palette, Rocket, ShieldCheck, Sparkles } from 'lucide-react';
import { useBootstrap, useSettings } from '../api';
import { ErrorBox, LoadingCard, PageHeader } from '../components/ui';
import { useIsPhone, usePatchSettings } from '../components/settings/common';
import { PhoneSecuritySection, usePhoneSummary } from '../components/settings/PhoneSecurity';
import { AISection, useAiSummary } from '../components/settings/AISection';
import { SourcesSection, useSourcesSummary } from '../components/settings/Sources';
import { AboutSection, AppearanceSection, NewSessionsSection, ProjectsSection, sessionsSummary } from '../components/settings/General';
import { plural } from '../util';
import './Settings.css';

type SectionId = 'phone' | 'ai' | 'sources' | 'sessions' | 'projects' | 'appearance' | 'about';
const SECTIONS: { id: SectionId; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'phone', label: 'Phone & security', icon: <ShieldCheck />, description: 'How your phone reaches this PC, which devices may open Pilotage, and the desktop key.' },
  { id: 'ai', label: 'AI', icon: <Sparkles />, description: 'Who writes summaries, today’s plan, suggested tasks and CV entries, and how much of your Claude usage they may take.' },
  { id: 'sources', label: 'Sources & accounts', icon: <Layers />, description: 'The coding tools and Claude accounts Pilotage reads from.' },
  { id: 'sessions', label: 'New sessions', icon: <Rocket />, description: 'Defaults for sessions you start from Pilotage.' },
  { id: 'projects', label: 'Projects & scanning', icon: <FolderSearch />, description: 'Which folders count as projects, and what workspaces are called.' },
  { id: 'appearance', label: 'Name & appearance', icon: <Palette />, description: 'Your name for the greeting and AI summaries; light, dark, or follow the device.' },
  { id: 'about', label: 'About', icon: <Info />, description: 'Version, data folder and the pilotage command.' },
];
const isSection = (s: string): s is SectionId => SECTIONS.some((x) => x.id === s);
/** Folded by default on desktop: set once, rarely changed. */
const RARE: SectionId[] = ['sources', 'sessions', 'projects', 'about'];
const OPEN_KEY = 'pilotage.settings.open';
function loadOpen(): Partial<Record<SectionId, boolean>> {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_KEY) || 'null');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function saveOpen(v: Partial<Record<SectionId, boolean>>) {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(v));
  } catch {
    /* private mode: folding just isn't remembered */
  }
}

export default function Settings() {
  const sq = useSettings();
  const { data: boot } = useBootstrap();
  const patch = usePatchSettings();
  const s = sq.data?.settings;
  const phone = useIsPhone();
  const initial = (() => {
    const h = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    return isSection(h) ? h : null;
  })();
  const [active, setActive] = useState<SectionId>(initial || 'phone');
  const [open, setOpen] = useState<Partial<Record<SectionId, boolean>>>(initial ? { [initial]: true } : {});
  // desktop folding: rare sections closed unless opened before (remembered) or deep-linked
  const [deskOpen, setDeskOpen] = useState<Record<SectionId, boolean>>(() => {
    const saved = loadOpen();
    const out = {} as Record<SectionId, boolean>;
    for (const sec of SECTIONS) out[sec.id] = saved[sec.id] ?? !RARE.includes(sec.id);
    if (initial) out[initial] = true;
    return out;
  });
  const setDesk = (id: SectionId, on: boolean) =>
    setDeskOpen((prev) => {
      const next = { ...prev, [id]: on };
      saveOpen(next);
      return next;
    });
  const clickLock = useRef(0);

  const summaries: Record<SectionId, string> = {
    phone: usePhoneSummary(),
    ai: useAiSummary(s),
    sources: useSourcesSummary(),
    sessions: sessionsSummary(s),
    projects: s
      ? [s.scan.extraRoots.length ? plural(s.scan.extraRoots.length, 'extra folder') : 'Home folder', s.scan.hiddenPaths.length ? `${s.scan.hiddenPaths.length} hidden` : null]
          .filter(Boolean)
          .join(' · ')
      : '',
    appearance: s ? [s.profile?.name || boot?.user?.name, ({ system: 'Follows the device', light: 'Light', dark: 'Dark' } as const)[s.ui.theme]].filter(Boolean).join(' · ') : '',
    about: boot ? `Version ${boot.version}` : '',
  };

  // Deep link (#ai) on desktop: scroll once the content exists.
  useEffect(() => {
    if (!initial || phone || !s) return;
    const t = setTimeout(() => document.getElementById(initial)?.scrollIntoView({ block: 'start' }), 60);
    return () => clearTimeout(t);
  }, [initial, phone, !!s]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll spy (desktop): the active section is the last one whose top passed under the top bar.
  useEffect(() => {
    if (phone) return;
    const onScroll = () => {
      if (Date.now() - clickLock.current < 700) return;
      let cur: SectionId = 'phone';
      for (const sec of SECTIONS) {
        const el = document.getElementById(sec.id);
        if (el && el.getBoundingClientRect().top < 140) cur = sec.id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = SECTIONS[SECTIONS.length - 1].id;
      setActive(cur);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [phone, !!s]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback(
    (id: SectionId) => {
      clickLock.current = Date.now();
      setActive(id);
      history.replaceState(history.state, '', `#${id}`);
      if (!deskOpen[id]) setDesk(id, true);
      // after the section has rendered open
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    },
    [deskOpen], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Phone: one section open at a time (an accordion), so the page stays a short menu.
  const toggle = (id: SectionId) => {
    const opening = !open[id];
    setOpen(opening ? { [id]: true } : {});
    history.replaceState(history.state, '', opening ? `#${id}` : window.location.pathname);
    if (opening) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  };

  const body = (id: SectionId): React.ReactNode => {
    if (id === 'phone') return <PhoneSecuritySection />;
    if (id === 'sources') return <SourcesSection />;
    if (id === 'about') return <AboutSection />;
    if (sq.error) return <ErrorBox error={sq.error} />;
    if (!s || !sq.data) return <LoadingCard lines={3} />;
    if (id === 'ai') return <AISection s={s} patch={patch} />;
    if (id === 'sessions') return <NewSessionsSection s={s} patch={patch} />;
    if (id === 'projects') return <ProjectsSection s={s} workspaces={sq.data.workspaces || {}} patch={patch} />;
    return <AppearanceSection s={s} patch={patch} />;
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Changes save as you make them and apply to all your devices." />
      <div className="set-layout">
        {!phone && (
          <nav className="set-nav" aria-label="Settings sections">
            <div className="set-nav-label">On this page</div>
            {SECTIONS.map((sec) => (
              <a
                key={sec.id}
                href={`#${sec.id}`}
                className={`nav-item${active === sec.id ? ' active' : ''}${deskOpen[sec.id] ? '' : ' folded'}`}
                aria-current={active === sec.id ? 'true' : undefined}
                title={deskOpen[sec.id] ? undefined : `${sec.label} (folded): ${summaries[sec.id] || sec.description}`}
                onClick={(e) => {
                  e.preventDefault();
                  go(sec.id);
                }}
              >
                {sec.icon}
                {sec.label}
              </a>
            ))}
          </nav>
        )}
        <div className="set-main">
          {SECTIONS.map((sec) => {
            const isOpen = phone ? !!open[sec.id] : deskOpen[sec.id];
            return (
              <section key={sec.id} id={sec.id} className={`set-section${isOpen ? '' : ' collapsed'}`} aria-labelledby={`${sec.id}-h`}>
                {phone ? (
                  <h2 className="set-toggle-h">
                    <button type="button" className="set-toggle" aria-expanded={isOpen} aria-controls={`${sec.id}-body`} onClick={() => toggle(sec.id)}>
                      <span className="set-toggle-icon" aria-hidden="true">
                        {sec.icon}
                      </span>
                      <span className="set-toggle-text">
                        <span id={`${sec.id}-h`} className="set-toggle-title">
                          {sec.label}
                        </span>
                        {summaries[sec.id] && <span className="set-toggle-sum">{summaries[sec.id]}</span>}
                      </span>
                      <ChevronDown size={18} className="set-chev" aria-hidden="true" />
                    </button>
                  </h2>
                ) : (
                  <header className="set-head">
                    <h2 className="set-head-h">
                      <button type="button" className="set-head-btn" aria-expanded={isOpen} aria-controls={`${sec.id}-body`} onClick={() => setDesk(sec.id, !isOpen)}>
                        <span id={`${sec.id}-h`}>{sec.label}</span>
                        {!isOpen && summaries[sec.id] && <span className="set-head-sum">{summaries[sec.id]}</span>}
                        <span className="set-head-act">
                          {isOpen ? 'Hide' : 'Show'}
                          <ChevronDown size={15} className="set-chev" aria-hidden="true" />
                        </span>
                      </button>
                    </h2>
                    <p>{sec.description}</p>
                  </header>
                )}
                {isOpen && (
                  <div id={`${sec.id}-body`} className="set-body">
                    {phone && <p className="hint set-body-desc">{sec.description}</p>}
                    {body(sec.id)}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
