// Small shared helpers: JSON persistence, process execution, text utilities.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile, spawn } from 'node:child_process';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const yieldNow = () => new Promise((r) => setImmediate(r));

export function readJSONSync(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function readJSON(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Write JSON atomically (tmp file + rename) so a crash never leaves a half-written file. */
export function writeJSONSync(file, data, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), mode ? { mode } : undefined);
  fs.renameSync(tmp, file);
}

export async function writeJSON(file, data, mode) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data), mode ? { mode } : undefined);
  await fsp.rename(tmp, file);
}

/**
 * Run a program without a shell. Resolves {code, stdout, stderr}; never rejects
 * (errors become code -1) so callers can degrade gracefully.
 */
export function run(cmd, args = [], opts = {}) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: opts.timeout ?? 15000, maxBuffer: opts.maxBuffer ?? 32 * 1024 * 1024, cwd: opts.cwd, env: opts.env, windowsHide: true },
      (err, stdout, stderr) => {
        resolve({
          code: err ? (typeof err.code === 'number' ? err.code : -1) : 0,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? '') + (err && typeof err.code !== 'number' ? String(err.message) : ''),
        });
      },
    );
  });
}

// Process groups of runWithInput children still running (stopped if Pilotage exits first).
const liveGroups = new Set();
let exitHookSet = false;
function killGroup(pgid, sig) {
  try {
    process.kill(-pgid, sig);
  } catch {}
}

/**
 * Run with stdin input. Never rejects (errors become code -1). `timeout` is a real deadline: the child runs in
 * its own process group, which gets SIGTERM, then SIGKILL after `killGrace` ms, and the call resolves even if
 * the CLI ignores signals or a grandchild still holds stdout open.
 */
