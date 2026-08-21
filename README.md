# automata-meow

A touch-first web editor for finite automata and pushdown automata — built because
JFLAP is a Java desktop app and every web clone assumes a mouse. Designed to be used
on a phone, during an actual lecture, on spotty wifi. Whether you're drawing
automata on the bus to class or presenting from a laptop, it works the same way.

**Live:** <https://persimon-c.github.io/automata-meow/>

Opens and saves `.jff` / `.jflap` files — the same XML format JFLAP uses for real
coursework submissions — and can also export the canvas as a **PNG** or **JPEG**
image for slides or reports.

## Use it

Open the [GitHub Pages link](https://persimon-c.github.io/automata-meow/) on your
phone. Tap **+ state** then tap the canvas to place states. **+ trans** asks for two
taps (from state, to state) then a symbol. Same state twice = self-loop. Two fingers
pinch-zoom and pan in any mode.

## Contribute

No build step, no dependencies.

```bash
python3 -m http.server 8123
# open http://localhost:8123
```

Add `?debug` to the URL for the on-screen event log. Roadmap: FA → PDA/CFG → Turing machines.

## Layout

```text
js/model.js     automaton data model, pure data, no DOM
js/viewport.js  screen <-> canvas coordinate transform (zoom/pan)
js/renderer.js  draws the model as SVG, derives all edge geometry
js/tools.js     per-tool interpretation of taps and drags
js/editor.js    pointer event pipeline dispatching to the active tool
js/jff.js       .jff/.jflap XML parser and serializer
js/main.js      wiring, toolbar, persistence
```

## License

MIT. Not affiliated with JFLAP or Duke University; this is an independent tool
that reads and writes the same file format.
