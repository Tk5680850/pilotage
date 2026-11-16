# Pilotage v3: simpler, one model, fewer places

User feedback, 2026-11-15: "it's still kind of messy… I don't fully understand it." A fresh-eyes test (screenshots only) and a
research pass (Linear, Things, Sunsama, GitHub dashboard, Claude Code agent view, Cursor, NN/g) agree on the cause:
**the same four objects appear in 4–6 places under different names**, and Home tries to show everything.
This document is the contract for the v3 UI pass. DESIGN.md (visual language) still applies.

## 1. The model (show it, name it the same everywhere)

| Object | One line (reuse as page subtitle / empty state) |
|---|---|
| **Project** | A repo or folder you work in. |
| **Session** | One conversation with Claude Code, Codex or Gemini. |
| **Workstream** | Sessions about one goal inside a project, grouped by AI. |
| **Task** | Something you've decided to do. AI suggests tasks from your sessions; you keep or dismiss them. |
| **Idea** | Something you might do, including possible new projects the AI spotted in your work. |

Rules:
- Every list is a **view of one state**. A task is in exactly one of: Suggested · To do · Doing · Done (+ Dropped).
  "Today" is a flag on To do / Doing tasks, not another list.
- **Machine input is kept apart from commitments.** AI suggestions live in *Suggested* (tasks) and *Possible projects*
  (ideas). They never fill Home.
- **Show the reason, not a score.** Every AI item shows where it came from (project + session + a quote/summary) and links
  to it. No confidence percentages.
- **Home is for acting.** Stats, feeds and history go to History / Portfolio.

## 2. Vocabulary (old → new). Use the new words in UI text, aria labels, palette, empty states, toasts.

| Old | New |
|---|---|
| Today (page/nav) | **Home** (route stays `/`) |
| Live / Live now / Now / running | **Running** (state groups: **Needs you** · **Working** · **Open** (idle)) |
| Today's focus / Next up / Planned | **Today** (≤3 tasks you picked; AI proposes) |
| Tasks › Inbox / "new in the inbox" | **Suggested** |
| Needs attention / things slipping / things to watch / "Left in progress N days ago" | **Gone quiet** tag inside **Pick up** |
| Pick up where you left off | **Pick up** |
| Brief / Project brief | **Summary** |
| Threads | **Workstreams** |
| Work block / "N work blocks" | never shown; show a date range or a session count |
| Daily brief (Settings) | **Today's plan** |
| Timeline | **History** |
| Spin-off candidates / scout | **Possible projects** |
| Prompts only (session kind) | **Archived** (hint: transcript removed by Claude Code, prompts kept) |
| Automated / automation runs | **Automations** (one word everywhere) |
| This week (usage) / 5-hour window | **Weekly limit** / **5-hour limit** |
| Portfolio: In CV / Drafts | **Included** / **Not included** |

Status colours: Needs you = amber, Working = accent (animated dot), Open/idle = grey (not green), Done = muted green.

## 3. Navigation

Desktop sidebar, primary: **Home · Sessions · Tasks · Projects · Ideas**.
Secondary (bottom of sidebar, small): History, Portfolio & CV, Settings, How Pilotage works.
Workspaces list stays under primary nav (a workspace with one project links straight to that project).
Badges: Sessions = Needs-you count (amber) else Working count; Tasks = To do + Doing (never Suggested); Ideas = new
possible projects. Usage meters stay in the sidebar footer only, labelled "5-hour limit" / "Weekly limit".

Phone tab bar: **Home · Sessions · ＋ · Tasks · More**. ＋ is a capture sheet (New session · Add task · Capture idea),
using the current project when on a project/session page. More = Projects, Ideas, History, Portfolio & CV, Settings,
How Pilotage works, usage.

Routes: `/live` → redirect `/sessions`; `/timeline` → redirect `/history` (History is its own page, the Timeline content,
linked from the sidebar and from Sessions header "History"). New `/guide` = How Pilotage works.

## 4. Home (top to bottom; every section hides when empty)

