# Contributing

Thanks for looking. Pilotage is a small project with one maintainer, so short, focused pull requests work best.
For anything bigger than a fix, open an issue first so we can agree on the shape:
https://github.com/Ya-zid/pilotage/issues

## Setup

```bash
git clone https://github.com/<you>/pilotage.git && cd pilotage
npm install && npm --prefix web install
npm test                           # server tests (node:test): temp data dir, no AI, no forwarder
cd web && npx tsc --noEmit -p .    # type-check the web app
```

Run a throwaway server next to your real one (it never touches your real `data/`):

```bash
PILOTAGE_DATA=/tmp/pilotage-dev PILOTAGE_PORT=4799 PILOTAGE_LAN_INTERNAL_PORT=4798 \
  PILOTAGE_NO_AI=1 PILOTAGE_NO_FORWARDER=1 node server/index.js
```

`bin/pilotage build` rebuilds the web app (`web/dist`); `npm --prefix web run dev` runs Vite for UI work.

## Ground rules

- **Read-only toward the user's projects and agent folders** (`~/.claude`, `~/.codex`, `~/.gemini`). Pilotage never
  writes there. Every git call uses `--no-optional-locks`.
- **Security stays tight**: every `/api` route needs a paired device or the CLI key; mutating routes need
  `X-Pilotage: 1` + JSON; keep the Host allow-list and the 127.0.0.1 bind. See [SECURITY.md](SECURITY.md).
- **AI work goes through the engine queue** (`server/ai/engine.js`) and its usage guard. AI providers get no tools.
- **No new dependencies** without a good reason. The server has one (`qrcode`).
- **Tests** for server logic go in `tests/` and must not need a network, an AI provider, a real `$HOME` or Windows.

## Style

- Plain modern JavaScript (ES modules) on the server, TypeScript + React in `web/`. Match the code around you.
- UI: follow [docs/DESIGN.md](docs/DESIGN.md) (tokens, components) and the words in [docs/SIMPLIFY.md](docs/SIMPLIFY.md)
  (Project, Session, Workstream, Task, Idea).
- Comments explain why, not what. User-facing text is short, plain English, no jargon.

## No personal data

Fixtures, docs, screenshots and examples must not contain real names, clients, e-mail addresses, IP addresses, home
folder paths (`/home/<you>`), or anything copied from your own transcripts. Use fictional ones (`/home/alex/acme`,
"Sam"). Run the scan before you open a pull request:

```bash
npm run leak-scan
```

It flags credentials that look real, e-mail addresses and home-folder paths. Maintainers can add a private pattern
list (`scripts/leak-patterns.txt`, never committed to the public repository) for names that must never appear.
