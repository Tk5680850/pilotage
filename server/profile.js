// Who Pilotage works for: the name used in AI prompts, task-title cleanup and the Home greeting.
// Settings → General → "Your name" (settings.profile.name). Empty = the first word of `git config --global user.name`,
// else the login name ($USER) capitalized.
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { getStore } from './store.js';

let detected = null;

function tidy(s) {
  return String(s || '')
    .replace(/[^\p{L}\p{N} .'’-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

/** The default name when Settings has none (computed once). */
export function detectedName() {
  if (detected !== null) return detected;
  let n = '';
  try {
    const full = execFileSync('git', ['--no-optional-locks', 'config', '--global', 'user.name'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
    n = tidy(full).split(' ')[0] || '';
  } catch {}
  if (!n) {
    let u = process.env.USER || process.env.LOGNAME || '';
    if (!u) {
      try {
        u = os.userInfo().username;
      } catch {}
    }
    u = tidy(u).split(' ')[0] || '';
    n = u ? u.charAt(0).toUpperCase() + u.slice(1) : '';
  }
  detected = n || 'User';
  return detected;
}

/** The configured name (settings.profile.name), else detectedName(). `settings` defaults to the live state store. */
export function userName(settings) {
  let s = settings;
  if (!s) {
    try {
      s = getStore().settings;
    } catch {
      s = null;
    }
  }
  return tidy(s?.profile?.name) || detectedName();
}

/** The name as an escaped regex source (task-title cleanup matches it as a sentence subject). */
export function nameRxSource(name = userName()) {
  return String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
