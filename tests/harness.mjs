// harness, runs the engine + jff parser against fixture automata and synthetic edge cases
// run with: node tests/harness.mjs  (or bun tests/harness.mjs)

import { readFileSync } from "fs";
import { DOMParser } from "linkedom";
import { simulate } from "../js/engine.js";
import { parse, serialize } from "../js/jff.js";

// jff.js expects a browser-style global DOMParser, linkedom provides one under node
globalThis.DOMParser = DOMParser;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

const fixture = (name) => parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

// expected accept/reject values are measured ground truth for these automata,
// Item3 in particular accepts odd base-3 numbers via digit-sum parity
// (3 = 1 mod 2), so "12" accepts and "101" rejects
const specs = [
  ["item1.jff", "even x's and y's", [["", true], ["x", false], ["xx", true], ["xy", false], ["yyyy", true], ["yxyx", true]]],
  ["item2.jff", "contains aa and bb", [["aabb", true], ["bbaa", true], ["aa", false], ["bb", false], ["ababa", false], ["ababb", false], ["bba", false]]],
  ["item3.jff", "odd base-3 number", [["1", true], ["0", false], ["2", false], ["10", true], ["11", false], ["12", true], ["101", false], ["222", false], ["21", true]]],
  ["item4.jff", "every ss followed by t+", [["sst", true], ["sstt", true], ["ss", false], ["tss", false], ["s", true], ["ssst", false], ["ttsstt", true]]],
  ["item5.jff", "divisible by 4 not 8", [["100", true], ["1100", true], ["1000", false], ["0", false], ["00", false], ["000", false], ["0100", true]]],
];

for (const [file, label, cases] of specs) {
  test(`${file} ${label}`, () => {
    const auto = fixture(file);
    assert(auto.type === "fa", "fixture parses as fa");
    for (const [input, want] of cases) {
      assert(simulate(auto, input).accepted === want, `"${input}" should ${want ? "accept" : "reject"}`);
    }
  });
}

test("fixtures round-trip stable (parse > serialize > parse)", () => {
  for (let n = 1; n <= 5; n++) {
    const name = `item${n}.jff`;
    const once = fixture(name);
    const twice = parse(serialize(once));
    const sameStates = JSON.stringify(once.states) === JSON.stringify(twice.states);
    const sameTransitions = JSON.stringify(once.transitions) === JSON.stringify(twice.transitions);
    assert(sameStates && sameTransitions, `${name} drifted on round-trip`);
  }
});

test("id and name stay independent on round-trip", () => {
  // ids and names are never guaranteed to match in the wild (a scrambled id 7 named q5
  // and id 5 named q7 is a real pattern) so the format layer must preserve both exactly
  const scrambled = {
    states: [
      { id: 5, name: "q7", x: 80, y: 80, initial: true, final: false },
      { id: 7, name: "q5", x: 240, y: 80, initial: false, final: true },
    ],
    transitions: [{ from: 5, to: 7, read: "a" }],
  };
  const back = parse(serialize(scrambled));
  assert(back.states.find(s => s.id === 7)?.name === "q5", "id 7 must keep name q5");
  assert(back.states.find(s => s.id === 5)?.name === "q7", "id 5 must keep name q7");
});

test("pda fixture a^n b^n", () => {
  const pda = fixture("pda_anbn.jff");
  assert(pda.type === "pda", "fixture parses as pda");
  for (const [input, want] of [["ab", true], ["aabb", true], ["aaabbb", true], ["aab", false], ["abb", false], ["b", false], ["", false]]) {
    assert(simulate(pda, input).accepted === want, `pda "${input}" should ${want ? "accept" : "reject"}`);
  }
});

test("empty automaton", () => {
  const empty = { states: [{ id: 0, name: "q0", x: 0, y: 0, initial: true, final: true }], transitions: [] };
  assert(simulate(empty, "").accepted === true, "empty \"\"");
  assert(simulate(empty, "a").accepted === false, "empty \"a\"");
});

test("epsilon NFA", () => {
  const eps = {
    states: [
      { id: 0, name: "q0", x: 0, y: 0, initial: true, final: false },
      { id: 1, name: "q1", x: 100, y: 0, initial: false, final: true },
    ],
    transitions: [{ from: 0, to: 1, read: "" }],
  };
  assert(simulate(eps, "").accepted === true, "epsilon \"\"");
  assert(simulate(eps, "a").accepted === false, "epsilon \"a\"");
});

test("epsilon cycle does not loop forever", () => {
  const cyc = {
    states: [
      { id: 0, name: "q0", x: 0, y: 0, initial: true, final: false },
      { id: 1, name: "q1", x: 100, y: 0, initial: false, final: true },
    ],
    transitions: [
      { from: 0, to: 1, read: "" },
      { from: 1, to: 0, read: "" },
    ],
  };
  assert(simulate(cyc, "").accepted === true, "epsilon cycle terminates");
});

// undo/redo semantics over the snapshot stacks, pure data so node covers it fully
import { createUndo, pushUndo as snapPush, undo as snapUndo, redo as snapRedo } from "../js/undo.js";

function modelOf(type, initialStack) {
  return {
    type,
    ...(type === "pda" ? { initialStack } : {}),
    states: [{ id: 0, name: "q0", x: 80, y: 80, initial: true, final: false }],
    transitions: [],
  };
}

test("undo restores the previous snapshot", () => {
  const u = createUndo();
  const auto = modelOf("fa");
  snapPush(u, auto);
  auto.states.push({ id: 1, name: "q1", x: 240, y: 80, initial: false, final: true });
  assert(snapUndo(u, auto) === true, "undo should act");
  assert(auto.states.length === 1, "state removed by undo");
  assert(snapUndo(u, auto) === false, "undo on empty stack is a no-op");
});

test("redo re-applies what undo removed", () => {
  const u = createUndo();
  const auto = modelOf("fa");
  snapPush(u, auto);
  auto.states.push({ id: 1, name: "q1", x: 240, y: 80, initial: false, final: true });
  snapUndo(u, auto);
  assert(snapRedo(u, auto) === true, "redo should act");
  assert(auto.states.length === 2, "state restored by redo");
  assert(snapRedo(u, auto) === false, "redo on empty stack is a no-op");
});

test("a fresh push invalidates the redo branch", () => {
  const u = createUndo();
  const auto = modelOf("fa");
  snapPush(u, auto);
  auto.states.push({ id: 1, name: "q1", x: 240, y: 80, initial: false, final: false });
  snapUndo(u, auto);
  auto.states[0].name = "renamed";
  snapPush(u, auto);
  assert(snapRedo(u, auto) === false, "redo must be dead after a fork");
});

test("undoing a fa/pda type switch really switches back", () => {
  const u = createUndo();
  const auto = modelOf("fa");
  snapPush(u, auto);
  auto.type = "pda";
  auto.initialStack = "Z";
  snapUndo(u, auto);
  assert(auto.type === "fa", "type restored");
  assert(auto.initialStack === undefined, "initialStack dropped again");
  snapRedo(u, auto);
  assert(auto.type === "pda" && auto.initialStack === "Z", "redo brings pda fields back");
});
