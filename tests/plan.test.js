// Today's plan + suggested-task triage (server/routes/plan.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PILOTAGE_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'pilotage-plan-'));
const { getWorkStore } = await import('../server/work/store.js');
const { default: workRoutes } = await import('../server/routes/work.js');
const { default: planRoutes, expireSuggestions } = await import('../server/routes/plan.js');
const { isoDay } = await import('../server/util.js');

const DAY = 86400e3;
const P = '/home/u/shop';

function harness({ daily = null } = {}) {
  const routes = [];
  let overviewFn = null;
  const proj = { id: 'p1', path: P, name: 'shop', workspace: null };
  const stateData = {};
  const ctx = {
    index: { get: () => null },
    registry: { projects: new Map([[P, proj]]), byId: (id) => (id === 'p1' ? proj : null), projectOfSession: () => null },
    store: { project: () => ({}), session: () => ({}), settings: { ai: { enabled: false }, launch: {} }, data: stateData, save() {} },
    live: {},
    ai: { on() {}, state: { blocks: {}, projects: {}, daily } },
    views: { sessionTitle: () => null, lastActivity: () => 0 },
    broadcast() {},
    json: (res, body, status = 200) => Object.assign(res, { status, body }),
    fail: (res, status, error) => Object.assign(res, { status, body: { error } }),
    log: { info() {}, warn() {}, error() {} },
    every() {},
    extendOverview(fn) {
      if (!overviewFn) overviewFn = [];
      overviewFn.push(fn);
    },
  };
  const add = (method, pattern, fn) => routes.push({ method, rx: new RegExp(`^${pattern}$`), fn });
  workRoutes({ route: add, ctx });
  planRoutes({ route: add, ctx });
  const call = async (method, url, body = {}) => {
    for (const r of routes) {
      const m = r.method === method && r.rx.exec(url);
      if (m) {
        const res = {};
        await r.fn({ headers: {} }, res, { m, body, url: new URL(`http://x${url}`) });
        return res;
      }
    }
    throw new Error(`no route ${method} ${url}`);
  };
  const overview = () => Object.assign({}, ...overviewFn.map((f) => f()));
  return { call, overview, stateData };
}

test('expireSuggestions: only untouched AI suggestions older than 14 days, never snoozed or edited ones', () => {
  const now = Date.now();
  const mk = (id, extra) => ({ id, status: 'inbox', userEdited: false, source: { kind: 'ai' }, createdAt: now - 20 * DAY, sourceAt: now - 20 * DAY, ...extra });
  const items = [
    mk('old'),
    mk('refreshed', { sourceAt: now }), // a summary refresh bumps sourceAt; age counts from when it was first suggested
    mk('fresh', { createdAt: now - 2 * DAY, sourceAt: now }),
    mk('quiet', { createdAt: now - 2 * DAY, projectPath: '/q' }), // its project has been quiet for 20 days
    mk('edited', { userEdited: true }),
    mk('snoozed', { snoozeUntil: now + DAY }),
    mk('mine', { source: { kind: 'user' } }),
    mk('todo', { status: 'todo' }),
  ];
  const projectLastAt = (p) => (p === '/q' ? now - 20 * DAY : now);
  assert.deepEqual(expireSuggestions(items, { now, projectLastAt }), ['old', 'refreshed', 'quiet']);
  assert.equal(items[0].status, 'dropped');
  assert.equal(items[0].closedBy, 'expired');
});

