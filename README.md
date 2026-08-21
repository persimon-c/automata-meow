# Automata Meowbile (?)

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/0a199dab-ed61-4d7d-a841-87be7ed701e2" />


A touch-first web editor for finite automata and pushdown automata. Built because
JFLAP is a Java desktop app and every web clone assumes a mouse. Designed to be used
on a phone, during an actual lecture, on spotty wifi. Whether you're drawing
automata on the bus to class or presenting from a laptop, it works the same way.

will be adding turing machines soon, currently lacking knowledge abt that for now :3

**Live:** <https://persimon-c.github.io/automata-meow/>

Opens and saves `.jff` / `.jflap` files (JFLAP's XML format), and can also export
the canvas as a **PNG** or **JPEG** image for slides or reports.

## Use it

Open the [GitHub Pages link](https://persimon-c.github.io/automata-meow/) on your
phone. Tap **+ state** then tap the canvas to place states. **+ trans** asks for two
taps (from state, to state) then a symbol. Same state twice = self-loop. Two fingers
pinch-zoom and pan in any mode.

## Contribute

No build step, no runtime dependencies.

```bash
npm install          # dev dependencies only (test harness + lint)
npm test             # engine + file-format harness
npm run serve        # no-cache dev server on http://localhost:8123
```

Add `?debug` to the URL for the on-screen event log. Roadmap: FA → PDA/CFG → Turing machines.
CI runs the harness on every push.

## Layout

```text
index.html      app shell
manifest.json   PWA manifest, sw.js service worker (offline, root scope)
assets/icons/   install icons
css/style.css   styles
js/model.js     automaton data model, pure data, no DOM
js/engine.js    FA + PDA simulation, step traces, no DOM
js/viewport.js  screen <-> canvas coordinate transform (zoom/pan)
js/renderer.js  draws the model as SVG, derives all edge geometry
js/tools.js     per-tool interpretation of taps and drags
js/editor.js    pointer event pipeline dispatching to the active tool
js/jff.js       .jff/.jflap XML parser and serializer
js/undo.js      snapshot undo stack
js/main.js      wiring, toolbar, persistence
scripts/        dev tooling (no-cache dev server)
tests/          harness + fixture automata it runs against
```

## License

MIT. Not affiliated with JFLAP or Duke University. This is an independent tool
that reads and writes the same file format.
