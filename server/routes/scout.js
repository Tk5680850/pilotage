// Project scout: candidates for new projects found in the user's work. Logic: server/ai/scout.js. Contract: docs/API-SCOUT.md.
//   GET   /api/scout                 candidates (open first, newest first), lastRunAt, pending; ?projectId=
//   GET   /api/scout/input           the exact input the model would get for a project (?projectId=), for checking
//   POST  /api/scout/run             {projectId?} → one manual job, or every eligible project
//   PATCH /api/scout/:id             {status: 'dismissed' | 'new'}
//   POST  /api/scout/:id/save        → a normal idea (store.data.ideas), candidate marked 'saved'
// POST /api/spinoff and /api/projects/new (routes/work.js) take an optional scoutId and mark it 'accepted'.
// SSE kind: 'scout' (candidates or decisions changed). Overview: {scout: {newCount, top, lastRunAt}}.
import { Scout } from '../ai/scout.js';

const ID = '([a-f0-9]{12})';

export default function ({ route, ctx }) {
  const { ai, index, registry, store, json, fail, broadcast, log } = ctx;
  const scout = new Scout({ ai, index, registry, store });
  ai.scout = scout; // engine.tick schedules the automatic runs (lowest priority)
  ctx.scout = scout; // routes/work.js marks a candidate accepted after a spin-off / new project

  ai.on('changed', (e) => {
    if (e?.kind === 'scout') broadcast('scout');
  });

  ctx.extendOverview(() => ({ scout: scout.overview() }));

  const handle = (fn) => async (req, res, args) => {
    try {
      await fn(req, res, args);
    } catch (e) {
      if (e.status) return fail(res, e.status, e.message);
      log.error('scout route failed', e);
      fail(res, 500, String(e.message || e).slice(0, 300));
    }
  };

  const projectFromId = (id) => {
    const p = typeof id === 'string' ? registry.byId(id) : null;
    if (!p) throw Object.assign(new Error('Project not found'), { status: 404 });
    return p;
  };

  route('GET', '/api/scout', handle(async (req, res, { url }) => {
    const projectId = url.searchParams.get('projectId') || url.searchParams.get('project') || null;
    const pending = scout.pending().filter((p) => !projectId || p.projectId === projectId);
    json(res, {
      candidates: scout.list({ projectId, includeHidden: url.searchParams.get('hidden') === '1' }),
      lastRunAt: scout.lastRunAt(),
      pending,
      scouted: scout.scouted({ projectId }),
      settings: { enabled: !!store.settings.ai.enabled, auto: !!(store.settings.ai.enabled && store.settings.ai.autoDigest), model: store.settings.ai.scoutModel || 'sonnet' },
    });
  }));

  route('GET', '/api/scout/input', handle(async (req, res, { url }) => {
    const p = projectFromId(url.searchParams.get('projectId') || url.searchParams.get('project'));
    const { input, hash: h, chars, stats } = scout.inputFor(p);
    json(res, { projectId: p.id, projectPath: p.path, hash: h, chars, stats, due: scout.due(p), eligible: scout.eligible(p), input });
  }));

  route('POST', '/api/scout/run', handle(async (req, res, { body }) => {
    if (!store.settings.ai.enabled) return fail(res, 400, 'AI is turned off in Settings');
    let queued = 0;
    if (body.projectId) {
      const p = projectFromId(body.projectId);
      queued = scout.queueOne(p) ? 1 : 0;
    } else queued = scout.queueAll();
    broadcast('scout');
    json(res, { ok: true, queued, ...(queued ? {} : { note: process.env.PILOTAGE_NO_AI === '1' ? 'AI calls are disabled on this server' : 'Nothing to queue' }) });
  }));

  route('PATCH', `/api/scout/${ID}`, handle(async (req, res, { m, body }) => {
    const out = scout.decide(m[1], body.status);
    broadcast('scout');
    json(res, out);
  }));

  route('POST', `/api/scout/${ID}/save`, handle(async (req, res, { m }) => {
    const r = scout.save(m[1]);
    broadcast('scout');
    if (r.created) broadcast('ideas');
    json(res, { idea: r.idea, candidate: r.candidate, created: r.created });
  }));

  log.info(`scout: ${Object.keys(scout.state).length} projects scouted, ${Object.keys(scout.decisions).length} decisions`);
}
