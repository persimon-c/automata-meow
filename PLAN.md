# Architecture & Tool Upgrades Plan

This document tracks proposed improvements to the automata-meow codebase. It exists so that agents (current and future) can review, critique, and execute on upgrades without losing context. Each item below is atomic and independently shippable.

## 1. Agent Experience

The project has no standard dev-entry points. A new agent must guess the test command (`node tests/harness.mjs`), has no lint feedback, and must reverse-engineer data shapes from call sites.

### 1.1 Add `package.json` (scripts only, no dependencies)

**Status:** Proposed
**Effort:** ~30 min

Add a `package.json` with scripts only — no build tool, no bundler, no runtime deps. This preserves the "no build step" philosophy while giving agents standard entrypoints.

```json
{
  "name": "automata-meow",
  "private": true,
  "scripts": {
    "test": "bun tests/harness.mjs",
    "serve": "python3 -m http.server 8123",
    "debug": "python3 -m http.server 8123  # then open with ?debug"
  }
}
```

**Rationale:** `npm test`, `npm start` are universal. Even though the README tells you the commands, having them in `package.json` lets any agent run them blindly. The `bun` runtime is already used in the test harness comments.

### 1.2 Add `AGENTS.md`

**Status:** Proposed
**Effort:** ~1 hr

Create `AGENTS.md` at the repo root with:

- **Test command:** `bun tests/harness.mjs` or `node tests/harness.mjs`
- **Serve command:** `python3 -m http.server 8123`
- **Architecture map:** one-line per module (`engine.js` = simulation; `renderer.js` = SVG drawing; `model.js` = data; `jff.js` = file format; `tools.js` = tap interpretation; `editor.js` = pointer pipeline; `main.js` = wiring)
- **Coding conventions:** no semicolons, double quotes, 120-char line limit, no hard-wrapping markdown
- **Philosophy:** no build step is intentional; the app must work offline on a phone with spotty wifi
- **Service worker:** bump `CACHE` version in `sw.js` whenever shipped files change; old caches auto-delete on activate

**Rationale:** The SMON OS vault has an `AGENTS.md` but that's vault-level. The project needs its own. This is the single highest-leverage doc for any agent.

### 1.3 Add GitHub Actions CI

**Status:** Proposed
**Effort:** ~30 min

Add `.github/workflows/test.yml`:

```yaml
name: test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun tests/harness.mjs
```

**Rationale:** Catches engine regressions on every push without manual intervention. The harness already exits non-zero on failure.

### 1.4 Add JSDoc typedefs for core data shapes

**Status:** Proposed
**Effort:** ~1 hr

Add `@typedef` blocks at the top of `js/engine.js` documenting the interfaces that flow between modules:

```js
/**
 * @typedef {Object} State
 * @property {number} id
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {boolean} initial
 * @property {boolean} final
 */

/**
 * @typedef {Object} Transition
 * @property {number} from
 * @property {number} to
 * @property {string} read  // empty string = epsilon
 * @property {string} [pop]  // PDA only
 * @property {string} [push] // PDA only
 */

/**
 * @typedef {Object} Automaton
 * @property {string} type  // "fa" or "pda"
 * @property {string} [initialStack]  // PDA only, defaults to "Z"
 * @property {State[]} states
 * @property {Transition[]} transitions
 */

/**
 * @typedef {Object} PDAConfig
 * @property {number} state
 * @property {string[]} stack
 * @property {number} pos
 */

/**
 * @typedef {Object} SimStep
 * @property {number} pos
 * @property {Set<number>} active
 * @property {Set<number>} via
 * @property {string} [char]
 * @property {PDAConfig[]} [configs]
 */
```

**Rationale:** Agents read `js/engine.js`, `js/main.js`, and `js/renderer.js` and see `sim.steps[sim.pos]?.via` but must trace back through the engine to know it's a `Set<number>` of transition indices. JSDoc on the engine exports eliminates this guesswork. Apply the same typedefs to `main.js` and `renderer.js` where the `opts` object is constructed/consumed.