1. Header: greeting + **one sentence** = Today's plan headline (AI). Small "Updated 1 h ago · refresh" link.
2. Phone-setup banner (until done/dismissed), as today.
3. **Needs you**: running sessions waiting for input. Row: title, project, the question (live detail), waited for N min,
   button "Open in Claude app" (phone) / "Open" (desktop). Amber.
4. **Today** (≤3 + "Add"): tasks flagged for today, then AI proposals for today not yet accepted (from Today's plan
   focus items): proposal row shows title + why + project, buttons **Add to today** · **Start** · **Not today**.
   Accepted rows are normal task rows (checkbox Done, Start, ⋯). If nothing at all: "Nothing planned. Pick from
   Tasks" link.
5. **Working**: running sessions that are working, one line each (title · project · live detail), max 5 then "N more".
   Under it one muted line: "4 more sessions open (idle) → Sessions".
6. **Pick up** (≤5): recent workstreams/sessions you can resume, newest first; stale ones get a neutral grey
   "Gone quiet 12 d" tag. Row actions: **Resume** (resume session) / **Not now** (hides it from Home; server).
   This replaces Pick up where you left off + Needs attention + things slipping + project-card warnings on Home.
7. Footer line (muted, no badges): "14 suggested tasks · 2 possible projects · 5 automation runs today → Review" with
   links to Tasks › Suggested, Ideas, Sessions › Automations.

Removed from Home: stat tiles, Quick idea box (＋ capture instead), "Live now" list (3 + 5 cover it), the brief's
ideas list (→ Ideas page "From today's plan"), "N automated runs" card, "Updates live…" text.

Phone: same order. Needs-you and Working rows are compact (one "Open in Claude app" button per row only in Needs you;
Working rows open the session page on tap). No row may be taller than ~88px except proposals.

## 5. Sessions (absorbs Live)

Header: "Sessions" + subtitle (model line) + right side link "History".
Top groups (only when not empty, not affected by filters except project/assistant): **Needs you** (amber) ·
**Working** · **Open** (idle; folded to 3, "Show N more"). Rows: title, project, state, live detail, buttons
(Open in Claude app / View / Attach on PC / Stop) as the Live page had.
Below: the list, grouped in buckets **Today · Yesterday · This week · Earlier** (not one header per day).
Filters: search, project, assistant, kind segmented **With you · Automations · Archived · All**.
"Started from Pilotage" launches list moves under the groups as a small folded section.
Session detail: ONE summary card (merge "Claude's recap" + block summary: show the AI summary; recap as a
"Claude's own recap" disclosure inside it). Header counts say the same thing as the body ("2 prompts · 18 messages").

## 6. Tasks

Tabs at top: **To do** (board/list of To do · Doing · Done) and **Suggested (N)**.
- Board columns: To do · Doing · Done (no Inbox column). Today-flagged cards show a small "Today" chip; card menu has
  "Add to today / Remove from today".
- **Suggested** = triage list, newest first, 10 shown + "Show N more". Row: title, project, the reason (source: block
  summary / brief step) with a link to the session, "AI" tag. Actions: **Keep** (→ To do) · **Today** (→ To do + today) ·
  **Dismiss** (reason chips: Not a task · Already done · Duplicate · Not now=snooze 7 d). Keys: 1 Keep, 2 Today,
  3 Dismiss, H snooze, J/K move. A header action "Dismiss all older than 14 days" (with undo toast).
  Server auto-expires untouched suggestions after 14 days (recoverable under Dropped).
- Sidebar/tab badge = To do + Doing.
- Project › Tasks tab = the same Tasks UI filtered to the project (same components, same tabs).

## 7. Projects

Project tabs 7 → 4: **Overview · Tasks · Sessions · Notes & docs**.
- Overview: Summary (description + "Where it stands", Show more) → **What's next** (the project's Today/To do/Doing
  tasks, top 5, plus the Summary's next steps that are not tasks yet shown as Suggested rows with Keep/Dismiss — no
  more "In tasks / Add as task") → **Workstreams** (compact: name, status, date range, session count; expand to its
  sessions/blocks) → **Possible projects** from this project (scout cards, if any) → **Automations** (one folded line:
  "5 automations · last run 5 h ago", expand to list) → side column: Details (folder, started, last activity,
  branch/worktrees count, open-in buttons with visible labels).
