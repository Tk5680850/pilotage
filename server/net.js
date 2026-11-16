// Phone access: the PC's Wi-Fi / NetBird addresses, the Windows-side forwarder and its firewall rule.
//
// The forwarder runs as %LOCALAPPDATA%\Pilotage\pilotage-forwarder.exe, a copy of Windows node.exe.
// A separate exe matters: Windows Firewall already has *block* rules for node.exe on Public networks
// (home Wi-Fi and VPN adapters are often "Public"), and block rules always win over allow rules.
// Allowing it needs admin rights once: enablePhoneAccess() opens a UAC prompt that adds one narrow rule
// (TCP 4748, only from the local subnet and the NetBird/Tailscale ranges).
//
// Linux/macOS (no Windows forwarder): PILOTAGE_LAN_BIND=0.0.0.0 makes the phone listener bind LAN_PORT directly,
// gated per connection by lanConnectionAllowed() (same idea as the forwarder). Off by default. See docs/PHONE.md.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IPCONFIG_EXE, WIN_PILOTAGE_DIR, LAN_PORT, LAN_INTERNAL_PORT, PORT, WIN_NODE, POWERSHELL_EXE, ROOT } from './config.js';
import { run, readJSONSync, log } from './util.js';
import { tlsStatus } from './tls.js';

export const RULE_NAME = 'Pilotage phone access';
const NETSH = '/mnt/c/Windows/System32/netsh.exe';
const TASKKILL = '/mnt/c/Windows/System32/taskkill.exe';
const FWD_EXE = WIN_PILOTAGE_DIR ? path.join(WIN_PILOTAGE_DIR, 'pilotage-forwarder.exe') : null;
const FWD_JS = WIN_PILOTAGE_DIR ? path.join(WIN_PILOTAGE_DIR, 'forwarder.js') : null;
const FWD_CFG = WIN_PILOTAGE_DIR ? path.join(WIN_PILOTAGE_DIR, 'forwarder-config.json') : null;

/** Windows tools are reachable (WSL): phones come through the Windows forwarder. */
const WIN_SIDE = fs.existsSync(IPCONFIG_EXE);
/** Opt-in direct bind for Linux/macOS (or WSL in mirrored networking mode): '0.0.0.0', '::', or one address. */
export const LAN_BIND = (process.env.PILOTAGE_LAN_BIND || '').trim();
/** 'bind': the LAN listener is on LAN_BIND:LAN_PORT. 'forwarder': Windows forwarder → 127.0.0.1:LAN_INTERNAL_PORT. 'off'. */
export const LAN_MODE = LAN_BIND ? 'bind' : WIN_SIDE ? 'forwarder' : 'off';
/** NetBird and Tailscale both hand out addresses in the CGNAT range. */
const VPN_CIDRS = ['100.64.0.0/10'];

/** Current Wi-Fi network name (SSID) of the PC, or null. */
export async function currentSsid() {
  const r = await run(NETSH, ['wlan', 'show', 'interfaces'], { timeout: 10000, cwd: '/mnt/c/' });
  let ssid = null;
  let connected = false;
  for (const raw of r.stdout.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (/^State\s*:/i.test(line)) connected = /:\s*connected/i.test(line);
    const m = /^SSID\s*:\s*(.+)$/i.exec(line);
    if (m) ssid = m[1].trim();
  }
  return connected ? ssid : null;
}

export function readForwarderConfig() {
  return (FWD_CFG && readJSONSync(FWD_CFG, null)) || { trustedSsids: [], vpnCidrs: ['100.64.0.0/10'] };
}

/** Which networks may reach Pilotage: VPN ranges always, Wi-Fi only while on a trusted SSID. */
export async function writeForwarderConfig(patch = {}) {
  const cur = readForwarderConfig();
  const addrs = await windowsAddresses(true);
  const vpn = new Set(['100.64.0.0/10', ...(cur.vpnCidrs || [])]);
  for (const a of addrs) if (a.kind === 'netbird') vpn.add(cidrOf(a.ip, a.mask) || `${a.ip.split('.').slice(0, 2).join('.')}.0.0/16`);
  const next = { ...cur, ...patch, vpnCidrs: [...vpn], listenPort: LAN_PORT, targetPort: LAN_INTERNAL_PORT };
  next.trustedSsids = [...new Set((next.trustedSsids || []).filter((x) => typeof x === 'string' && x.length <= 64))];
  fs.mkdirSync(WIN_PILOTAGE_DIR, { recursive: true });
  fs.writeFileSync(FWD_CFG, JSON.stringify(next, null, 2));
  return next;
}

let cache = { at: 0, addrs: [] };

