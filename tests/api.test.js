// Starts a real server on a spare port with a temp data dir (no AI, no forwarder).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';

const PORT = 4851 + 2 * Math.floor(Math.random() * 40); // LAN listener uses PORT - 1
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'pilotage-api-'));
// A fake home with one project, so the server never scans (or depends on) the real home folder or Windows profile.
const FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'pilotage-api-home-'));
fs.mkdirSync(path.join(FAKE_HOME, 'acme', 'shop'), { recursive: true });
fs.writeFileSync(path.join(FAKE_HOME, 'acme', 'shop', 'CLAUDE.md'), '# Shop\n');
const FAKE_WIN_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'pilotage-api-winhome-'));
let proc;
let cookie = '';
let key = '';
const LAN = PORT - 1;
const base = `http://127.0.0.1:${PORT}`;

async function waitUp() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${base}/healthz`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}

before(async () => {
  proc = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, HOME: FAKE_HOME, PILOTAGE_WIN_HOME: FAKE_WIN_HOME, PILOTAGE_DATA: DATA, PILOTAGE_PORT: String(PORT), PILOTAGE_LAN_INTERNAL_PORT: String(PORT - 1), PILOTAGE_NO_AI: '1', PILOTAGE_NO_FORWARDER: '1' }, stdio: 'ignore' });
  await waitUp();
  key = JSON.parse(fs.readFileSync(path.join(DATA, 'secrets.json'), 'utf8')).desktopKey;
  const lc = await fetch(`${base}/api/auth/login-code`, { method: 'POST', headers: { 'X-Pilotage-Key': key, 'X-Pilotage': '1', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(lc.status, 200);
  const code = new URL((await lc.json()).url).searchParams.get('c');
  const r = await fetch(`${base}/auth/login?c=${code}`, { redirect: 'manual' });
  assert.equal(r.status, 302);
  cookie = r.headers.get('set-cookie').split(';')[0];
});
after(() => proc?.kill());

const get = (p, h = {}) => fetch(base + p, { headers: { cookie, ...h } });
const post = (p, body, h = {}) => fetch(base + p, { method: 'POST', headers: { cookie, 'X-Pilotage': '1', 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body) });

test('unauthenticated requests are refused', async () => {
  assert.equal((await fetch(`${base}/api/overview`)).status, 401);
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 401);
  const body = await page.text();
  assert.match(body, /isn't paired/);
  // The page re-checks by itself (a phone may leave the cookie off the first request) via a public, data-free script.
  assert.match(body, /<script src="\/pair-recheck\.js"><\/script>/);
  const js = await fetch(`${base}/pair-recheck.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  assert.match(await js.text(), /\/api\/bootstrap\?recheck=1/);
  assert.equal((await fetch(`${base}/api/bootstrap?recheck=1`)).status, 401);
  assert.equal((await fetch(`${base}/auth/desktop?k=wrong`, { redirect: 'manual' })).status, 410);
  assert.equal((await fetch(`${base}/auth/pair?c=wrong`, { redirect: 'manual' })).status, 403);
});

test('not-paired re-check: a paired device gets bootstrap, so the page reloads into the app', async () => {
  const r = await get('/api/bootstrap?recheck=1');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie') || '', /SameSite=Lax/);
  assert.notEqual((await get('/')).status, 401); // the app shell (200), or 503 when web/dist isn't built (CI)
});

test('DNS rebinding and CSRF protections', async () => {
  const status = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/api/overview', headers: { host: 'evil.example', cookie } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 421);
  const noHeader = await fetch(`${base}/api/ideas`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: '{"text":"x"}' });
  assert.equal(noHeader.status, 403);
  const form = await fetch(`${base}/api/ideas`, { method: 'POST', headers: { cookie, 'X-Pilotage': '1', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'text=x' });
  assert.equal(form.status, 415);
});