- Running session(s) of the project: a compact strip under the header ("1 working · Open in Claude app"), not a card.
- Sessions tab: running group on top + list; worktree/branch shown per row; the Worktrees tab content becomes a
  "Worktrees (N)" disclosure at the bottom of this tab.
- Notes & docs: notes/links first, docs list below.
- Remove the "Your prompts" and "Active days" tiles (History has them).
Projects page: keep; filter labels match the words (Current / Quiet / Done / Hidden; header says "11 current").
Card footers: at most one quiet tag ("Gone quiet 30 d"), no warning prose.

## 8. Ideas

Sections: **Possible projects** (AI scout; max 3 open shown + "N more"; card: proposed name, pitch, source project
glyph+name, why, evidence list (quotes/dates), first steps (disclosure); actions **Make it a project** (opens the
spin-off dialog prefilled for kind spin-off/reusable, or New project dialog for kind idea; pass scoutId) · **Keep as
idea** · **Not a project** (permanent)) → **Your ideas** (saved; as today) → **From today's plan** (the daily brief
ideas, each with Keep / Dismiss). Header button "Look for project ideas" (POST /api/scout/run, all) with last-run time.

## 9. How Pilotage works (`/guide`)

One page: the five objects (table above, with icons), then "Where things come from" (Pilotage reads your Claude
Code / Codex / Gemini sessions on this PC → groups them into projects → AI writes summaries, suggests tasks and spots
possible projects; nothing is sent anywhere else), "Phone" (Running → Open in Claude app; pairing), "What AI costs"
(runs on your Claude plan; pauses itself above the limits in Settings). Linked from sidebar, More, and empty states.

## 10. Server contract for v3 (being added by the lead; build against these)

- `GET /api/overview` adds:
  - `pickup: [{key, kind: 'session', sessionId, title, projectId, projectName, workspace, summary, nextStep, lastAt,
    quietDays (0 if active < 3 d), resumable: bool}]` (≤6, newest first, hidden ones excluded).
  - `plan: {day: 'YYYY-MM-DD', today: [WorkItemView…] (open tasks with plannedFor ≤ today), proposals: [{index,
    projectId, projectName, title, why, action, matchId|null}] (focus items not accepted/dismissed today)}`.
  - `counts.interactive`, `counts.automated` (session counts) alongside existing counts.
  - `scout: {newCount, top}` (scout module).
- `POST /api/pickup/hide {key}` → hides a Pick up row (Not now). `POST /api/pickup/unhide {key}`.
- Work items gain `plannedFor: 'YYYY-MM-DD'|null`, `snoozeUntil: ms|null`, `dismissReason: string|null`,
  `closedBy` may be `'expired'`.
  - `POST /api/work/:id/today {on: boolean}`.
  - `POST /api/work/:id/dismiss {reason: 'not-a-task'|'done'|'duplicate'|'snooze'}` (snooze = 7 d, stays Suggested
    but hidden until then; others → dropped with dismissReason).
  - `POST /api/work/dismiss-old {days: 14}` → drops untouched suggestions older than N days, returns `{ids}`;
    `POST /api/work/restore {ids}` undoes it.
  - `POST /api/plan/focus/:index {action: 'accept'|'dismiss'}` → accept returns the task (existing match or new
    To do task flagged today); dismiss hides the proposal for today.
- Scout: see docs/API-SCOUT.md (`GET /api/scout`, `POST /api/scout/run`, `PATCH /api/scout/:id`,
  `POST /api/scout/:id/save`, `scoutId` on `POST /api/spinoff` and `POST /api/projects/new`, SSE kind `scout`).
- SSE kinds: `work` (tasks incl. plan flags), `scout`, `overview` as before.
