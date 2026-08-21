// harness, runs the engine against fixture automata and synthetic edge cases
// run with: node tests/harness.mjs  (or bun tests/harness.mjs)

import { simulate } from "../js/engine.js";

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

// fixture automata transcribed for regression coverage (ground truth measured 2026-08-21)
const item1 = {
  states: [
    { id: 0, name: "q0", x: 80, y: 80, initial: true, final: true },
    { id: 1, name: "q1", x: 240, y: 80, initial: false, final: false },
    { id: 2, name: "q2", x: 80, y: 240, initial: false, final: false },
    { id: 3, name: "q3", x: 240, y: 240, initial: false, final: false },
  ],
  transitions: [
    { from: 2, to: 3, read: "x" }, { from: 3, to: 2, read: "x" },
    { from: 0, to: 1, read: "x" }, { from: 1, to: 0, read: "x" },
    { from: 1, to: 3, read: "y" }, { from: 3, to: 1, read: "y" },
    { from: 0, to: 2, read: "y" }, { from: 2, to: 0, read: "y" },
  ],
};

const item2 = {
  states: [
    { id: 0, name: "q0", x: 80, y: 80, initial: true, final: false },
    { id: 1, name: "q1", x: 0, y: 0, initial: false, final: false },
    { id: 2, name: "q6", x: 0, y: 0, initial: false, final: false },
    { id: 3, name: "q3", x: 0, y: 0, initial: false, final: false },
    { id: 4, name: "q2", x: 0, y: 0, initial: false, final: false },
    { id: 5, name: "q7", x: 0, y: 0, initial: false, final: false },
    { id: 6, name: "q4", x: 0, y: 0, initial: false, final: false },
    { id: 7, name: "q5", x: 0, y: 0, initial: false, final: true },
  ],
  transitions: [
    { from: 7, to: 7, read: "a" }, { from: 2, to: 2, read: "a" },
    { from: 7, to: 7, read: "b" }, { from: 5, to: 5, read: "b" },
    { from: 5, to: 6, read: "a" }, { from: 0, to: 4, read: "b" },
    { from: 1, to: 2, read: "a" }, { from: 3, to: 7, read: "b" },
    { from: 6, to: 5, read: "b" }, { from: 0, to: 1, read: "a" },
    { from: 6, to: 7, read: "a" }, { from: 1, to: 4, read: "b" },
    { from: 4, to: 1, read: "a" }, { from: 2, to: 3, read: "b" },
    { from: 4, to: 5, read: "b" }, { from: 3, to: 2, read: "a" },
  ],
};

const item3 = {
  states: [
    { id: 0, name: "qeven", x: 80, y: 140, initial: true, final: false },
    { id: 1, name: "qodd", x: 280, y: 140, initial: false, final: true },
  ],
  transitions: [
    { from: 0, to: 0, read: "0" }, { from: 0, to: 1, read: "1" },
    { from: 1, to: 1, read: "0" }, { from: 1, to: 0, read: "1" },
    { from: 0, to: 0, read: "2" }, { from: 1, to: 1, read: "2" },
  ],
};

const item4 = {
  states: [
    { id: 0, name: "q0", x: 0, y: 0, initial: true, final: true },
    { id: 1, name: "q1", x: 0, y: 0, initial: false, final: true },
    { id: 2, name: "q2", x: 0, y: 0, initial: false, final: false },
    { id: 3, name: "qX", x: 0, y: 0, initial: false, final: false },
  ],
  transitions: [
    { from: 1, to: 0, read: "t" }, { from: 2, to: 0, read: "t" },
    { from: 1, to: 2, read: "s" }, { from: 2, to: 3, read: "s" },
    { from: 3, to: 3, read: "s" }, { from: 0, to: 0, read: "t" },
    { from: 3, to: 3, read: "t" }, { from: 0, to: 1, read: "s" },
  ],
};

const item5 = {
  states: [
    { id: 0, name: "q0", x: 0, y: 0, initial: true, final: false },
    { id: 1, name: "q1", x: 0, y: 0, initial: false, final: false },
    { id: 2, name: "q2", x: 0, y: 0, initial: false, final: false },
    { id: 3, name: "q3", x: 0, y: 0, initial: false, final: true },
  ],
  transitions: [
    { from: 0, to: 0, read: "0" }, { from: 1, to: 2, read: "0" },
    { from: 1, to: 1, read: "1" }, { from: 2, to: 1, read: "1" },
    { from: 3, to: 0, read: "0" }, { from: 0, to: 1, read: "1" },
    { from: 3, to: 1, read: "1" }, { from: 2, to: 3, read: "0" },
  ],
};

test("Item1 even x/y", () => {
  assert(simulate(item1, "").accepted === true, '"" should accept');
  assert(simulate(item1, "xx").accepted === true, '"xx"');
  assert(simulate(item1, "x").accepted === false, '"x"');
  assert(simulate(item1, "xy").accepted === false, '"xy"');
});

test("Item2 contains aa and bb", () => {
  assert(simulate(item2, "aabb").accepted === true, '"aabb"');
  assert(simulate(item2, "bbaa").accepted === true, '"bbaa"');
  assert(simulate(item2, "aa").accepted === false, '"aa"');
  assert(simulate(item2, "bb").accepted === false, '"bb"');
  assert(simulate(item2, "ababa").accepted === false, '"ababa"');
});

test("Item3 odd base3", () => {
  assert(simulate(item3, "1").accepted === true, '"1"');
  assert(simulate(item3, "0").accepted === false, '"0"');
  assert(simulate(item3, "10").accepted === true, '"10"');
  assert(simulate(item3, "11").accepted === false, '"11"');
});

test("Item4 ss -> t+", () => {
  assert(simulate(item4, "sst").accepted === true, '"sst"');
  assert(simulate(item4, "ss").accepted === false, '"ss"');
  assert(simulate(item4, "tss").accepted === false, '"tss"');
  assert(simulate(item4, "s").accepted === true, '"s"');
});

test("Item5 div4 not 8", () => {
  assert(simulate(item5, "100").accepted === true, '"100"');
  assert(simulate(item5, "1000").accepted === false, '"1000"');
  assert(simulate(item5, "1100").accepted === true, '"1100"');
  assert(simulate(item5, "0").accepted === false, '"0"');
});

test("empty automaton", () => {
  const empty = { states: [{ id: 0, name: "q0", x: 0, y: 0, initial: true, final: true }], transitions: [] };
  assert(simulate(empty, "").accepted === true, 'empty ""');
  assert(simulate(empty, "a").accepted === false, 'empty "a"');
});

test("epsilon NFA", () => {
  const eps = {
    states: [
      { id: 0, name: "q0", x: 0, y: 0, initial: true, final: false },
      { id: 1, name: "q1", x: 100, y: 0, initial: false, final: true },
    ],
    transitions: [{ from: 0, to: 1, read: "" }],
  };
  assert(simulate(eps, "").accepted === true, 'epsilon ""');
  assert(simulate(eps, "a").accepted === false, 'epsilon "a"');
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
  assert(simulate(cyc, "").accepted === true, 'cycle ""');
});