### 1.5 Add ESLint config (basic rules only)

**Status:** Proposed
**Effort:** ~30 min

Add `.esintrc.json` with a minimal rule set matching existing style:

```json
{
  "env": { "browser": true, "es2022": true },
  "parserOptions": { "ecmaVersion": 2022, "sourceType": "module" },
  "rules": {
    "quotes": ["error", "double"],
    "semi": ["error", "never"],
    "no-unused-vars": "warn",
    "no-undef": "error"
  }
}
```

Add one lint script to `package.json`: `"lint": "bunx eslint js/"` (or `npx eslint`).

**Rationale:** The codebase is already mostly consistent. ESLint locks the style and catches `no-undef` errors (missing imports/exports) before they crash in the browser. This is the cheapest safety net.

---

## 2. Architecture & Performance

### 2.1 Split `fullRender()` into geometry vs sim-state passes

**Status:** Proposed
**Effort:** 2–3 hrs

**Problem:** `fullRender()` (`main.js:59`) does two things every time: (a) re-runs `simulate(auto, input)` and (b) calls `render(svg, auto, opts)` which rebuilds the entire SVG DOM (`renderer.js:10`, `svg.innerHTML = ""`). This means panning the canvas after a simulation also re-simulates and re-renders all geometry — wasteful and can cause input lag on low-end phones.

**Fix:** Split into two functions:

- `renderGeometry(auto, editorState)` — rebuilds SVG nodes. Only called when the **model changes** (add state, add transition, change type, import).
- `renderSimState(sim, editorState)` — only updates `activeTransitionIds` / `activeIds` on existing SVG nodes and refreshes the sim bar. Called on position change, input change, or viewport pan.

**Implementation notes:**
- `renderGeometry` calls `render(svg, auto, opts)` as-is.
- `renderSimState` iterates existing `<g>` nodes by `data-state-id` and `<path>` hit-tiles by `data-tid` and toggles `stroke`/`fill` — no DOM rebuild.
- Gate the call site: only `renderGeometry` after model mutations; `renderSimState` after sim position/viewport changes.
- `fullRender()` (the old combined function) can be kept as a "do everything" fallback during transition, then removed.

**Rationale:** This is the single biggest perf win without changing the architecture. For a PDA with 10+ states and many transitions, the current full rebuild on every pointer event can visibly stutter.

### 2.2 Diff-based SVG updates (defer until TM support lands)

**Status:** Proposed / Deferred
**Effort:** 4+ hrs

**Problem:** Even `renderGeometry` rebuilds everything from scratch each time. As the project adds Turing machine tape views (long strips of cells) and context-free grammar parse trees, full rebuilds become O(n) where n grows large.

**Options (not all need implementing):**
- Keep a virtual element map keyed by `state.id` / `tid`, update only changed attributes.
- Or use `<use>` / `<symbol>` clones for repeated sub-elements (transition arrows, state circles).
- Or move rendering into a `<canvas>` for the geometry layer (SVG kept for labels only).

