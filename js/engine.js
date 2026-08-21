// engine, simulates the automaton on an input string, no dom knowledge
// supports nfa with epsilon moves, missing transitions mean implicit reject

// epsilon closure of a set of state ids, follows empty-read transitions transitively
export function epsilonClosure(auto, stateSet) {
  const closure = new Set(stateSet);
  const stack = [...stateSet];
  while (stack.length) {
    const sid = stack.pop();
    for (const t of auto.transitions) {
      // empty read is epsilon in jflap
      if (t.from === sid && t.read === "" && !closure.has(t.to)) {
        closure.add(t.to);
        stack.push(t.to);
      }
    }
  }
  return closure;
}

// one step on a single character from a set of active states, also returns which transitions were taken
export function move(auto, activeSet, ch) {
  const next = new Set();
  const via = new Set();
  auto.transitions.forEach((t, idx) => {
    if (activeSet.has(t.from) && t.read === ch) {
      next.add(t.to);
      via.add(idx);
    }
  });
  return { next, via };
}

// full trace for an input string, returns the active set after each position
// steps[0] is before any input, steps[i] is after consuming input[0..i-1]
// each step after the first also carries via, the set of transition indices taken on that character
export function simulate(auto, input) {
  const initials = auto.states.filter(s => s.initial).map(s => s.id);
  let cur = epsilonClosure(auto, new Set(initials));
  const steps = [{ pos: 0, active: new Set(cur), via: new Set() }];
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const { next, via } = move(auto, cur, ch);
    cur = epsilonClosure(auto, next);
    steps.push({ pos: i + 1, active: new Set(cur), via: new Set(via), char: ch });
    // early stop when dead, remaining steps will stay empty
    if (cur.size === 0) {
      for (let j = i + 1; j < input.length; j++) {
        steps.push({ pos: j + 1, active: new Set(), via: new Set(), char: input[j] });
      }
      break;
    }
  }
  const accepted = [...cur].some(id => auto.states.find(s => s.id === id)?.final);
  return { accepted, steps };
}
