// Read-only git inspection. Always --no-optional-locks so we never take index.lock
// while the user's own sessions are committing.
import fs from 'node:fs';
import path from 'node:path';
import { run, pLimit, clip } from '../util.js';

const limit = pLimit(4);
// Repos found on disk are untrusted: a repo's own config could make `git status` run commands
// (core.fsmonitor), so every call disables fsmonitor, hooks and pagers, and never prompts.
const SAFE = ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'core.hooksPath=/dev/null', '-c', 'core.pager=cat', '-c', 'diff.external=', '-c', 'protocol.allow=never'];
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat', GIT_EXTERNAL_DIFF: '' };
const G = (dir, args, timeout = 10000) => limit(() => run('git', [...SAFE, '-C', dir, ...args], { timeout, env: GIT_ENV }));

/** If dir is a git worktree, return {mainRoot, gitdir}; if a main repo, {mainRoot: dir}; else null. */
export function gitKind(dir) {
  const dotgit = path.join(dir, '.git');
  let st;
  try {
    st = fs.statSync(dotgit);
  } catch {
    return null;
  }
  if (st.isDirectory()) return { kind: 'repo', mainRoot: dir };
  try {
    const txt = fs.readFileSync(dotgit, 'utf8');
    const m = /gitdir:\s*(.+)/.exec(txt);
    if (!m) return null;
    const gitdir = path.resolve(dir, m[1].trim());
    const i = gitdir.indexOf(`${path.sep}.git${path.sep}worktrees${path.sep}`);
    if (i !== -1) return { kind: 'worktree', mainRoot: gitdir.slice(0, i), gitdir };
    const j = gitdir.indexOf(`${path.sep}.git${path.sep}modules${path.sep}`);
    if (j !== -1) return { kind: 'submodule', mainRoot: dir };
    return { kind: 'repo', mainRoot: dir };
  } catch {
    return null;
  }
}

export function webUrlFromRemote(remote) {
  if (!remote) return null;
  let r = remote.trim();
  let m = /^git@([^:]+):(.+?)(\.git)?$/.exec(r);
  if (m) return `https://${m[1]}/${m[2]}`;
  m = /^https?:\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(\.git)?$/.exec(r);
  if (m) return `https://${m[1]}/${m[2]}`;
  return null;
}

/** Status of one checkout (repo or worktree). */
export async function statusOf(dir) {
  const [st, last, remote, recent] = await Promise.all([
    G(dir, ['status', '--porcelain=v2', '--branch', '--untracked-files=normal']),
    G(dir, ['log', '-1', '--format=%cI%x1f%s%x1f%an']),
    G(dir, ['remote', 'get-url', 'origin']),
    G(dir, ['rev-list', '--count', '--since=30.days', 'HEAD']),
  ]);
  if (st.code !== 0) return { ok: false, error: clip(st.stderr, 200), checkedAt: Date.now() };
  let branch = null;
  let ahead = 0;
  let behind = 0;
  let upstream = null;
  let dirty = 0;
  let untracked = 0;
  for (const line of st.stdout.split('\n')) {
    if (line.startsWith('# branch.head ')) branch = line.slice(14).trim();
    else if (line.startsWith('# branch.upstream ')) upstream = line.slice(18).trim();
    else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(line);
      if (m) {
        ahead = +m[1];
        behind = +m[2];
      }
    } else if (line.startsWith('?')) untracked++;
    else if (line && !line.startsWith('#')) dirty++;
  }
  const [lastAt, lastMsg, lastAuthor] = last.stdout.trim().split('\x1f');
  return {
    ok: true,
    branch: branch === '(detached)' ? 'detached' : branch,
    upstream,
    ahead,
    behind,
    dirty,
    untracked,
    lastCommitAt: lastAt ? Date.parse(lastAt) : 0,
    lastCommitMsg: clip(lastMsg || '', 140),
    lastCommitAuthor: lastAuthor || '',
    remoteUrl: remote.code === 0 ? remote.stdout.trim() : null,
    webUrl: remote.code === 0 ? webUrlFromRemote(remote.stdout) : null,
    commits30d: Number(recent.stdout.trim()) || 0,
    checkedAt: Date.now(),
  };
}

/** Extra info for main repos: worktrees, merged branches, first commit, recent log. */
export async function repoExtras(dir) {
  const [wt, head, roots, logOut] = await Promise.all([
    G(dir, ['worktree', 'list', '--porcelain']),
    G(dir, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
    G(dir, ['rev-list', '--max-parents=0', 'HEAD']),
    G(dir, ['log', '-20', '--format=%cs%x1f%s']),
  ]);
  const worktrees = [];
  let cur = null;
  for (const line of wt.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      cur = { path: line.slice(9).trim(), branch: null, prunable: false, locked: false };
      worktrees.push(cur);
    } else if (cur && line.startsWith('branch ')) cur.branch = line.slice(7).replace('refs/heads/', '').trim();
    else if (cur && line.startsWith('detached')) cur.branch = 'detached';
    else if (cur && line.startsWith('prunable')) cur.prunable = true;
    else if (cur && line.startsWith('locked')) cur.locked = true;
  }
  const defaultBranch = head.code === 0 ? head.stdout.trim() : null; // e.g. origin/main
  let merged = [];
  if (defaultBranch) {
    const mb = await G(dir, ['branch', '--format=%(refname:short)', '--merged', defaultBranch]);
    if (mb.code === 0) merged = mb.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  }
  let firstCommitAt = 0;
  const firstSha = roots.stdout.trim().split('\n').pop();
  if (firstSha) {
    const fc = await G(dir, ['show', '-s', '--format=%cI', firstSha]);
    if (fc.code === 0) firstCommitAt = Date.parse(fc.stdout.trim()) || 0;
  }
  const recentLog = logOut.stdout
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [d, s] = l.split('\x1f');
      return { d, s: clip(s, 140) };
    });
  return { worktrees: worktrees.slice(1), defaultBranch, merged, firstCommitAt, recentLog, extrasAt: Date.now() };
}

/** Commit timestamps by the user over the last year (for the timeline). */
export async function myCommitTimes(dir, identities) {
  const args = ['log', '--since=13.months', '--all', '--no-merges', '--format=%ct%x1f%ae%x1f%an'];
  const r = await G(dir, args, 20000);
  if (r.code !== 0) return [];
  const ids = identities.map((s) => s.toLowerCase()).filter(Boolean);
  const out = [];
  for (const line of r.stdout.split('\n')) {
    if (!line) continue;
    const [ct, ae, an] = line.split('\x1f');
    if (ids.length && !ids.includes((ae || '').toLowerCase()) && !ids.includes((an || '').toLowerCase())) continue;
    out.push(Number(ct) * 1000);
  }
  return out;
}

export async function gitIdentities() {
  const [e, n] = await Promise.all([run('git', ['config', '--global', 'user.email']), run('git', ['config', '--global', 'user.name'])]);
  const ids = [e.stdout.trim(), n.stdout.trim()].filter(Boolean);
  return ids;
}