**Decision point:** Defer until we have concrete perf data from a real lecture (issue #4). If phones stutter during normal use, this becomes priority.

### 2.3 Optimize image export recoloring

**Status:** Proposed
**Effort:** ~1 hr

**Problem:** `exportImage()` (`main.js:408`) clones the SVG subtree, then runs four separate `querySelectorAll` + `setAttribute` sweeps to invert dark-theme colors to light-on-white for the exported image:

```
circle[fill="#2a2a2a"]   → #ffffff
circle[stroke="#e8e8e8"]  → #222222 (also line[stroke=...])
path[stroke="#cfcfcf"]   → #222222
text[fill="#e8e8e8"]     → #111111
text[fill="#ffd27f"]     → #8a5a00
```

Each sweep traverses the entire cloned subtree. For large automata this is noticeable.

**Fix options:**
- Swap the color inversions to a CSS class swap. Add `.export-theme` CSS that overrides fills/strokes, and apply it by toggling a class on the cloned SVG instead of walking every element.
- Or render exports from the SVG directly using a `<style>` with `filter: invert()` and `background` — one CSS rule instead of four DOM traversals.

**Trade-off:** CSS approach is simpler but less precise (filters affect text readability). Class-swap is precise but requires the renderer to assign classes instead of inline attributes. Recommendation: if state/edge colors are already inline attributes, the attribute-swap is hard to avoid. Defer to 2.4 unless export is visibly slow.

### 2.4 Spatial indexing for hit testing (defer)

**Status:** Proposed / Deferred
**Effort:** 2 hrs

**Problem:** `hitEdgeIndex(svg, vp, sx, sy)` (`renderer.js:249`) iterates all sampled points across all edges — O(E * 12) per tap. Fine for <100 transitions, slow for large automata.

**Fix:** Build a spatial grid (uniform grid is fine — states are bounded in canvas space) on render, query only cells near the tap point.

**Decision point:** Defer. Current harness fixtures have ≤8 states / ≤16 transitions. Revisit if a real course file has >50 transitions.

### 2.5 Render debouncing / throttling

**Status:** Proposed
**Effort:** ~1 hr

**Problem:** During pan (pointer drag), `editor.js` fires render on every pointer move. On a 120Hz phone that's 120 renders per second of a full SVG rebuild.

**Fix:** Wrap the render call in `requestAnimationFrame` (or a simple timestamp-based throttle). Multiple pointer events within one frame collapse to one render.

```js
let renderPending = false;
function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    fullRender();
  });
}
```

**Rationale:** Cheaper than 2.1, catches the most common jank source (panning).

---

## 3. Execution Order

Recommended sequence:

1. **1.1 → 1.2 → 1.3** (agent onboarding: scripts, AGENTS.md, CI) — unblock future agents immediately
2. **2.5** (render debounce) — 1-line change, biggest perceived perf win
3. **2.1** (split fullRender) — medium effort, high payoff, makes future SVG work clean
4. **1.4 → 1.5** (JSDoc + ESLint) — quality tooling, can be done incrementally
5. **2.3** (export optimization) — only if export is slow on real files
6. **2.2 → 2.4** — deferred, only if perf data from lecture test (issue #4) shows need

---

## 4. What To Review

Agents reviewing this plan should check:

- **1.1:** Is `bun` available in CI? If not, fall back to `node` — the harness uses no bun-specific APIs (`import`, `fs`, `process.exitCode` all work in Node 18+).
- **2.1:** Verify that `editor.js` pointer pipeline doesn't call render on every sub-pixel move already — the `tools.js` drag handler may already throttle. Check before implementing duplicate logic.
- **2.3:** Confirm export color values (`#2a2a2a`, `#e8e8e8`, `#cfcfcf`, `#ffd27f`) match what `renderer.js` + `style.css` actually use. If the renderer changes color scheme, the export invert logic breaks silently.
- **1.5:** Make sure ESLint won't flag the intentional `process.exitCode` or DOM globals. The `env: { browser: true }` handles `document`, `window` etc.
- **2.2:** Does the roadmap actually need TM tape rendering as SVG? If the TM view switches to canvas, the diff-SVG optimization in 2.2 is unnecessary.

---

## 5. Out of Scope (By Design)

- **No bundler / no TypeScript / no React.** The project's entire value prop is zero-dependency, works-offline-on-a-phone-with-spotty-wifi. A build step contradicts this. Type safety via JSDoc only.
- **No SSR / no server component.** The SW is offline-first. Everything runs in the browser.
- **No persistent user data.** State lives in `localStorage` or the file itself. No user accounts, no sync (beyond what JFLAP's `.jff` provides).

---

**Status legend:** Proposed → In Progress → Done / Rejected / Deferred
**Last updated:** 2026-08-21
