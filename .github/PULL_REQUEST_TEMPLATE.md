## What and why

<!-- What does this change, and why? One or two short paragraphs. -->

## Linked issue

<!-- "Fixes #123" closes the issue when this is merged. For anything bigger than a fix, please agree on the shape in an issue first. -->

## How I tested it

<!-- Commands you ran, the platform (WSL2 / Linux / macOS), phone or PC, and what you checked by hand. -->

## Checklist

- [ ] `npm test` passes
- [ ] `cd web && npx tsc --noEmit -p .` passes (if `web/` changed)
- [ ] `npm run leak-scan` is clean
- [ ] UI changes: screenshots before/after below, with fictional data only (no real names, paths, projects or sessions)
- [ ] Docs updated where behavior changed (README, docs/, CHANGELOG.md under "Unreleased")
- [ ] No new dependency, or it was discussed in an issue first
- [ ] Still read-only toward your projects and `~/.claude`, `~/.codex`, `~/.gemini` (see CONTRIBUTING.md, "Ground rules")
