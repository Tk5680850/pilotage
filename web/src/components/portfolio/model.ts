// Portfolio model: which text a CV entry shows (your edits > AI entry > project brief > session highlights) and the export.
import type { PortfolioOverride, PortfolioProject } from '../../types';
import { fmtMonth } from '../../util';

export type Lang = 'en' | 'fr';
export type PortfolioData = { projects: PortfolioProject[]; settings: { lang: string; header: string } };
/** edited = your text · ai = AI-written entry · brief = from the project brief · draft = session highlights · empty = nothing yet */
export type Source = 'edited' | 'ai' | 'brief' | 'draft' | 'empty';
export type Entry = { title: string; tagline: string; role: string; period: string; stack: string[]; bullets: string[]; link: string; source: Source };
export type Item = { p: PortfolioProject; e: Entry; inc: boolean };

const DAY_MS = 86400e3;
export const L: Record<Lang, { projects: string; present: string; link: string; name: string }> = {
  en: { projects: 'Projects', present: 'present', link: 'Link', name: 'English' },
  fr: { projects: 'Projets', present: 'aujourd’hui', link: 'Lien', name: 'French' },
};

export const asLang = (s: string | undefined | null): Lang => (s === 'fr' ? 'fr' : 'en');
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const shortUrl = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '');
export const isReady = (s: Source) => s === 'edited' || s === 'ai';

export function emptyOverride(include: boolean): PortfolioOverride {
  return { include, title: '', tagline: '', role: '', period: '', stack: [], bullets: [], link: '' };
}

export function hasCustom(o: PortfolioOverride | null | undefined): boolean {
  return !!o && !!(o.title || o.tagline || o.role || o.period || o.link || o.stack?.length || o.bullets?.length);
}

/** Included by default when the project has a brief or ≥ 5 prompts, unless switched off. */
export function isIncluded(p: PortfolioProject): boolean {
  if (p.portfolio) return p.portfolio.include !== false;
  return p.hasBrief || p.humanPrompts >= 5;
}

export function periodOf(p: PortfolioProject, lang: Lang): string {
  if (!p.periodEnd) return p.periodStart ? fmtMonth(p.periodStart, lang) : '';
  const ongoing = Date.now() - p.periodEnd < 30 * DAY_MS;
  const end = ongoing ? L[lang].present : fmtMonth(p.periodEnd, lang);
  if (!p.periodStart) return ongoing ? '' : end;
  const start = fmtMonth(p.periodStart, lang);
  if (!ongoing && start === end) return start;
  return `${start} – ${end}`;
}

function clean(a: string[] | null | undefined): string[] | null {
  const x = (a || []).map((s) => String(s).trim()).filter(Boolean);
  return x.length ? x : null;
}

/** What the card and the export show. Empty override fields fall through to the next source. */
export function entryOf(p: PortfolioProject, lang: Lang, withOverride = true): Entry {
  const o = withOverride ? p.portfolio : null;
  const g = p.generated?.entry;
  const b = p.briefCv;
  const source: Source = hasCustom(o) ? 'edited' : g ? 'ai' : b ? 'brief' : p.highlights.length ? 'draft' : 'empty';
  return {
    title: o?.title || g?.title || b?.title || p.name,
    tagline: o?.tagline || g?.tagline || p.oneLiner || '',
    role: o?.role || g?.role || b?.role || '',
    period: o?.period || periodOf(p, lang) || g?.period || '',
    stack: clean(o?.stack) || clean(g?.stack) || clean(p.stack) || [],
    bullets: clean(o?.bullets) || clean(g?.bullets) || clean(b?.bullets) || clean(p.highlights) || [],
    link: o?.link || p.git?.webUrl || '',
    source,
  };
}

export function haystack({ p, e }: Item): string {
  return [e.title, p.name, e.tagline, e.role, e.stack.join(' '), e.bullets.join(' '), p.workspaceName, p.displayPath, p.oneLiner || ''].join(' ').toLowerCase();
}

export function buildExport(entries: Entry[], lang: Lang, format: 'md' | 'txt', header: string): string {
  const t = L[lang];
  const md = format === 'md';
  const out: string[] = [];
  if (header.trim()) out.push(header.trim(), '');
  out.push(md ? `## ${t.projects}` : t.projects.toUpperCase(), '');
  for (const e of entries) {
    const head = e.role ? `${e.title} — ${e.role}` : e.title;
    const meta = [e.period, e.stack.join(', ')].filter(Boolean).join(' · ');
    out.push(md ? `### ${head}` : head);
    if (meta) out.push(md ? `*${meta}*` : meta);
    if (e.tagline) out.push(...(md ? ['', e.tagline] : [e.tagline]));
    if (e.bullets.length) {
      if (md) out.push('');
      for (const b of e.bullets) out.push(md ? `- ${b}` : `• ${b}`);
    }
    if (e.link) out.push(...(md ? ['', `${t.link}: [${shortUrl(e.link)}](${e.link})`] : [`${t.link}: ${e.link}`]));
    out.push('');
  }
  return `${out.join('\n').trim()}\n`;
}

export function downloadText(text: string, name: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
