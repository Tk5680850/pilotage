# Pilotage design system: "Quiet instrument panel"

> v3 (2026-11-15): navigation, vocabulary, status colours (summary statuses are neutral grey; accent = live Working only) and the Home layout changed — docs/SIMPLIFY.md is the source of truth where
> this file disagrees (labels, status colours, tab bar, page structure). The visual language below still applies.

This is the contract for every page in `web/src/pages/*`. Read it fully before you touch a page.
Primitives live in `src/components/ui.tsx`, domain cards in `src/components/cards.tsx`, all styles in
`src/styles.css`. Page CSS files (`Timeline.css`, …) may only use the tokens below, never raw colors.

## 1. Direction

Pilotage is a cockpit its user opens dozens of times a day, mostly in dark mode, on a 1440px PC and a
390px Android phone. It should feel like Linear, Vercel's dashboard, Raycast and Things 3: calm,
neutral, typographic, fast to scan.

- **Neutral canvas, about 95% grey.** Color is reserved for two things: **meaning** (status) and
  **identity** (workspace hue). If a color doesn't mean something, remove it.
- **Typography makes the hierarchy, not boxes.** One strong line per item, quiet metadata, big
  tabular numbers. Cards only group things; they never decorate.
- **Progressive disclosure.** Show the headline, keep at most two lines of secondary text, and put
  everything else behind a click (detail page, `Disclosure`, `ClampText`, "Show N more").
- **The exception, not the default.** Don't label what's normal (an "Active" badge on every active
  project). Show the live session, the blocked thread, the dirty repo.

Research behind this: Linear's 2024 redesign (neutral chrome, fewer variables, Inter / Inter Display,
reduced noise in sidebar and headers); Vercel Geist (a 10-step scale per color: backgrounds, borders,
high-contrast fills, text; "Background 2 sparingly"); Radix Colors (steps 1–2 app background, 3–5
component fills, 6–8 borders, 11–12 text); real-time dashboard UX guidance (about 5 primary
elements per view, big KPI numbers with a delta and a sparkline, color always paired with a glyph or a
word, 100–150 ms feedback and 200–400 ms transitions, respect reduced motion); Things 3 (whitespace
as structure, color only for meaning).

## 2. Principles (the rules reviewers will check)

1. **One primary line per item.** Title at 14–15px, weight 550–600. Everything else is smaller and greyer.
2. **At most two lines of secondary text** (`Snippet lines={2}` / `clamp-2`). AI paragraphs longer than
   three lines go in `ClampText`. Never dump a whole AI paragraph in a list row.
3. **Metadata is text, not chips.** Use `<Meta items={[…]} />` (middot-separated, 12px, `--text-3`).
   No row should carry more than **one** pill (a `LiveStatus`), and only when it means "live".
4. **Status = glyph.** Use the shared vocabulary (§6). A row's status goes in the leading slot as a
   `StatusIcon`. Words only on detail headers or when it's the point of the card.
5. **Numbers are heroes.** Counts that matter are `StatTile`s (28–32px tabular figures), not a sentence
   of counts in a subtitle.
6. **One primary button per view.** It's white-on-dark (`.btn.primary`). In the shell that's
   "New session", so most pages need **no** primary button of their own. Use secondary or ghost.
7. **Generous spacing.** 28px between page sections (`.content` gap), 20px card padding, 13–14px row
   padding. When in doubt, add space and remove a border.
8. **Workspace identity everywhere a project appears**: `ProjectGlyph` (tinted initial tile) or
   `WorkspaceAvatar`. Never a bare colored square in new code.
9. **Phone is a first-class layout**, not a squeezed desktop: lists instead of card grids, 2-column stat
   tiles, bottom sheets for modals, every control ≥ 40px tall (primary 44px). Hover-only actions don't
   exist on phones.
10. **No raw Markdown in snippets.** Rows use `Snippet` (strips Markdown). Only detail views render
    `Markdown` (which drops raw HTML).

## 3. Tokens

All tokens are CSS variables on `:root`, defined once with `light-dark()`. The theme follows the OS
unless `<html data-theme="light|dark">` forces one (set from Settings → Appearance by `Layout`).
**Never hard-code a hex value in a page; never use `@media (prefers-color-scheme)` in a page.**

### Color