/** Parse `ipconfig` output into [{adapter, ip, mask, kind}] */
export async function windowsAddresses(force = false) {
  if (!force && Date.now() - cache.at < 5 * 60e3 && cache.addrs.length) return cache.addrs;
  const r = await run(IPCONFIG_EXE, [], { timeout: 10000, cwd: '/mnt/c/' });
  const addrs = [];
  let adapter = '';
  let cur = null;
  for (const raw of r.stdout.replace(/\r/g, '').split('\n')) {
    const a = /^(\S.*adapter .+):$/.exec(raw);
    if (a) {
      adapter = a[1];
      cur = null;
      continue;
    }
    const m = /IPv4 Address[ .]*: ([\d.]+)/.exec(raw);
    if (m && adapter) {
      const ip = m[1];
      let kind = 'other';
      if (/wt0|netbird/i.test(adapter)) kind = 'netbird';
      else if (/tailscale/i.test(adapter) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) kind = 'tailscale';
      else if (/wi-?fi|wireless/i.test(adapter)) kind = 'wifi';
      else if (/vEthernet|WSL|Default Switch/i.test(adapter)) kind = 'virtual';
      else if (/ethernet/i.test(adapter)) kind = 'ethernet';
      cur = { adapter: adapter.replace(/^.*adapter /, ''), ip, kind, mask: null };
      if (kind !== 'virtual') addrs.push(cur);
      continue;
    }
    const mk = /Subnet Mask[ .]*: ([\d.]+)/.exec(raw);
    if (mk && cur) cur.mask = mk[1];
  }
  const order = { wifi: 0, ethernet: 1, netbird: 2, tailscale: 3, other: 4 };
  addrs.sort((a, b) => order[a.kind] - order[b.kind]);
  cache = { at: Date.now(), addrs };
  return addrs;
}

/** Non-WSL: this machine's own interfaces, in the same shape as windowsAddresses(). */
export function localAddresses() {
  const addrs = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/^(lo|docker|br-|veth|virbr|vmnet|vboxnet|cni|flannel|podman|lxc|lxd|zt)/i.test(name)) continue;
    for (const a of list || []) {
      if (a.internal || a.family !== 'IPv4' && a.family !== 4) continue;
      let kind = 'other';
      if (/^(wt\d|netbird)/i.test(name)) kind = 'netbird';
      else if (/tailscale/i.test(name) || inCidr(a.address, '100.64.0.0/10')) kind = 'tailscale';
      else if (/^(wl|wlan|wifi)/i.test(name) || (process.platform === 'darwin' && name === 'en0')) kind = 'wifi';
      else if (/^(en|eth|eno|enp|ens)/i.test(name)) kind = 'ethernet';
      addrs.push({ adapter: name, ip: a.address, kind, mask: a.netmask || null });
    }
  }
  const order = { wifi: 0, ethernet: 1, netbird: 2, tailscale: 3, other: 4 };
  return addrs.sort((a, b) => order[a.kind] - order[b.kind]);
}

/** The addresses a phone uses to reach Pilotage: the Windows side under WSL, else this machine's interfaces. */
export async function phoneAddresses(force = false) {
  if (WIN_SIDE && !LAN_BIND) return windowsAddresses(force);
  if (WIN_SIDE) {
    // WSL with a direct bind (mirrored networking): Windows and WSL share addresses; prefer the Windows view.
    const w = await windowsAddresses(force);
    if (w.length) return w;
  }
  return localAddresses();
}

/** http and https addresses for a paired phone (same port: the LAN listener speaks both). */
export function phoneUrls(addrs) {
  return addrs.map((a) => ({ kind: a.kind, adapter: a.adapter, ip: a.ip, http: `http://${a.ip}:${LAN_PORT}`, https: `https://${a.ip}:${LAN_PORT}` }));
}

function ipToInt(ip) {
  const p = String(ip).split('.');
  if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return null;
  return p.reduce((n, x) => n * 256 + Number(x), 0);
}
function inCidr(ip, cidr) {
  const [base, bitsStr] = String(cidr).split('/');
  const bits = Number(bitsStr);
  const a = ipToInt(ip);
  const b = ipToInt(base);
  if (a === null || b === null || !(bits >= 0 && bits <= 32)) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}

let allowCache = { at: 0, cidrs: [] };
/**
 * Bind mode only: which remote addresses may open a connection. PILOTAGE_LAN_ALLOW (comma list) can narrow or widen it:
 * "vpn" = NetBird/Tailscale ranges, "lan" = the subnets this machine is on right now, or explicit IPv4 CIDRs.
 * Default "lan,vpn". Loopback is always allowed.
 */
