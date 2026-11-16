// Portfolio dialogs: edit an entry (your text overrides the AI one) and export the CV (Markdown / plain text).
import React, { useMemo, useState } from 'react';
import { Download, FileText, RotateCcw } from 'lucide-react';
import type { PortfolioOverride, PortfolioProject } from '../../types';
import { Button, Callout, CopyButton, Field, Markdown, Modal, SegmentedControl } from '../ui';
import { plural } from '../../util';
import { Item, L, Lang, asLang, buildExport, downloadText, emptyOverride, entryOf, hasCustom, isIncluded } from './model';
import { Info } from 'lucide-react';

type Form = { title: string; tagline: string; role: string; period: string; stack: string; bullets: string; link: string };

function toForm(o: PortfolioOverride | null): Form {
  return {
    title: o?.title || '',
    tagline: o?.tagline || '',
    role: o?.role || '',
    period: o?.period || '',
    stack: (o?.stack || []).join(', '),
    bullets: (o?.bullets || []).join('\n'),
    link: o?.link || '',
  };
}

function fromForm(f: Form, include: boolean): PortfolioOverride {
  return {
    include,
    title: f.title.trim(),
    tagline: f.tagline.trim(),
    role: f.role.trim(),
    period: f.period.trim(),
    stack: f.stack
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20),
    bullets: f.bullets
      .split(/\r?\n/)
      .map((s) => s.replace(/^\s*[-*•–]\s+/, '').trim())
      .filter(Boolean)
      .slice(0, 10),
    link: f.link.trim(),
  };
}