| Token | Role |
|---|---|
| `--bg` | Page canvas |
| `--bg-chrome` | Sidebar, bottom tab bar |
| `--surface` | Cards, panels, list containers |
| `--surface-2` | Insets, segmented-control track, chips, hover fills on cards |
| `--surface-3` | Pressed, meter tracks, skeletons |
| `--surface-raised` | Modals, popovers, palette |
| `--field` | Text inputs |
| `--hover`, `--pressed` | Translucent overlays for interactive rows/nav (work on any surface) |
| `--border` | Default hairline (translucent) |
| `--border-strong` | Inputs, buttons, hovered cards |
| `--text` | Primary text, titles |
| `--text-2` | Secondary text (descriptions, sub-lines) |
| `--text-3` | Metadata, labels, placeholders (≥ 4.5:1 on bg/surface/surface-2 in both themes) |
| `--text-4` | Decoration only (separators, disabled). Never for text someone needs to read. |
| `--accent` / `--accent-text` / `--accent-soft` | Brand periwinkle: focus rings, links, selection, "in motion" status |
| `--green` | Live / ready |
| `--amber` | Needs attention: needs you, blocked, dirty, warnings |
| `--red` | Errors, destructive |
| `--blue`, `--violet`, `--teal` | Reserved for charts and ideas; not for status |

Compatibility aliases kept for old pages: `--ok`, `--live` (= green), `--busy` (= accent, i.e. "working"),
`--warn` (= amber), `--danger` (= red), `--ok-soft`, `--warn-soft`, `--danger-soft`, `--teal`.

Soft tints are always computed: `color-mix(in srgb, var(--amber) 13%, transparent)`.

### Type

Inter Variable (self-hosted, optical sizes, so large sizes get the Display cut automatically) and
Geist Mono Variable for code, paths and commands. Feature `cv05` (l with a tail) is on globally so
`l`/`I` are distinguishable in project names. `.num` turns on tabular figures. Use it for every number
that can change or sits in a column.

| Token | px (desktop / phone) | Use |
|---|---|---|
| `--fs-3xl` | 32 / 28 | `StatTile` value |
| `--fs-2xl` | 26 / 24 | Page title (`h1`), weight 650, tracking −0.022em |
| `--fs-xl` | 20 | Rare: hero numbers inside a card |
| `--fs-lg` | 17 | Modal titles |
| `--fs-md` | 15 | Card titles of big cards (`.pcard .title`), lead paragraph (`.lead`) |
| `--fs-base` | 14 / 15 | Body, row titles |
| `--fs-sm` | 13 / 13.5 | Secondary text, section headings, buttons |
| `--fs-xs` | 12 / 12.5 | Metadata, labels, counts |
| `--fs-2xs` | 11 | Glyph initials, tab-bar labels only |

Section headings are **small and quiet** (13px/600, `--text-2`) so the content leads. Don't use
uppercase labels.

### Space, radius, elevation, motion

- Space: 4px grid, `--s-1`…`--s-12` = 4, 8, 12, 16, 20, 24, 32, 40, 48. Page sections 28px apart on
  desktop, 24px on phone. Inside cards: 20px padding desktop, 16px phone. Row padding 13–14px × 20px.
- Radius: `--r-xs` 4 (kbd), `--r-sm` 6 (small buttons, badges), `--r-md` 8 (buttons, inputs),
  `--r-lg` 12 (cards, `--radius`), `--r-xl` 16 (modals). Pills are `999px`.
- Elevation: flat. Cards = `--surface` + `--border` (+ a 1px shadow in light mode only). Shadows
  (`--shadow-md`, `--shadow-lg`) only for floating layers: modals, palette, toasts, tooltips.
- Motion: `--ease` (cubic-bezier .2,.8,.2,1), `--dur-1` 120ms (hover/press), `--dur-2` 180ms
  (open/close, toggles), `--dur-3` 260ms (sheets, page fade). Only `working` and `needs-you` pulse.
  Everything respects `prefers-reduced-motion`.

### Iconography

lucide-react, stroke 1.75 (set globally in CSS). Sizes: 16 in nav and buttons (15 in `.btn`, 14 in
`.btn.sm`), 15 in section titles, 13–14 in metadata, 17–18 in empty-state tiles and callouts. Icons
are `--text-3` by default and only take a meaning color when they carry meaning (amber warning
triangle). Don't put an icon on every heading. One per section at most, and none on rows that already
have a status glyph.