export function lanAllowList() {
  if (Date.now() - allowCache.at < 30_000) return allowCache.cidrs;
  const spec = (process.env.PILOTAGE_LAN_ALLOW || 'lan,vpn').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const out = new Set(['127.0.0.0/8']);
  for (const item of spec) {
    if (item === 'vpn') for (const c of VPN_CIDRS) out.add(c);
    else if (item === 'lan') {
      for (const a of localAddresses()) if (a.kind !== 'netbird' && a.kind !== 'tailscale') {
        const c = cidrOf(a.ip, a.mask);
        if (c && Number(c.split('/')[1]) >= 16) out.add(c); // never a whole /8 by accident
      }
    } else if (/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(item)) out.add(item);
  }
  // NetBird/Tailscale interfaces may use a custom range: allow the interface's own subnet when "vpn" is on.
  if (spec.includes('vpn')) for (const a of localAddresses()) if (a.kind === 'netbird' || a.kind === 'tailscale') {
    const c = cidrOf(a.ip, a.mask);
    if (c) out.add(c);
  }
  allowCache = { at: Date.now(), cidrs: [...out] };
  return allowCache.cidrs;
}

/** Per-connection gate for the direct bind (the Windows forwarder does the same on its side). */
export function lanConnectionAllowed(remote) {
  const ip = String(remote || '').replace(/^::ffff:/i, '');
  if (ip === '::1') return true;
  if (ipToInt(ip) === null) return false; // other IPv6 peers: not supported
  return lanAllowList().some((c) => inCidr(ip, c));
}

export function forwarderStatus() {
  if (!WIN_PILOTAGE_DIR) return { installed: false, running: false };
  const hb = readJSONSync(path.join(WIN_PILOTAGE_DIR, 'forwarder.json'), null);
  const installed = !!FWD_JS && fs.existsSync(FWD_JS);
  const running = !!hb && Date.now() - (hb.at || 0) < 90_000;
  return {
    installed,
    running,
    port: hb?.listenPort || LAN_PORT,
    pid: running ? hb?.pid || null : null,
    lastSeen: hb?.at || 0,
    error: hb?.error || null,
    connections: hb?.connections || 0,
    refused: hb?.refused || 0,
    ssidTrusted: !!hb?.ssidTrusted,
    onWifi: !!hb?.onWifi,
    outdated: running && hb?.targetPort !== LAN_INTERNAL_PORT,
  };
}

let ruleCache = { at: 0, exists: false };
export async function firewallRuleExists(force = false) {
  if (!force && Date.now() - ruleCache.at < 60e3) return ruleCache.exists;
  const r = await run(NETSH, ['advfirewall', 'firewall', 'show', 'rule', `name=${RULE_NAME}`], { timeout: 15000, cwd: '/mnt/c/' });
  const exists = r.code === 0 && /Rule Name/i.test(r.stdout);
  ruleCache = { at: Date.now(), exists };
  return exists;
}

function syncFiles() {
  fs.mkdirSync(WIN_PILOTAGE_DIR, { recursive: true });
  const src = fs.readFileSync(path.join(ROOT, 'windows', 'forwarder.js'), 'utf8');
  if (!fs.existsSync(FWD_JS) || fs.readFileSync(FWD_JS, 'utf8') !== src) fs.writeFileSync(FWD_JS, src);
  const nodeSize = fs.statSync(WIN_NODE).size;
  if (!fs.existsSync(FWD_EXE) || fs.statSync(FWD_EXE).size !== nodeSize) fs.copyFileSync(WIN_NODE, FWD_EXE);
}

async function ensureConfig() {
  if (!fs.existsSync(FWD_CFG) || readForwarderConfig().targetPort !== LAN_INTERNAL_PORT) await writeForwarderConfig();
}

async function winPath(p) {
  return (await run('wslpath', ['-w', p])).stdout.trim();
}

/** Start the forwarder (hidden). By default only once the firewall rule exists (otherwise it can't be reached). */
export async function ensureForwarder({ force = false } = {}) {
  if (!WIN_PILOTAGE_DIR || !fs.existsSync(WIN_NODE)) return { ok: false, error: 'Windows Node.js not found' };
  try {
    syncFiles();
  } catch (e) {
    return { ok: false, error: e.message };
  }
  await ensureConfig();
  const st = forwarderStatus();
  if (st.running && !st.outdated) return { ok: true, already: true };
  if (st.outdated) await stopForwarder();
  if (!force && !(await firewallRuleExists())) return { ok: false, needsFirewall: true, error: 'Phone access is not enabled yet (needs the one-time firewall rule)' };
  const exe = await winPath(FWD_EXE);
  const js = await winPath(FWD_JS);
  const ps = `Start-Process -WindowStyle Hidden -FilePath '${exe.replace(/'/g, "''")}' -ArgumentList '"${js.replace(/'/g, "''")}"'`;
  const r = await run(POWERSHELL_EXE, ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 30000, cwd: '/mnt/c/' });
  if (r.code !== 0) {
    log.warn('forwarder start failed', r.stderr);
    return { ok: false, error: r.stderr.slice(0, 300) };
  }
  return { ok: true };
}