export function EditModal({ p, lang, onClose, onSave }: { p: PortfolioProject; lang: Lang; onClose: () => void; onSave: (o: PortfolioOverride) => Promise<boolean> }) {
  const fb = entryOf(p, lang, false);
  const [f, setF] = useState<Form>(() => toForm(p.portfolio));
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Form) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = ev.target.value;
    setF((prev) => ({ ...prev, [k]: v }));
  };
  const empty = !Object.values(f).some((v) => v.trim());
  const bulletCount = f.bullets.split(/\r?\n/).filter((s) => s.trim()).length;

  const fillFromCurrent = () =>
    setF((prev) => ({
      title: prev.title || fb.title,
      tagline: prev.tagline || fb.tagline,
      role: prev.role || fb.role,
      period: prev.period || fb.period,
      stack: prev.stack || fb.stack.join(', '),
      bullets: prev.bullets || fb.bullets.join('\n'),
      link: prev.link || fb.link,
    }));

  const run = async (o: PortfolioOverride) => {
    setBusy(true);
    const ok = await onSave(o);
    setBusy(false);
    if (ok) onClose();
  };
  const reset = () => {
    if (!window.confirm('Drop your edits for this entry and go back to the written version?')) return;
    run(emptyOverride(isIncluded(p)));
  };

  return (
    <Modal
      wide
      title={`Edit entry · ${p.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" icon={<RotateCcw />} className="cv-reset" onClick={reset} disabled={busy || !hasCustom(p.portfolio)} title="Clear your edits">
            Reset
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => run(fromForm(f, isIncluded(p)))}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="modal-body"
        onSubmit={(ev) => {
          ev.preventDefault();
          run(fromForm(f, isIncluded(p)));
        }}
      >
        <div className="cv-edit-intro">
          <p className="hint">Empty fields keep the written text shown in grey. Anything you type wins, in both languages.</p>
          <Button size="sm" icon={<FileText />} onClick={fillFromCurrent} disabled={busy}>
            Start from the current text
          </Button>
        </div>
        <Field label="Title" htmlFor="pf-title">
          <input id="pf-title" className="input" maxLength={120} value={f.title} onChange={set('title')} placeholder={fb.title} />
        </Field>
        <div className="grid-2">
          <Field label="Role" htmlFor="pf-role">
            <input id="pf-role" className="input" maxLength={120} value={f.role} onChange={set('role')} placeholder={fb.role || 'Solo developer'} />
          </Field>
          <Field label="Period" htmlFor="pf-period">
            <input id="pf-period" className="input" maxLength={60} value={f.period} onChange={set('period')} placeholder={fb.period || 'Mar 2025 – present'} />
          </Field>
        </div>
        <Field label="Tagline" htmlFor="pf-tagline">
          <input id="pf-tagline" className="input" maxLength={240} value={f.tagline} onChange={set('tagline')} placeholder={fb.tagline || 'What it is and who it is for, in one sentence'} />
        </Field>
        <Field label="Stack" htmlFor="pf-stack" hint="Comma separated, up to 20.">
          <input id="pf-stack" className="input" value={f.stack} onChange={set('stack')} placeholder={fb.stack.join(', ') || 'React, Node.js, PostgreSQL'} />
        </Field>
        <Field
          label="Bullets"
          htmlFor="pf-bullets"
          hint={
            <span className={bulletCount > 10 ? 'tone-amber' : undefined}>
              One per line, up to 10{bulletCount > 0 ? ` · ${bulletCount} written` : ''}
              {bulletCount > 10 ? ' (only the first 10 are kept)' : ''}.
            </span>
          }
        >
          <textarea id="pf-bullets" className="textarea" rows={7} value={f.bullets} onChange={set('bullets')} placeholder={fb.bullets.join('\n') || 'One achievement per line'} />
        </Field>
        <Field label="Link" htmlFor="pf-link">
          <input id="pf-link" className="input" type="url" maxLength={300} value={f.link} onChange={set('link')} placeholder={fb.link || 'https://github.com/you/project'} />
        </Field>
        {empty && hasCustom(p.portfolio) && <div className="hint">All fields are empty: saving is the same as resetting.</div>}
      </form>
    </Modal>
  );
}

export function ExportModal({
  items,
  lang,
  header,
  initialFormat = 'md',
  onClose,
  onSaveHeader,
}: {
  items: Item[];
  lang: Lang;
  header: string;
  initialFormat?: 'md' | 'txt';
  onClose: () => void;
  onSaveHeader: (h: string) => void;
}) {
  const [format, setFormat] = useState<'md' | 'txt'>(initialFormat);
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [hdr, setHdr] = useState(header);
  const text = useMemo(
    () =>
      buildExport(
        items.map((x) => x.e),
        lang,
        format,
        hdr,
      ),
    [items, lang, format, hdr],
  );
  const otherLang = items.filter((x) => x.p.generated && asLang(x.p.generated.lang) !== lang && !hasCustom(x.p.portfolio)).length;
  const drafts = items.filter((x) => x.e.source === 'draft' || x.e.source === 'empty' || x.e.source === 'brief').length;
  const ext = format === 'md' ? 'md' : 'txt';
  const commitHeader = () => {
    if (hdr !== header) onSaveHeader(hdr);
  };
  const close = () => {
    commitHeader();
    onClose();
  };
  return (
    <Modal
      wide
      title={`Export · ${plural(items.length, 'project')} · ${L[lang].name}`}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close} className="cv-reset">
            Close
          </Button>
          <CopyButton text={text} label="Copy" small={false} />
          <Button
            variant="primary"
            icon={<Download />}
            onClick={() => {
              commitHeader();
              downloadText(text, `portfolio-${lang}.${ext}`, format === 'md' ? 'text/markdown' : 'text/plain');
            }}
          >
            Download .{ext}
          </Button>
        </>
      }
    >
      <div className="modal-body">
        <div className="cluster">
          <SegmentedControl
            label="Format"
            value={format}
            onChange={setFormat}
            options={[
              { value: 'md', label: 'Markdown' },
              { value: 'txt', label: 'Plain text', title: 'For Word, LinkedIn or an application form' },
            ]}
          />
          {format === 'md' && (
            <SegmentedControl
              size="sm"
              label="View"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'preview', label: 'Preview' },
                { value: 'source', label: 'Source' },
              ]}
            />
          )}
        </div>
        {(otherLang > 0 || drafts > 0) && (
          <Callout tone="warn" icon={<Info />} title={drafts > 0 ? `${plural(drafts, 'entry', 'entries')} not written yet` : 'Mixed languages'}>
            {drafts > 0 && `${drafts === 1 ? 'It shows' : 'They show'} text taken from project summaries or session highlights. Write ${drafts === 1 ? 'it' : 'them'} with AI (or edit ${drafts === 1 ? 'it' : 'them'}) for a polished CV. `}
            {otherLang > 0 &&
              `${plural(otherLang, 'entry', 'entries')} ${otherLang === 1 ? 'was' : 'were'} written in another language; rewrite ${otherLang === 1 ? 'it' : 'them'} in ${L[lang].name}.`}
          </Callout>
        )}
        <Field label="Intro (optional)" htmlFor="pf-header" hint="Added at the top and saved for next time.">
          <textarea
            id="pf-header"
            className="textarea"
            rows={3}
            value={hdr}
            onChange={(ev) => setHdr(ev.target.value)}
            onBlur={commitHeader}
            placeholder={format === 'md' ? '# Your Name\nFull-stack developer, one or two lines about you' : 'Your name, title, and one or two lines about you'}
          />
        </Field>
        {format === 'md' && mode === 'preview' ? (
          <div className="cv-export cv-export-preview">
            <Markdown text={text} />
          </div>
        ) : (
          <pre className="cv-export" tabIndex={0} aria-label="Export text">
            {text}
          </pre>
        )}
      </div>
    </Modal>
  );
}