## 4. Shell and layout

- Desktop (> 860px): 248px sidebar (`--bg-chrome`) + content column. Sticky 52px top bar with the
  search/palette trigger (Ctrl K) and the only primary button, **New session**. Content max width
  1200px, padding 32px 40px.
- Phone (≤ 860px): compact header (brand, search icon), bottom tab bar
  (Home, Sessions, ＋ New (create sheet), Tasks, More) — v3, see SIMPLIFY.md §3 with safe-area insets. Content padding 20px 16px and bottom
  padding for the tab bar. Modals become bottom sheets with a grab handle; the palette drops from
  the top.
- Grids: `.grid-main` (content + 320px rail, stacks under 1100px), `.grid-cards` (auto-fill
  ≥ 320px), `.grid-stats` (auto-fit ≥ 180px, **2 columns on phone**), `.grid-2`, `.grid-3`.
- Stacks: `.stack-sm` 4, `.stack` 8, `.stack-lg` 20, `.stack-xl` 32. Inline: `.row`, `.cluster`,
  `.spread`, `.grow`.
- Sidebar workspace entries: tinted avatar with a green **presence dot** when something is live, the
  project count on the right. The two are deliberately separate.
- Don't use `window.scrollY` tricks or a page-level scroll container. The document scrolls.

## 5. Formats and copy

