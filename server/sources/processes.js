// Listening dev servers (vite, next, python http.server ...) mapped to project folders.
import fs from 'node:fs';
import { run, clip } from '../util.js';

let bootTimeMs = 0;
let clkTck = 100;
function bootTime() {
  if (bootTimeMs) return bootTimeMs;
  try {
    const m = /btime (\d+)/.exec(fs.readFileSync('/proc/stat', 'utf8'));
    if (m) bootTimeMs = Number(m[1]) * 1000;
  } catch {}
  return bootTimeMs;
}

function procStart(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const after = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const ticks = Number(after[19]);
    return bootTime() + (ticks / clkTck) * 1000;
  } catch {
    return 0;
  }
}

const IGNORE = /\.vscode-server|\/claude( |$)|\.local\/bin\/claude|copilot|adb|systemd|wslhost|containerd|dockerd|pilotage\/server/;

export async function listDevServers() {
  const r = await run('ss', ['-ltnpH'], { timeout: 5000 });
  if (r.code !== 0) return [];
  const byPid = new Map();
  for (const line of r.stdout.split('\n')) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5) continue;
    const local = cols[3];
    const port = Number(local.slice(local.lastIndexOf(':') + 1));
    const host = local.slice(0, local.lastIndexOf(':'));
    const pm = /pid=(\d+)/.exec(line);
    if (!pm || !port) continue;
    const pid = Number(pm[1]);
    if (pid === process.pid) continue;
    const e = byPid.get(pid) || { pid, ports: [], hosts: [] };
    if (!e.ports.includes(port)) e.ports.push(port);
    e.hosts.push(host);
    byPid.set(pid, e);
  }
  const out = [];
  for (const e of byPid.values()) {
    let cmd = '';
    let cwd = '';
    try {
      cmd = fs.readFileSync(`/proc/${e.pid}/cmdline`, 'utf8').split('\0').join(' ').trim();
      cwd = fs.readlinkSync(`/proc/${e.pid}/cwd`);
    } catch {
      continue;
    }
    if (IGNORE.test(cmd)) continue;
    const deleted = / \(deleted\)$/.test(cwd);
    if (deleted) cwd = cwd.replace(/ \(deleted\)$/, '');
    out.push({
      pid: e.pid,
      ports: e.ports.sort((a, b) => a - b),
      cwd,
      deleted,
      cmd: clip(cmd, 220),
      startedAt: procStart(e.pid),
      publicBind: e.hosts.some((h) => h === '*' || h === '0.0.0.0' || h === '[::]'),
    });
  }
  return out;
}

/** Stop a dev server we listed (SIGTERM only; never anything else). */
export async function stopDevServer(pid, known) {
  const p = known.find((x) => x.pid === pid);
  if (!p) return { ok: false, error: 'Not a known dev server' };
  try {
    process.kill(pid, 'SIGTERM');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
