# Project scout: API contract

The scout reads each project's record (brief, threads, work-block digests, the user's own prompts, sub-folders with their
own manifest/README, where the edits went) and proposes up to 3 **candidates**: parts of the work that deserve to
become their own project, or project ideas the user voiced but never started. An empty list is a normal result.

Server: `server/routes/scout.js` (logic in `server/ai/scout.js`). Results live in `data/ai.json` → `scout`, the user's
decisions in `data/state.json` → `scout`. Auth/CSRF is the same as every `/api/*` route: paired-device cookie;
mutating calls need `X-Pilotage: 1` and `Content-Type: application/json` (use `api()` from `src/api.ts`).
Errors are always `{ error: string }` with a 4xx/5xx status.

## When it runs

- **Automatically** (only when Settings → AI is on and automatic summaries are on), at the lowest priority of the AI
  queue: after block digests, project briefs and the daily brief. A project is scouted when it has a brief, has
  interactive work (prompts typed by the user, not automated runs) in the last 120 days, and either was never scouted, or
  its input changed **and** the last scout is more than 3 days old. At most 8 automatic scouts a day, 2 per scan.
  The usual guard applies (5-hour/7-day usage limits, call caps, pause).
- **Manually**: `POST /api/scout/run` with a `projectId` (a manual job, like "Summarize now" on a project), or
  without one ("scout all": every eligible project, as ordinary guarded jobs).
- Model: `settings.ai.scoutModel` (default `'sonnet'`; `PATCH /api/settings` accepts `haiku|sonnet|opus|fable`;
  per-provider override `providers['claude-cli'].scoutModel` like the other models). One call per project.

## Live updates (SSE)

The usual `event: change` with `data: { kinds: string[], gen }`. Scout changes use the kind **`scout`** (a scout
finished, a decision changed, a run was queued). A spin-off / new project made from a candidate also sends `scout`
(and `ideas` when its saved idea was closed). Jobs starting/finishing also send the existing `ai` / `ai-data` kinds.
Add to `KIND_TO_KEYS` in `src/api.ts`:

```ts
scout: ['scout', 'overview', 'ideas'],
// and add 'scout' to the existing `ai` entry so "pending / running" refreshes when a job starts:
ai: ['ai', 'overview', 'scout'],
```

## Types

```ts
type ScoutKind = 'spin-off' | 'idea' | 'reusable';
//   spin-off: already built (or half built) inside the folder, could live on its own (e.g. a bridge, a tool)
//   idea:     a project the user voiced in their prompts and never started
//   reusable: a piece the user's other projects would reuse (shared tool, library, template)
type ScoutStatus = 'new' | 'saved' | 'accepted' | 'dismissed';
//   new: open · saved: kept as an idea (Ideas inbox) · accepted: a project was made from it · dismissed: not wanted

interface ScoutCandidate {
  id: string;                  // 12 hex, stable: same project + close title on a later scout keeps the id
  projectId: string;           // 10 hex, same id as /api/projects (the SOURCE project it was found in)
  projectName: string;
  projectPath: string;         // absolute
  displayPath: string;         // '~/acme'
  workspace: string | null;
  registered: boolean;         // source folder still known to Pilotage
  kind: ScoutKind;
  title: string;               // proposed project name, 2-5 words, ≤ 70 chars
  pitch: string;               // one sentence: what the new project is, for whom (≤ 320)
  why: string;                 // 1-2 sentences, evidence-based (≤ 500)
  evidence: string[];          // ≤ 3 short facts/quotes with dates or folders (≤ 240 each)
  threadName: string;          // '' or exactly one thread name of the source project's brief
  firstSteps: string[];        // ≤ 3
  confidence: 'high' | 'medium' | 'low';
  at: number;                  // ms epoch: when this version was proposed (latest scout that produced it)
  firstAt: number;             // first proposed (kept across re-scouts)
  model: string | null;        // model that wrote it (null for an old candidate shown from the decision record)
  current: boolean;            // still proposed by the latest scout of its project
  status: ScoutStatus;
  decidedAt: number | null;    // when the user saved / accepted / dismissed it
  ideaId: string | null;       // the idea created by "save"
  acceptedProjectPath: string | null;  // the project made from it (status 'accepted')
  acceptedProjectId: string | null;
}

interface ScoutPending {
  projectId: string;
  projectName: string;
  projectPath: string;
  state: 'running' | 'queued' | 'due';  // due = waiting for an automatic run
  reason: string;                        // e.g. 'never scouted', 'new activity since the last scout', 'asked by you'
}
```

## Endpoints

### `GET /api/scout[?projectId=<10hex>][&hidden=1]`