test('core read endpoints work', async () => {
  for (const p of ['/api/bootstrap', '/api/overview', '/api/projects', '/api/sessions?limit=5', '/api/live', '/api/ideas', '/api/ai', '/api/settings', '/api/timeline', '/api/portfolio', '/api/devices']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    await r.json();
  }
});

test('ideas CRUD', async () => {
  const r = await post('/api/ideas', { text: 'Test idea from the test suite' });
  assert.equal(r.status, 200);
  const idea = await r.json();
  const del = await fetch(`${base}/api/ideas/${idea.id}`, { method: 'DELETE', headers: { cookie, 'X-Pilotage': '1' } });
  assert.equal(del.status, 200);
});

test('launch refuses unknown projects and folders', async () => {
  assert.equal((await post('/api/launch', { projectId: '0000000000', mode: 'background' })).status, 404);
  assert.equal((await post('/api/launch', { mode: 'background' })).status, 400);
});

test('docs endpoint only serves listed documents', async () => {
  let projects = [];
  for (let i = 0; i < 60 && !projects.length; i++) {
    projects = (await (await get('/api/projects')).json()).projects;
    if (!projects.length) await new Promise((r) => setTimeout(r, 500));
  }
  const p = projects[0];
  assert.ok(p, 'projects discovered');
  const r = await get(`/api/projects/${p.id}/doc?path=${encodeURIComponent('/etc/passwd')}`);
  assert.equal(r.status, 403);
  const r2 = await get(`/api/projects/${p.id}/doc?path=${encodeURIComponent(path.join(FAKE_HOME, '.claude/.credentials.json'))}`);
  assert.equal(r2.status, 403);
});

test('pairing code is single-use', async () => {
  const r = await post('/api/devices/pair', {});
  assert.equal(r.status, 200);
  const { urls, primary } = await r.json();
  const code = new URL(primary).searchParams.get('c');
  const first = await fetch(`${base}/auth/pair?c=${code}`, { redirect: 'manual' });
  assert.equal(first.status, 302);
  const again = await fetch(`${base}/auth/pair?c=${code}`, { redirect: 'manual' });
  assert.equal(again.status, 403);
  assert.ok(Array.isArray(urls));
});

function lanRequest(p, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: LAN, path: p, method, headers: { host: '192.168.1.50:4748', ...headers } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('LAN listener: no master key, no PC-only actions, no localhost hosts', async () => {
  const k = await lanRequest('/api/overview', { headers: { 'X-Pilotage-Key': key } });
  assert.equal(k.status, 401);
  const asLocal = await lanRequest('/api/overview', { headers: { host: 'localhost:4747', cookie } });
  assert.equal(asLocal.status, 421);
  const ok = await lanRequest('/api/overview', { headers: { cookie } });
  assert.equal(ok.status, 200);
  const pair = await lanRequest('/api/devices/pair', { method: 'POST', headers: { cookie, 'X-Pilotage': '1', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(pair.status, 403);
  const login = await lanRequest('/api/auth/login-code', { method: 'POST', headers: { cookie, 'X-Pilotage': '1', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(login.status, 403);
});

test('desktop login codes do not work from the LAN listener', async () => {
  const lc = await fetch(`${base}/api/auth/login-code`, { method: 'POST', headers: { 'X-Pilotage-Key': key, 'X-Pilotage': '1', 'Content-Type': 'application/json' }, body: '{}' });
  const code = new URL((await lc.json()).url).searchParams.get('c');
  const r = await lanRequest(`/auth/login?c=${code}`);
  assert.equal(r.status, 403);
});

test('failed pairing attempts cannot lock out a valid code forever', async () => {
  for (let i = 0; i < 5; i++) await lanRequest('/auth/pair?c=junk');
  const r = await post('/api/devices/pair', {});
  const code = new URL((await r.json()).primary).searchParams.get('c');
  const ok = await fetch(`${base}/auth/pair?c=${code}`, { redirect: 'manual' });
  assert.equal(ok.status, 302);
});
