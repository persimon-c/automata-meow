// automaton model, pure data with zero rendering or dom knowledge
// shape: { type, states: [{id, name, x, y, initial, final}], transitions: [{from, to, read, pop, push}] }
// pop and push are only meaningful for pda, empty string means no stack operation

export function createAutomaton(type = "fa") {
  return { type, states: [], transitions: [] };
}

// next free numeric id, derived from existing ids so imports never collide
export function nextId(auto) {
  let max = -1;
  for (const s of auto.states) max = Math.max(max, s.id);
  return max + 1;
}

// first unused q-name in placement order, never assumed to match the id
export function nextStateName(auto) {
  const names = new Set(auto.states.map(s => s.name));
  let i = 0;
  while (names.has("q" + i)) i++;
  return "q" + i;
}

export function findState(auto, id) {
  return auto.states.find(s => s.id === id) || null;
}

export function addState(auto, x, y) {
  const s = { id: nextId(auto), name: nextStateName(auto), x, y, initial: false, final: false };
  auto.states.push(s);
  return s;
}

export function deleteState(auto, id) {
  auto.states = auto.states.filter(s => s.id !== id);
  // transitions die with their endpoints, jflap has no dangling edges
  auto.transitions = auto.transitions.filter(t => t.from !== id && t.to !== id);
}

export function addTransition(auto, from, to, read, pop = "", push = "") {
  const t = { from, to, read };
  // keep fa files clean, only store stack fields when they carry information
  if (pop !== "" || push !== "" || auto.type === "pda") {
    t.pop = pop;
    t.push = push;
  }
  auto.transitions.push(t);
  return t;
}

export function deleteTransitionAt(auto, index) {
  auto.transitions.splice(index, 1);
}

// toggle helpers for the initial and final flags, a state can hold both at once
export function toggleInitial(auto, id) {
  const s = findState(auto, id);
  if (s) {
    s.initial = !s.initial;
    // jflap allows several initial states in the file even though dfa theory wants one
  }
}

export function toggleFinal(auto, id) {
  const s = findState(auto, id);
  if (s) s.final = !s.final;
}
