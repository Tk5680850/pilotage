// Pilotage LAN forwarder — runs on WINDOWS as pilotage-forwarder.exe (a copy of node.exe), no admin rights.
// Listens on 0.0.0.0:4748 and pipes allowed TCP connections to 127.0.0.1:4746, which Windows relays into WSL
// where Pilotage serves phones (that listener refuses PC-only actions like pairing or firewall changes).
//
// Who may connect (checked per connection, before any byte is forwarded):
//   - NetBird / Tailscale peers (encrypted WireGuard tunnels): always.
//   - Wi-Fi / Ethernet neighbours: only while the PC is connected to one of the trusted Wi-Fi networks
//     (your home network), so cafés/hotels/campus Wi-Fi can never reach Pilotage.
// Config: %LOCALAPPDATA%\Pilotage\forwarder-config.json (written by Pilotage).
'use strict';
const net = require('net');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const dir = path.join(process.env.LOCALAPPDATA || __dirname, 'Pilotage');
const hbFile = path.join(dir, 'forwarder.json');
const logFile = path.join(dir, 'forwarder.log');
const cfgFile = path.join(dir, 'forwarder-config.json');

let cfg = { listenPort: 4748, targetPort: 4746, vpnCidrs: ['100.64.0.0/10'], trustedSsids: [] };
let currentSsid = null;
let connections = 0;
let refused = 0;
let lastError = null;

function log(msg) {
  try {
    const st = fs.existsSync(logFile) ? fs.statSync(logFile) : null;
    if (st && st.size > 512 * 1024) fs.renameSync(logFile, logFile + '.1');
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`);
  } catch (_) {}
}

function loadConfig() {
  try {
    const j = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
    cfg = { ...cfg, ...j };
  } catch (_) {}
}

function ipToInt(ip) {
  const p = String(ip).split('.').map(Number);
  if (p.length !== 4 || p.some((x) => !(x >= 0 && x <= 255))) return null;
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}
function inCidr(ip, cidr) {
  const [base, bitsStr] = String(cidr).split('/');
  const bits = Number(bitsStr);
  const a = ipToInt(ip);
  const b = ipToInt(base);
  if (a === null || b === null || !(bits >= 0 && bits <= 32)) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

function pollSsid() {
  execFile('netsh', ['wlan', 'show', 'interfaces'], { windowsHide: true, timeout: 10000 }, (err, stdout) => {
    if (err) {
      currentSsid = null;
      return;
    }
    let ssid = null;
    let connected = false;
    for (const raw of String(stdout).split(/\r?\n/)) {
      const line = raw.trim();
      if (/^State\s*:/i.test(line)) connected = /:\s*connected/i.test(line);
      const m = /^SSID\s*:\s*(.+)$/i.exec(line);
      if (m) ssid = m[1].trim();
    }
    currentSsid = connected ? ssid : null;
  });
}

function allowed(remote) {
  const ip = String(remote || '').replace(/^::ffff:/, '');
  if (ip === '127.0.0.1') return true; // local test from the PC itself
  if ((cfg.vpnCidrs || []).some((c) => inCidr(ip, c))) return true;
  return !!currentSsid && (cfg.trustedSsids || []).includes(currentSsid);
}

function heartbeat() {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      hbFile,
      JSON.stringify({ pid: process.pid, listenPort: cfg.listenPort, targetPort: cfg.targetPort, at: Date.now(), connections, refused, error: lastError, ssidTrusted: !!currentSsid && (cfg.trustedSsids || []).includes(currentSsid), onWifi: !!currentSsid }),
    );
  } catch (_) {}
}

loadConfig();
pollSsid();

const server = net.createServer((client) => {
  if (!allowed(client.remoteAddress)) {
    refused++;
    client.destroy();
    return;
  }
  connections++;
  client.setNoDelay(true);
  const upstream = net.connect({ host: '127.0.0.1', port: cfg.targetPort });
  upstream.setNoDelay(true);
  const close = () => {
    client.destroy();
    upstream.destroy();
  };
  client.on('error', close);
  upstream.on('error', close);
  client.on('close', close);
  upstream.on('close', close);
  client.setTimeout(10 * 60 * 1000, close);
  client.pipe(upstream);
  upstream.pipe(client);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    log(`port ${cfg.listenPort} already in use; another forwarder is probably running. Exiting.`);
    process.exit(0);
  }
  lastError = String(e.message || e);
  log(`server error: ${lastError}`);
  heartbeat();
  setTimeout(() => process.exit(1), 500);
});

server.listen(cfg.listenPort, '0.0.0.0', () => {
  log(`listening on 0.0.0.0:${cfg.listenPort} -> 127.0.0.1:${cfg.targetPort} (pid ${process.pid})`);
  setTimeout(heartbeat, 1500);
  setInterval(() => {
    loadConfig();
    pollSsid();
    heartbeat();
  }, 20 * 1000);
});