export async function stopForwarder() {
  const st = forwarderStatus();
  if (!st.pid) return { ok: true, already: true };
  await run(TASKKILL, ['/PID', String(st.pid), '/F'], { timeout: 15000, cwd: '/mnt/c/' });
  return { ok: true };
}

function cidrOf(ip, mask) {
  if (!ip || !mask) return null;
  const a = ip.split('.').map(Number);
  const m = mask.split('.').map(Number);
  const bits = m.reduce((n, x) => n + x.toString(2).split('1').length - 1, 0);
  return `${a.map((x, i) => x & m[i]).join('.')}/${bits}`;
}

/**
 * Opens a UAC prompt on the PC that adds the firewall rule, then starts the forwarder.
 * Scope: TCP 4748 for pilotage-forwarder.exe only, from the local subnet + VPN ranges.
 */
export async function enablePhoneAccess() {
  if (!WIN_PILOTAGE_DIR) return { ok: false, error: 'Windows profile not found' };
  syncFiles();
  const addrs = await windowsAddresses(true);
  const ssid = await currentSsid();
  const cfg = await writeForwarderConfig(ssid ? { trustedSsids: [...(readForwarderConfig().trustedSsids || []), ssid] } : {});
  // Firewall scope (defense in depth; the forwarder also checks per connection): VPN ranges + the current Wi-Fi subnet.
  const ranges = new Set(cfg.vpnCidrs);
  for (const a of addrs) if (a.kind === 'wifi' || a.kind === 'ethernet') {
    const c = cidrOf(a.ip, a.mask);
    if (c) ranges.add(c);
  }
  const exe = await winPath(FWD_EXE);
  const q = (x) => x.replace(/'/g, "''");
  // Passed inline with -EncodedCommand (no script file another program could swap before you click Yes).
  const script = [
    `$exe = '${q(exe)}'`,
    'netsh advfirewall firewall delete rule name=all program="$exe" | Out-Null',
    `netsh advfirewall firewall delete rule name="${RULE_NAME}" | Out-Null`,
    `netsh advfirewall firewall add rule name="${RULE_NAME}" dir=in action=allow program="$exe" protocol=TCP localport=${LAN_PORT} remoteip=${[...ranges].join(',')} profile=any`,
  ].join('; ');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const cmd = `Start-Process -Verb RunAs -WindowStyle Hidden -FilePath powershell.exe -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${encoded}'`;
  const r = await run(POWERSHELL_EXE, ['-NoProfile', '-NonInteractive', '-Command', cmd], { timeout: 120000, cwd: '/mnt/c/' });
  if (r.code !== 0) return { ok: false, error: /cancel|1223/i.test(r.stderr) ? 'The Windows admin prompt was cancelled' : r.stderr.slice(0, 300) };
  for (let i = 0; i < 20; i++) {
    if (await firewallRuleExists(true)) break;
    await new Promise((res) => setTimeout(res, 1500));
  }
  if (!(await firewallRuleExists(true))) return { ok: false, error: 'The firewall rule was not added (was the admin prompt accepted?)' };
  await stopForwarder();
  const f = await ensureForwarder({ force: true });
  return { ok: f.ok, ruleAdded: true, trustedSsid: ssid, forwarder: f };
}

export async function setTrustedSsid(ssid, trusted) {
  const cur = readForwarderConfig();
  const list = new Set(cur.trustedSsids || []);
  if (trusted) list.add(ssid);
  else list.delete(ssid);
  return writeForwarderConfig({ trustedSsids: [...list] });
}

export async function phoneAccessStatus() {
  const cfg = readForwarderConfig();
  const fwd = LAN_MODE === 'forwarder';
  return {
    addresses: await phoneAddresses(),
    forwarder: forwarderStatus(),
    firewallRule: fwd ? await firewallRuleExists() : false,
    lanPort: LAN_PORT,
    port: PORT,
    currentSsid: fwd ? await currentSsid() : null,
    trustedSsids: cfg.trustedSsids || [],
    vpnCidrs: cfg.vpnCidrs || [],
    // How phones get in: 'forwarder' (WSL + Windows), 'bind' (PILOTAGE_LAN_BIND), 'off'.
    mode: LAN_MODE,
    lanBind: LAN_BIND || null,
    allowList: LAN_MODE === 'bind' ? lanAllowList() : null,
    // HTTPS on the same port (server/tls.js): CA fingerprint for the "Install as an app" steps.
    tls: tlsStatus(),
  };
}
