# AGENTS.md — automata-meow

Touch-first mobile web app that opens, edits, simulates, and saves real JFLAP `.jff`/`.jflap` files. Live at https://persimon-c.github.io/automata-meow/ — deployed automatically from `main` via GitHub Pages.

## Commands

- `npm test` — run the test harness (`node tests/harness.mjs`; bun also works)
- `npm run serve` — local server on `http://localhost:8123`
- `npx eslint js/ tests/` — lint

## Architecture (one line per module)

- `js/model.js` — data: `{type, initialStack?, states[], transitions[]}`, pure operations
- `js/engine.js` — simulation: FA + PDA step traces, no rendering knowledge
- `js/renderer.js` — SVG drawing: all edge geometry derived here (self-loops, parallels), owns colors
- `js/jff.js` — JFLAP 7.1 XML parse/serialize; ids and names preserved exactly, never normalized
- `js/viewport.js` — the single pan/zoom transform (`toScreen`/`toCanvas`)
- `js/tools.js` — tap interpretation per active tool (add/move/link/delete)
- `js/editor.js` — pointer pipeline, gesture routing, selection state
- `js/main.js` — wiring, UI bars, popups, export/import, persistence
- `js/undo.js` — snapshot undo stack

Hard rules: no build step (vanilla ES modules served static), model/UI separation, renderer owns geometry, Pointer Events only, ids and names are independent fields.

## Conventions

- Semicolons required, double quotes, keep lines ≤ ~120 chars where practical.
- Comments: intent headers and why-notes, one line each, no em-dashes or colons in comment text.
- Markdown: never hard-wrap prose — one paragraph is one line.

## Testing

The harness runs against fixture files in `tests/fixtures/` (five FA automata plus one PDA). Expected accept/reject values are measured ground truth — do NOT "fix" a fixture to make a failing assertion pass; the fixture reflects the intended language. Round-trip stability (parse → serialize → parse) is itself tested.

## Service worker

Stale-while-revalidate: cached copies answer instantly and a background fetch refreshes them, so shipped-file changes self-heal across loads. Bump the `CACHE` version string in `sw.js` **only when the ASSETS list itself changes** (files added or removed) — content edits need no bump. Local development uses `scripts/dev-server.py`, which sends `Cache-Control: no-cache` so browsers never serve stale js during testing.

## Philosophy

Zero runtime dependencies, works offline on a phone with spotty wifi. Dev dependencies (linkedom, eslint) exist only for the harness/lint and never ship to the browser.