test('today flag, dismiss with reason, snooze, dismiss-old + restore', async () => {
  const { call, overview } = harness();
  const work = getWorkStore();
  work.data.items = [];
  const a = work.add({ projectPath: P, title: 'Ship the invoice export', status: 'inbox', source: { kind: 'ai' } });
  const b = work.add({ projectPath: P, title: 'Check whether the deploy worked', status: 'inbox', source: { kind: 'ai' } });
  const c = work.add({ projectPath: P, title: 'Old loop', status: 'inbox', source: { kind: 'ai' }, createdAt: Date.now() - 30 * DAY, sourceAt: Date.now() - 30 * DAY });

  let r = await call('POST', `/api/work/${a.id}/today`, { on: true });
  assert.equal(r.body.status, 'todo');
  assert.equal(r.body.plannedFor, isoDay(Date.now()));
  assert.deepEqual(overview().plan.today.map((x) => x.id), [a.id]);

  r = await call('POST', `/api/work/${b.id}/dismiss`, { reason: 'snooze' });
  assert.equal(r.body.status, 'inbox');
  assert.ok(r.body.snoozeUntil > Date.now());
  assert.equal(overview().suggestedCount, 1); // only c is visible in Suggested

  r = await call('POST', `/api/work/${b.id}/dismiss`, { reason: 'duplicate' });
  assert.equal(r.body.status, 'dropped');
  assert.equal(r.body.dismissReason, 'duplicate');

  r = await call('POST', '/api/work/dismiss-old', { days: 14 });
  assert.deepEqual(r.body.ids, [c.id]);
  r = await call('POST', '/api/work/restore', { ids: [c.id] });
  assert.equal(r.body.restored, 1);
  assert.equal(work.get(c.id).status, 'inbox');

  r = await call('POST', `/api/work/${a.id}/today`, { on: false });
  assert.equal(r.body.plannedFor, null);
  assert.equal(overview().plan.today.length, 0);
});

test('focus proposals: accept creates or reuses a task flagged for today; dismiss hides it for today', async () => {
  const daily = {
    at: Date.now() - 3600e3,
    brief: {
      focus: [
        { projectPath: P, project: 'shop', title: 'Ship the invoice export', why: 'Client waits', action: 'Finish the export' },
        { projectPath: P, project: 'shop', title: 'Call the accountant about VAT', why: 'Deadline Friday', action: 'Draft the questions' },
        { projectPath: P, project: 'shop', title: 'Write the release notes', why: 'v2 is out', action: 'Write them' },
      ],
    },
  };
  const { call, overview } = harness({ daily });
  const work = getWorkStore();
  work.data.items = [];
  const existing = work.add({ projectPath: P, title: 'Ship the invoice export', status: 'inbox', source: { kind: 'ai' } });

  let ov = overview().plan;
  assert.equal(ov.proposals.length, 3);
  assert.equal(ov.proposals[0].matchId, existing.id);

  const keys = ov.proposals.map((p) => p.key);
  let r = await call('POST', `/api/plan/focus/${keys[0]}`, { action: 'accept' });
  assert.equal(r.body.id, existing.id); // reused, not duplicated
  r = await call('POST', `/api/plan/focus/${keys[1]}`, { action: 'accept' });
  assert.equal(r.body.source.kind, 'user');
  assert.equal(r.body.status, 'todo');
  r = await call('POST', `/api/plan/focus/${keys[2]}`, { action: 'dismiss' });
  assert.equal(r.body.ok, true);

  ov = overview().plan;
  assert.equal(ov.proposals.length, 0);
  assert.deepEqual(ov.today.map((x) => x.title).sort(), ['Call the accountant about VAT', 'Ship the invoice export']);
  assert.equal(work.items.length, 2);

  // He finishes the accepted task: the proposal must not come back (and can't be accepted twice).
  await call('PATCH', `/api/work/${existing.id}`, { status: 'done' });
  ov = overview().plan;
  assert.equal(ov.proposals.length, 0);
  assert.equal(work.items.length, 2);
});

test('restore and snooze are respected by expiry', () => {
  const now = Date.now();
  const it = { id: 'x', status: 'inbox', userEdited: false, source: { kind: 'ai' }, createdAt: now - 30 * DAY, restoredAt: now - DAY };
  assert.deepEqual(expireSuggestions([it], { now }), []);
  const sn = { id: 'y', status: 'inbox', userEdited: false, source: { kind: 'ai' }, createdAt: now - 9 * DAY, snoozeUntil: now - 60e3 };
  assert.deepEqual(expireSuggestions([sn], { now }), []); // back from "Not now": shown again, not dropped
  const fresh = { id: 'z', status: 'inbox', userEdited: false, source: { kind: 'ai' }, createdAt: now - DAY, projectPath: '/new' };
  assert.deepEqual(expireSuggestions([fresh], { now, projectLastAt: () => 0 }), []); // unknown activity ≠ quiet
});