```ts
{
  candidates: ScoutCandidate[];  // open ('new') first, then saved, accepted, dismissed; newest first within each
  lastRunAt: number;             // last successful scout of any project (0 = never)
  pending: ScoutPending[];       // filtered to the project when projectId is given
  scouted: ScoutRun[];           // one entry per scouted project (also those with no candidate), newest first
  settings: { enabled: boolean; auto: boolean; model: string };  // AI on; automatic runs on; scout model
}

interface ScoutRun {
  projectId: string; projectName: string; projectPath: string;
  at: number;                    // when the last scout of this project finished
  model: string | null;
  auto: boolean;                 // automatic (true) or asked for (false)
  candidates: number;            // how many it proposed (after dismissed ones were dropped)
  note: string;                  // one sentence from the model: what else it weighed and why it left it out.
                                 // Show it for an empty result: "Looked at X and Y; left out because …"
  lastError: string | null;      // the last attempt after `at` failed (shown as a small warning)
}
```

Without `projectId`, candidates of hidden projects are left out (`hidden=1` includes them). Dismissed candidates
are included (status `'dismissed'`) so the UI can offer an "undo" or a "dismissed" filter; hide them by default.

### `POST /api/scout/run` body `{ projectId?: string }`

```ts
{ ok: true; queued: number; note?: string }  // note when nothing was queued (e.g. AI disabled on this server)
```

`400` when AI is off in Settings, `404` for an unknown project. With a `projectId`: one manual job for that project
(runs even if the project is not "due"; moves an already-queued automatic run up). Without: every eligible project.
The result arrives later through SSE `scout`; poll nothing.

### `PATCH /api/scout/:id` body `{ status: 'dismissed' | 'new' }` → `ScoutCandidate`

`dismissed`: hides it for good for that project: a later scout that proposes the same or a close title (or pitch)
drops it, and the model is told it was dismissed. `new`: undoes a dismissal. `409` when going back to `new` from
`accepted`, or from `saved` while its idea still exists. `404` unknown id, `400` other status.

### `POST /api/scout/:id/save` → `{ idea: Idea; candidate: ScoutCandidate; created: boolean }`

Creates a normal idea in the Ideas inbox (`/api/ideas`): `text = "<title>: <pitch>\n\nWhy: <why>"`,
`projectPath` = the source project, `source: 'ai'`, plus `scoutId`. Marks the candidate `saved` with `ideaId`.
Idempotent (`created: false` when it was already saved). `409` when already accepted.

### Making the project: existing routes + `scoutId`

`POST /api/spinoff` and `POST /api/projects/new` (see `API-WORK.md`) accept an optional **`scoutId`**. On success the
candidate becomes `accepted` (with `acceptedProjectPath`), its saved idea (if any) is closed, the response gets
`scout: { id, status: 'accepted' }`, and the candidate's title/pitch/why/evidence go into the new CLAUDE.md as
"Original idea". An unknown `scoutId` is ignored (never blocks the creation). Suggested prefill:

- `kind` `'spin-off'` or `'reusable'` → **Spin off**: `POST /api/spinoff { fromProjectId: c.projectId, threadName:
  c.threadName || undefined, name: c.title, goal: c.pitch, scoutId: c.id, ... }` (use `dryRun: true` first, as today).
- `kind` `'idea'` → **New project**: `POST /api/projects/new { name: c.title, goal: c.pitch, workspace, scoutId: c.id }`.
  `goal` may be left out when `scoutId` is given: it defaults to the pitch.

### `GET /api/scout/input?projectId=<10hex>` (for checking / a "why this?" view)

```ts
{ projectId, projectPath, hash, chars, stats, due: { due: boolean; reason: string }, eligible: { ok: boolean; reason: string }, input: string }
```

The exact text the model would get now (prompts are already redacted: keys, passwords, pasted text removed).

## Overview extension

`GET /api/overview` gains:

```ts
scout: {
  newCount: number;            // open candidates (non-hidden projects)
  top: { id: string; title: string; pitch: string; kind: ScoutKind; confidence: 'high' | 'medium' | 'low';
         projectId: string; projectName: string; at: number }[];   // ≤ 3 newest open ones
  lastRunAt: number;
}
```

## AI status

`GET /api/ai` → `status().scouted` = number of projects with a scout result. Queue entries for the scout have
`kind: 'scout'` and `label: 'Scout: <project>'`.

## UI notes

- Home: a small "Project ideas" card from `overview.scout` (newCount + top 3), linking to the full list.
- List: group by project or flat; show kind as a chip, confidence as a subtle marker, `why` and `evidence` behind a
  disclosure. Actions: **Spin off** / **Start project** (prefill above), **Save as idea**, **Dismiss** (with undo).
- A project page can show its own candidates with `?projectId=` and a "Scout now" button (`POST /api/scout/run`).
- Empty state is normal: "Nothing stands out yet. The scout looks again when there's new work (every few days at most)."