export function runWithInput(cmd, args, input, opts = {}) {
  return new Promise((resolve) => {
    let out = '';
    let errOut = '';
    let note = '';
    let settled = false;
    let stopping = false;
    let timedOut = false;
    const timers = [];
    const group = process.platform !== 'win32';
    const grace = opts.killGrace ?? 5000;
    const timeout = opts.timeout ?? 180000;
    let child;
    try {
      child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, stdio: ['pipe', 'pipe', 'pipe'], detached: group });
    } catch (e) {
      resolve({ code: -1, stdout: '', stderr: String(e.message) });
      return;
    }
    const pid = child.pid;
    if (group && pid) {
      liveGroups.add(pid);
      if (!exitHookSet) {
        exitHookSet = true;
        process.on('exit', () => {
          for (const g of liveGroups) killGroup(g, 'SIGTERM');
        });
      }
    }
    const signal = (sig) => {
      if (group && pid) killGroup(pid, sig);
      else child.kill(sig);
    };
    const finish = (code, hard = false) => {
      if (settled) return;
      settled = true;
      for (const t of timers) clearTimeout(t);
      liveGroups.delete(pid);
      for (const st of [child.stdout, child.stderr]) {
        if (!st) continue;
        st.removeAllListeners('data');
        // After a forced stop nothing useful is left to read; otherwise just drain what a leftover grandchild writes.
        if (hard) st.destroy();
        else st.resume();
      }
      resolve({ code, stdout: out, stderr: errOut + note, ...(timedOut ? { timedOut: true } : {}) });
    };
    const stop = (why) => {
      if (stopping || settled) return;
      stopping = true;
      note = `\n${why}`;
      signal('SIGTERM');
      // Not cleared by finish(): a grandchild that ignores SIGTERM still gets the SIGKILL after the CLI itself exited.
      setTimeout(() => signal('SIGKILL'), grace).unref?.();
      timers.push(setTimeout(() => finish(-1, true), grace + 1000));
    };
    timers.push(
      setTimeout(() => {
        timedOut = true;
        stop(`Timed out after ${Math.round(timeout / 1000)} s`);
      }, timeout),
    );
    child.stdout.on('data', (d) => {
      out += d;
      if (out.length > 16 * 1024 * 1024) stop('Output over 16 MB, stopped');
    });
    child.stderr.on('data', (d) => {
      if (errOut.length < 64 * 1024) errOut += d;
    });
    child.on('error', (e) => {
      errOut += String(e.message);
      finish(-1, true);
    });
    // 'close' waits for every holder of the pipes. Once the CLI itself has exited, a background grandchild that
    // kept stdout open must not hold the call: resolve after a short drain.
    child.on('exit', (code) => {
      liveGroups.delete(pid);
      timers.push(setTimeout(() => finish(stopping ? -1 : code ?? -1), 1500));
    });
    child.on('close', (code) => finish(stopping ? -1 : code ?? -1));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

export function clip(s, n) {
  if (s == null) return '';
  s = String(s);
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

export function oneLine(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

export function hash(s, len = 16) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, len);
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Shell single-quote a string for bash. */
export function shq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

export function debounce(fn, ms) {
  let t = null;
  const d = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  d.flush = () => {
    clearTimeout(t);
    fn();
  };
  return d;
}

/** Limit concurrency for async tasks. */
export function pLimit(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

export function isoDay(ts) {
  const d = new Date(ts);
  // Local day (the user's machine timezone)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function statSafe(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

/** Is `child` equal to or inside `parent` (both absolute, normalized)? */
export function isInside(child, parent) {
  if (!child || !parent) return false;
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export const log = {
  info: (...a) => console.log(new Date().toISOString(), '[info]', ...a),
  warn: (...a) => console.warn(new Date().toISOString(), '[warn]', ...a),
  error: (...a) => console.error(new Date().toISOString(), '[error]', ...a),
};

// Mask secrets people paste into prompts (tokens, keys, passwords) before anything is stored or shown.
const SECRET_PATTERNS = [
  /(sbp_[a-f0-9]{8})[a-f0-9]{20,}/g,
  /(sk-(?:ant-|proj-)?[A-Za-z0-9]{2})[A-Za-z0-9_-]{18,}/g,
  /((?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{2})[A-Za-z0-9]{10,}/g,
  /(gh[pousr]_[A-Za-z0-9]{2})[A-Za-z0-9]{28,}/g,
  /(github_pat_[A-Za-z0-9]{2})[A-Za-z0-9_]{28,}/g,
  /(glpat-[A-Za-z0-9]{2})[A-Za-z0-9_-]{16,}/g,
  /(npm_[A-Za-z0-9]{2})[A-Za-z0-9]{30,}/g,
  /((?:AKIA|ASIA)[0-9A-Z]{2})[0-9A-Z]{14}/g,
  /(AIza[0-9A-Za-z_-]{2})[0-9A-Za-z_-]{33}/g,
  /(xox[abposr]-)[A-Za-z0-9-]{10,}/g,
  /(eyJ[A-Za-z0-9_-]{4})[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\b(re_[A-Za-z0-9]{3})[A-Za-z0-9_]{20,}/g,
  /(SG\.[A-Za-z0-9_-]{3})[A-Za-z0-9_.-]{30,}/g,
  /\b(\d{8,10}:AA)[A-Za-z0-9_-]{30,}/g, // Telegram bot token
  /\b(Bearer\s+[A-Za-z0-9]{2})[A-Za-z0-9._~+\/=-]{14,}/g,
  /([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s/]+(?=@)/gi, // scheme://user:password@host
];
// KEY=value / "key": "value" where the key name looks secret (DB_PASSWORD, STRIPE_SECRET_KEY, api_key, mot de passe…)
const KV_SECRET =
  /\b([A-Za-z0-9_.-]*(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?key|private[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|client[_-]?secret|token|mot de passe|mdp)[A-Za-z0-9_.-]*["']?\s*[:=]\s*)(["']?)([^\s"',;]{4,})\2/gi;
const PEM = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;

export function redact(text) {
  if (!text || typeof text !== 'string') return text;
  let s = text.replace(PEM, '[private key hidden]');
  for (const rx of SECRET_PATTERNS) s = s.replace(rx, (_m, keep) => `${keep}…[hidden]`);
  s = s.replace(KV_SECRET, (m, k, q, v) => (/^(true|false|null|none|undefined|required|optional|\*+|\[hidden\].*|….*)$/i.test(v) ? m : `${k}${q}[hidden]${q}`));
  return s;
}

/** Markdown → plain one-line text for snippets (bold/italics/code/links/headings/bullets removed). */
export function plain(s) {
  if (!s) return '';
  return String(s)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|\s)[*_](\S[^*_]*?)[*_](?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Older AI text says "work block" / "the block" (Pilotage's internal word). Rewrite it for display (v3 vocabulary). */
export function dejargon(s) {
  if (typeof s !== 'string' || !/block|digest/i.test(s)) return s;
  return s
    .replace(/\b(the|a|this|that|each|every|one) work block\b/gi, '$1 session')
    .replace(/\bwork blocks\b/gi, (m) => (m[0] === 'W' ? 'Sessions' : 'sessions'))
    .replace(/\bwork block\b/gi, (m) => (m[0] === 'W' ? 'Session' : 'session'))
    .replace(/\b(\d+)-(day|hour|week) block\b/gi, '$1-$2 session')
    .replace(/\b([Tt]his|[Tt]he|[Tt]hat|[Ee]ach|[Ee]very) block\b/g, '$1 session');
}
/** Same, for every string field of a (shallow or nested) object/array. Returns a copy. */
export function dejargonAll(v, depth = 0) {
  if (typeof v === 'string') return dejargon(v);
  if (depth > 4 || v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => dejargonAll(x, depth + 1));
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = /^(key|id|hash|blockKey|blocks|blockKeys|path|projectPath|sessionId)$/.test(k) ? x : dejargonAll(x, depth + 1);
  return out;
}