- Dates: `fmtDate(t)` gives "11 Nov" (adds the year only when it's not this year). `fmtDateTime` gives
  "11 Nov, 14:05" and `fmtTime` gives "14:05": 24-hour clock, en-GB order. Day group headers use
  `fmtDay(t)` ("Today", "Yesterday", "11 Nov"). **Never weekday names in lists** ("Tuesday" next to
  "4 days ago" is confusing). The only weekday allowed is the Today page date line.
- Relative time: `ago(t)` ("3 h ago", "yesterday") in rows and metadata. Put the absolute date in
  `title=` for hover.
- Plurals: always `plural(n, 'worktree')`. Never `${n} worktrees`.
- Numbers: `.num` / tabular; `compactNum(12400)` gives "12.4k" in tiles.
- Paths: `PathLabel` (file name + "…/parent/folder" tail, full path in the tooltip). Never truncate a
  long absolute path from the right (they all start the same).
- AI text: `Snippet` for one-liners (strips Markdown), `ClampText` for paragraphs, `Markdown` only on
  detail pages.
- Copy: sentence case, plain words, no emoji, no ALL CAPS. Buttons are verbs ("Start session",
  "Continue"). Subtitles are one calm sentence, not a list of counts.

## 6. Status language (one vocabulary, two families)

There are two different questions, so they get two different looks. Each meaning keeps one color
everywhere.

**A. Process state of a live session ("is Claude running right now?")**: `LiveStatus`: solid dot +
word in a tinted pill. Get the state with `liveState(s)` / `liveLabel(s)` from `cards.tsx`.

| state | label | look |
|---|---|---|
| `working` | Working | accent, pulsing dot |
| `idle_live` | Open | grey dot (v3: idle is not green) |
| `needs-you` | Needs you | amber, pulsing dot |

**B. Work status (AI digest of a block, thread or project lifecycle)**: `WorkStatus`: outlined circle
glyph + plain text, no fill. In rows, use the glyph alone (`StatusIcon`) as the leading element.

| status | glyph | tone |
|---|---|---|
| `in_progress`, `ongoing`, `active` | half-filled circle | accent |
| `blocked` | filled circle with "!" | amber |
| `done` | filled check circle | muted (finished work recedes) |
| `abandoned` (Dropped), `archived` | circle with slash | faint |
| `idle`, `todo` | empty ring | muted |
| `dormant`, `queued` | dashed ring | faint |
| `paused` | ring with pause bars | muted |
| `error` | filled circle with × | red |

Rules (v3): accent = in motion, amber = needs you, grey = open/idle, muted green = done, red = broken
or asleep. Don't invent new status colors. Don't show "Active" on active projects.

**Workspace identity:** `wsColor(key)` returns a hue from a 16-color palette, assigned so every known
workspace gets a distinct color (deterministic for a given set). `registerWorkspaces()` is already
called when projects, timeline or portfolio data load. If a project has `p.color`, pass it as `color`.
Identity colors are never used for status.

## 7. Component catalogue

All of these are exported from `src/components/ui.tsx` unless noted.

### Page structure

```tsx
<PageHeader
  crumbs={[{ label: 'Projects', to: '/projects' }, { label: <><WorkspaceAvatar ws={p.workspace} name={p.workspaceName} size={16} />{p.workspaceName}</>, to: `/projects?ws=${p.workspace}` }]}
  glyph={<ProjectGlyph name={p.name} ws={p.workspace} color={p.color} size={40} />}
  title={p.name}
  status={p.liveCount ? <LiveStatus state="idle_live" label={`${p.liveCount} live`} /> : <WorkStatus status={p.status} />}
  subtitle={<Snippet text={p.oneLiner} lines={2} />}
  actions={<><Button icon={<Code2 />}>VS Code</Button><IconButton icon={<MoreHorizontal />} label="More" variant="secondary" size="md" /></>}
>
  <Tabs value={tab} onChange={setTab} items={[{ value: 'overview', label: 'Overview' }, { value: 'board', label: 'Board', count: 7 }]} />
</PageHeader>

<Section title="Pick up where you left off" icon={<History />} count={6} actions={<Link className="small link" to="/sessions">All sessions</Link>}>
  …
</Section>

<Card title="Brief" icon={<Sparkles />} actions={<span className="tiny faint">updated {ago(t)}</span>}>…</Card>
<Card title="Sessions" count={13} flush>{sessions.map((s) => <SessionRow key={s.id} s={s} />)}</Card>   // flush = list inside
<Card>plain padded content</Card>          // `Panel` is an alias
<Toolbar><div className="input-wrap"><Search /><input className="input" placeholder="Filter…" /></div><ToolbarSpacer /><SegmentedControl … /></Toolbar>
```

### Rows

```tsx
// Generic row: lead glyph · title · one-line sub · meta · trailing time. `to` makes the whole row a link;
// buttons inside stay clickable. `actions` show on hover (desktop only, never the only path).
<ListRow
  to={`/sessions/${s.id}`}
  lead={<StatusIcon status={s.digest?.status || 'idle'} />}
  title={s.title}
  sub={<Snippet text={s.digest?.summary} />}
  meta={<Meta items={[<><ProjectGlyph name={s.projectName!} ws={s.workspace} size={14} />{s.projectName}</>, plural(s.humanPrompts, 'prompt')]} />}
  trail={ago(s.lastAt)}
  actions={<Button size="sm" variant="ghost" icon={<Play />}>Continue</Button>}
/>
<ListRow dense lead={<Settings2 size={16} className="faint" />} title="Settings" to="/settings" />   // menus (phone More page)
```

Domain rows/cards from `cards.tsx` (use these, don't rebuild them):

| Component | Use |
|---|---|
| `<ProjectCard p showWorkspace? showStack? />` | Grid card: glyph, name, path, 2-line summary, meta (age · sessions · branch ±dirty), first attention signal |
| `<SessionRow s showProject? />` | Session list row; live sessions show the state word on the right |
| `<BlockRow b showProject? showSession? />` | A unit of work: digest glyph, title, outcome (2 lines), "next step" line, meta, **Continue** (hidden when live or done) |
| `<LiveCard s />` | Live session card: state pill, title, project, last prompt, Open in Claude app / View / Attach / Stop |
| `<AttentionRow a />` | Attention signal row (amber triangle or info icon, project name, 2 lines) |
| `liveState(s)`, `liveLabel(s)`, `liveDot(s)` | Process state helpers |
| `<ProjectStatusBadge status />` | = `WorkStatus` (compat) |

### Status and identity

```tsx
<LiveStatus state={liveState(s)!} label={liveLabel(s)} />       // process: pill with dot
<WorkStatus status={d.status} />                                // work: glyph + text, no fill
<StatusIcon status="blocked" />                                 // glyph only (row lead), has a title tooltip
<ProjectGlyph name={p.name} ws={p.workspace} color={p.color} size={32} />   // 14 (meta), 20 (lists), 26–32 (cards), 40 (headers)
<WorkspaceAvatar ws={key} name={w.name} size={18} />
<AvatarStack items={workspaces.map((w) => ({ key: w.key, name: w.name, ws: w.key }))} max={4} />
```

### Numbers and charts

```tsx
<div className="grid-stats">
  <StatTile label="Prompts this week" icon={<MessagesSquare />} value={161} delta={-27} deltaLabel="27%" spark={last14} />
  <StatTile label="Live now" icon={<Radio />} value={6} hint="3 working · 1 needs you" to="/live" />
  <StatTile label="Tokens out" value={compactNum(812000)} unit="tokens" size="sm" bare />   // bare = no card (inside another card)
</div>
<Sparkline data={[3, 5, 2, 8]} width={96} height={28} color="var(--green)" />   // no axes, ever
<MiniBars data={perDay} titles={perDay.map((n, i) => `${days[i]}: ${n}`)} height={48} />
<Progress value={3} max={8} />            // meter + "3/8"
<Progress value={72} tone="warn" />       // "72%"
<Meter pct={u.five.pct} size="sm" />      // auto amber ≥ 60, red ≥ 85
```

`delta` colors itself (up = green, down = red); pass `invertDelta` when lower is better.

### Text

```tsx
<Snippet text={b.digest?.outcome} lines={2} className="lrow-sub" />     // plain text, Markdown stripped
<Snippet text={s.lastPrompt} quote />                                    // “quoted prompt”
<ClampText lines={3}>{brief.description}</ClampText>                     // "Show more" only if it overflows
<ClampText lines={8} fade><Markdown text={reply} /></ClampText>          // rich content: height clamp with fade
<Markdown text={md} />                                                    // safe: no raw HTML, links open in a new tab
<Disclosure summary={`${n} tool calls`}>{…}</Disclosure>                  // native <details>
<PathLabel path={doc.path} />  <PathLabel path={wt.path} inline mono />
<Meta items={[a, b, c]} />     <Kbd>Ctrl K</Kbd>     <Tooltip label="Open in VS Code"><IconButton … /></Tooltip>
```

Utility classes: `.muted` (text-2), `.faint` (text-3), `.small`, `.tiny`, `.bold`, `.medium`, `.lead`,
`.overline`, `.truncate`, `.clamp-1…4`, `.readable` (72ch), `.num`, `.mono`, `.tone-green|amber|red|accent`.

### Controls

```tsx
<Button variant="primary" icon={<Plus />}>New session</Button>     // primary | secondary (default) | ghost | subtle | accent | danger
<Button size="sm" variant="ghost" loading={busy}>Rewrite</Button>
<IconButton icon={<Pencil />} label="Edit" />                       // label = aria-label + title
<CopyButton text={cmd} label="Copy command" />
<SegmentedControl value={v} onChange={setV} options={[{ value: 'current', label: <>Current <span className="num faint">11</span></> }]} size="sm" />
<Tabs value={tab} onChange={setTab} items={[…]} />                  // underline tabs for page sections
<Switch on={x} onChange={setX} label="Daily brief" />
<Field label="Name" hint="Shown in the Claude app"><input className="input" /></Field>
<div className="input-wrap"><Search /><input className="input" placeholder="Filter…" /></div>
```

Plain classes still work for links: `<Link className="btn sm" to=…>`. Buttons: `.btn` + `.primary`
`.ghost` `.subtle` `.accent` `.danger` + `.sm` `.lg` `.icon` `.block` `.round`.

### Feedback

```tsx
<EmptyState icon={<Lightbulb />} title="No ideas yet" body="Write down anything you'd like to try." action={<Button size="sm" icon={<Plus />}>Add idea</Button>} />
<Callout tone="warn" icon={<TriangleAlert />} title="2 dev servers still running" action={<Button size="sm">Review</Button>}>From deleted folders.</Callout>
<LoadingCard lines={4} />   <Skeleton h={14} w="60%" />   <Spinner />   useToast()('Saved')
<Modal title="Edit project" onClose={close} footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary">Save</Button></>}><div className="modal-body">…</div></Modal>
```

Callout tones: info (accent), `warn`, `danger`, `ok`, `neutral`. Use a callout only for something
the user should act on; never for explanations (put those in a `Disclosure` or `.hint`).

### Board (Tasks tab)

```tsx
<Board>
  <BoardColumn title="To do" status="todo" count={todo.length}>
    {todo.map((t) => (
      <div key={t.id} className="board-card clickable" onClick={…}>
        <span className="t clamp-2">{t.title}</span>
        <Meta items={[t.source, ago(t.at)]} />
      </div>
    ))}
  </BoardColumn>
  <BoardColumn title="In progress" status="in_progress" count={…} />
  <BoardColumn title="Blocked" status="blocked" count={…} />
  <BoardColumn title="Done" status="done" count={…} />
</Board>
```

Columns scroll horizontally and snap (84% width on phones). An empty column says "Nothing here".

## 8. Page blueprints

Every page: `PageHeader` → (optional `StatTile` row) → content. Max about five primary blocks above
the fold. Desktop numbers below assume 1440px wide (about 1120px content).

### Today `/`
- **Header**: "Good evening, Sam" (the name from Settings) + date line ("Sunday 15 November"). No counts in the subtitle.
- **Stat row** (`grid-stats`, 4 tiles): *Live now* (n, hint "3 working · 1 needs you", `to="/live"`),
  *Active projects*, *This week* (prompts + commits, delta vs last week, 14-day sparkline),
  *5-hour usage* (%, hint "resets 14:30"; amber ≥ 60%).
- **Main column** (`grid-main` left):
  1. *Focus* card (daily brief): headline as `.lead` (2 lines max); up to 3 focus items as rows
     (`ProjectGlyph`, title, one-line "why", **Start** button); "Slipping" items and AI ideas each
     inside a `Disclosure` ("2 things slipping", "3 ideas"). Brief missing: `EmptyState` with
     "Write it now" (ghost).
  2. *Live now*: `LiveCard` grid (max 4, then "N more live" link). Order: needs you, working, idle.
  3. *Pick up where you left off*: `Card flush` of `BlockRow` (max 6) + "All sessions".
- **Rail**: *Needs attention* (`Card flush` of `AttentionRow`, max 5 + "Show N more"), *Quick idea*
  (textarea 2 rows + Save sm, `Kbd` Ctrl Enter hint), *Activity* (`MiniBars`, 28 days, links to
  Timeline), *Automations (48 h)* collapsed in a `Disclosure`.
- Don't repeat "New session" (it's in the shell). The phone-setup banner is a dismissible
  `Callout`, shown only on PC and only until a phone is paired.
- **Phone**: header, stat tiles 2×2 (Live, This week, Active, Usage), then *Live* (LiveCards, max 3),
  *Focus*, *Pick up* (BlockRows), *Needs attention*, *Quick idea* last.

### Projects `/projects`
- **Header**: "Projects", subtitle "45 projects · 11 active".
- **Toolbar**: search (`input-wrap`), `SegmentedControl` Current / Quiet / All / Done with counts,
  `ToolbarSpacer`, grid/list toggle (`SegmentedControl size="sm"` with icons).
- **Groups by workspace**: group header = `WorkspaceAvatar` 22px + name (15/600) + count (`.faint`)
  + "N live" in green when relevant. Then `.grid-cards` of `ProjectCard`. Pinned projects first.
- **List view**: `Card flush` with `ListRow` (lead `ProjectGlyph` 24, title, sub = one-liner, meta =
  age · sessions · branch, trail = `LiveStatus` if live).
- **Phone**: list view by default; toolbar = full-width search, segmented control on its own line
  (horizontally scrollable). Workspace filter via `?ws=` shows the avatar + name in the header.

### Project detail `/projects/:id`
- **Header**: crumbs (Projects › workspace avatar + name), glyph 40px, title, status (`LiveStatus`
  if live, else `WorkStatus` unless active), subtitle = one-liner (2 lines max). Actions: **New
  session** is in the shell; here a secondary "New session in this project" is fine as the one
  page-level action, plus an "Open" group (VS Code / Terminal / Explorer as `IconButton`s with
  tooltips) and a `…` overflow (status, pin, edit). Path goes in the overflow/Details, not under
  the title.
- **Tabs**: Overview · Board · Threads · Sessions · Worktrees · Docs · Notes (counts in tabs).
- **Overview**: left = Brief card (description `ClampText lines={3}`, "Where it stands" `.lead`,
  next steps as rows with a Start button), right rail = small `StatTile`s (sessions, prompts, commits
  30d with sparkline), Git card (`.kv`: branch, changes, last commit with `ago`, "Recent commits" in a
  `Disclosure`), stack as plain text ("Next.js · Supabase · Tailwind"), attention signals.
- **Board (tasks)**: `Board` with To do / In progress / Blocked / Done. Until a real tasks API exists,
  derive cards from `brief.nextSteps` (To do) and threads/blocks by digest status. Card click opens
  the session (or New session prefilled with the step). **Phone**: replace the horizontal board with a
  `SegmentedControl` of the four columns (with counts) and a list of the selected column.
- **Threads**: one `Card` per thread: title + `WorkStatus` + summary (2 lines) + up to 3 `BlockRow`s
  (`showProject={false}`) and "Show N more".
- **Sessions**: `Card flush` of `SessionRow showProject={false}`, grouped by `fmtDay`.
- **Worktrees**: `ListRow` with `PathLabel inline mono`, meta (branch, ±dirty, ↑ahead, sessions),
  `WorkStatus status="done" label="Merged"` when merged, cleanup hint as amber text.
- **Docs**: grouped `Card flush`, rows with `PathLabel` (so Claude memory files read
  `feedback_style.md · …/-home-alex-pilotage/memory`).
- **Notes & links**: textarea (`.textarea`), links as rows with `ExternalA`.

### Session `/sessions/:id`
- **Header**: crumbs (Sessions › project), title, status (`LiveStatus` when live, else `WorkStatus`
  of the latest digest), subtitle = `Meta` (project glyph+name · started `fmtDate` · `plural` prompts ·
  model · branch). Actions: live → "Open in Claude app" (secondary with Smartphone icon); otherwise
  Resume / Fork as secondary; rename in the overflow.
- **Layout**: `grid-main`. Left: Summary card first (digest blocks as compact rows: glyph, title,
  outcome clamp 2, next step), then *Conversation*. Right rail: Files (`PathLabel` rows, top 8 +
  "Show all"), Tools (plain text "Bash 5,815 · Read 204 · …"), Details (`.kv` in a `Disclosure`:
  version, entrypoint, tokens, size, resume command with `CopyButton`).
- **Conversation**: user prompts as `.bubble-user` (left aligned, max 72ch); Claude replies as
  `Markdown` in `.readable`; long replies `ClampText fade lines={14}`; tool calls always collapsed
  (`Disclosure summary="3 tool calls"`); work-block boundaries as `.block-sep` with `WorkStatus` and
  title; system/background events hidden behind a toggle and shown as `.bubble-sys`.
- **Phone**: Summary collapsed into a `Disclosure` above the conversation; actions full width under
  the header; rail content moves below the conversation.

### Live `/live`
- **Header**: "Live", subtitle "6 running · 3 working · 1 needs you".
- Sections in this order, each only if non-empty: *Needs you*, *Working*, *Idle*: `LiveCard`
  grid. Recent launches (starting…) as rows with a `Spinner`.
- "How this works" goes in a `Disclosure` at the bottom, not a card.
- Empty: `EmptyState icon={<Radio />} title="Nothing running" action={New session}`.
- **Phone**: same order, cards stacked; the card's first button is "Open in Claude app".

### Timeline `/timeline`
- **Header** + stat row: Active days, Prompts, Commits, Current streak, Longest streak (`StatTile`,
  `size="sm"`).
- **Heatmap card** full width (accent scale `.heat`/page CSS, cells 12px, legend Less→More).
  Selecting a cell sets the day.
- **Day panel** (`grid-main` left): header `fmtDay` + `Meta` (prompts · commits · sessions), workspace
  split bar (ws colors, labels below), then `BlockRow`s ordered by time with `fmtTime` in a left
  gutter. Prev/next day as `IconButton`s.
- **Rail**: "Last 8 weeks" (`StatTile` with delta + `MiniBars`), "Last 30 days by project" (bars in
  workspace color with `ProjectGlyph` labels).
- **Phone**: stat tiles 2 columns (5th spans), heatmap shows the latest 16 weeks with horizontal
  scroll and 14px cells (tap target), day panel below, rail after.

### Portfolio & CV `/portfolio`
- **Header**: "Portfolio & CV", subtitle with the included count; actions: Export (secondary).
- **Toolbar**: search, `SegmentedControl` (Included / All), language `SegmentedControl` (EN / FR).
- **Cards** (one column, `readable` width): `ProjectGlyph` 32 + title + period (right, `.num`
  `.faint`), tagline (`.lead` small), role, bullets (max 3 visible, `ClampText`), stack as plain
  dotted text, footer: include `Switch`, "Rewrite with AI" (ghost), edit (`IconButton`). Excluded
  cards at 60% opacity.
- **Rail** (desktop): export preview (Markdown, mono) with `CopyButton`. **Phone**: export opens a
  bottom sheet.

### Ideas `/ideas`
- **Composer** at the top (no card title): auto-growing textarea, project `select`, `Kbd`
  "Ctrl ↵" hint, **Save** (`.btn.sm`, the one primary on this page is acceptable here).
- Filters: `SegmentedControl` Open / Done / All with counts; project filter as `select`.
- **List**: `Card flush` of `ListRow`: lead `StatusIcon` (`todo` / `done`), title = idea text
  (`clamp-2`), meta = `ProjectGlyph`+project · `ago` · source ("from brief"), actions = Start
  session / Done / Delete (hover on desktop; on phone tap the row to open an action sheet `Modal`).
- Empty: `EmptyState` with Lightbulb.

### Settings `/settings`
- Desktop: left sticky section nav (vertical `nav-item`-style list) + right column of `Card`s, one
  per section. Inside, **setting rows**: label (14/550) + hint (`.hint`) on the left, control on the
  right (`Switch`, `SegmentedControl`, `select`, button). Rows separated by hairlines.
- Destructive actions (revoke device, purge) in their own card, `.btn.danger`, always confirm.
- Phone: section nav becomes a horizontally scrollable `SegmentedControl`-like chip row; rows stack
  (control under the label when it doesn't fit).

### More `/more` (phone only)
- `Card flush` menu of `ListRow dense` with leading icons: Sessions, Timeline, Portfolio & CV,
  Settings; then a usage card (two `Progress` rows: 5-hour window, This week, with reset times).

## 9. Legacy classes (still styled, migrate when you rewrite a page)

`.page-head` (+ `.sub`, `.actions`), `.crumbs`, `.card-head`/`.card-body`, `.section`/`.section-title`,
`.list`/`.list-item`, `.pcard`, `.focus-card`, `.signal`, `.chip`, `.badge` (+ tones), `.dot`
(+ `live`/`busy`/`warn`), `.ws-swatch`, `.ws-head`, `.callout`, `.empty`, `.kv`, `table.table`,
`.heat`, `.bars`, `.seg`, `.tabs`, `.turn`, `.bubble-user`, `.bubble-sys`, `.tool-line`, `.block-sep`,
`.prose`, `.modal-body`, `.modal-foot`, `.hide-mobile`, `.hide-desktop`, `.wrap-mobile`.
Prefer the components: `PageHeader` over `.page-head`, `ListRow` over `.list-item`, `StatusIcon`/
`WorkStatus` over `Badge`/`DigestStatus`, `ProjectGlyph` over `WsSwatch`, `Meta` over `.cluster` of
chips, `EmptyState` over `Empty`.

## 10. Checklist before you hand a page back

- [ ] Screenshot at 1440×900 and 390×844, dark and light. No horizontal scroll on the phone.
- [ ] One `h1` (via `PageHeader`). Section headings are quiet. No uppercase labels.
- [ ] Each row: one primary line, ≤ 2 secondary lines, metadata via `Meta`, status via glyph.
- [ ] No more than one pill per row/card; no stack chips in lists; no "Active" labels.
- [ ] No raw hex colors, no new font sizes outside the scale, no inline `style` for colors.
- [ ] Dates via `fmtDate`/`fmtDay`/`ago`, plurals via `plural`, numbers `.num`.
- [ ] AI text clamped (`Snippet` / `ClampText`); Markdown only in detail views.
- [ ] Every control ≥ 40px tall on phone; nothing important is hover-only.
- [ ] Empty and loading states use `EmptyState` / `LoadingCard`.
- [ ] Keyboard: focus rings visible, Esc closes modals, Ctrl K still opens the palette.
