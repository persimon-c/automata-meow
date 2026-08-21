// engine, simulates the automaton on an input string, no dom knowledge
// supports nfa with epsilon moves, missing transitions mean implicit reject

/**
 * A state of the automaton, coordinates are canvas units owned by the renderer
 * @typedef {Object} State
 * @property {number} id        stable identity, independent of name
 * @property {string} name      display label, never derived from id
 * @property {number} x
 * @property {number} y
 * @property {boolean} initial
 * @property {boolean} final
 */

/**
 * One transition. For FA only `read` is present; PDA transitions add `pop`/`push`
 * where the empty string means epsilon and push's leftmost char ends up on top
 * @typedef {Object} Transition
 * @property {number} from
 * @property {number} to
 * @property {string} read   empty string = epsilon
 * @property {string} [pop]
 * @property {string} [push]
 */

/**
 * The whole automaton model, plain data shared by every module
 * @typedef {Object} Automaton
 * @property {"fa"|"pda"} type
 * @property {string} [initialStack]  pda only, defaults to "Z"
 * @property {State[]} states
 * @property {Transition[]} transitions
 */

/**
 * One pda configuration in a breadth-first search over (state, stack, input position)
 * @typedef {Object} PdaConfig
 * @property {number} state
 * @property {string[]} stack  index 0 is bottom, last element is top
 * @property {number} pos
 */

/**
 * One step of a trace. FA steps carry active state ids; pda steps additionally
 * carry the full config list for the stack display. `via` holds the transition
 * indices taken on the way into this step, for highlight rendering
 * @typedef {Object} SimStep
 * @property {number} pos
 * @property {Set<number>} active
 * @property {Set<number>} via
 * @property {string} [char]
 * @property {PdaConfig[]} [configs]
 */

/**
 * @typedef {Object} SimResult
 * @property {boolean} accepted
 * @property {SimStep[]} steps  index 0 is the start configuration before any input
 */

// epsilon closure of a set of state ids, follows empty-read transitions transitively
// also returns which epsilon transitions were taken, for highlighting
export function epsilonClosure(auto, stateSet) {
  const closure = new Set(stateSet);
  const via = new Set();
  const stack = [...stateSet];
  while (stack.length) {
    const sid = stack.pop();
    for (let idx = 0; idx < auto.transitions.length; idx++) {
      const t = auto.transitions[idx];
      // empty read is epsilon in jflap
      if (t.from === sid && t.read === "" && !closure.has(t.to)) {
        closure.add(t.to);
        via.add(idx);
        stack.push(t.to);
      }
    }
  }
  return { closure, via };
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
  if (auto.type === "pda") return pdaSimulate(auto, input);
  const initials = auto.states.filter(s => s.initial).map(s => s.id);
  let { closure: cur, via: via0 } = epsilonClosure(auto, new Set(initials));
  const steps = [{ pos: 0, active: new Set(cur), via: via0 }];
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const { next, via: viaMove } = move(auto, cur, ch);
    const { closure: newCur, via: viaEps } = epsilonClosure(auto, next);
    const combinedVia = new Set([...viaMove, ...viaEps]);
    cur = newCur;
    steps.push({ pos: i + 1, active: new Set(cur), via: combinedVia, char: ch });
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

// ---------- PDA support, stack is an array with top at the end ----------

export function canPop(stack, pop) {
  if (!pop) return true;
  return stack.length > 0 && stack[stack.length - 1] === pop;
}

export function applyPopPush(stack, pop, push) {
  const next = [...stack];
  if (pop) {
    if (next.length === 0 || next[next.length - 1] !== pop) return null;
    next.pop();
  }
  if (push) {
    // leftmost char of push ends up on top, so reverse before pushing
    for (let i = push.length - 1; i >= 0; i--) next.push(push[i]);
  }
  return next;
}

function pdaEpsilonClosure(auto, configs) {
  const closure = [...configs];
  const queue = [...configs];
  const seen = new Set(closure.map(c => `${c.state}|${c.stack.join(",")}|${c.pos}`));
  const via = new Set();
  while (queue.length) {
    const cfg = queue.shift();
    for (let idx = 0; idx < auto.transitions.length; idx++) {
      const t = auto.transitions[idx];
      if (t.from !== cfg.state) continue;
      if (t.read !== "") continue;
      if (!canPop(cfg.stack, t.pop)) continue;
      const ns = applyPopPush(cfg.stack, t.pop, t.push);
      if (ns === null) continue;
      const key = `${t.to}|${ns.join(",")}|${cfg.pos}`;
      if (seen.has(key)) continue;
      seen.add(key);
      via.add(idx);
      const ncfg = { state: t.to, stack: ns, pos: cfg.pos };
      closure.push(ncfg);
      queue.push(ncfg);
    }
  }
  return { closure, via };
}

function pdaMove(auto, configs, ch) {
  const next = [];
  const via = new Set();
  for (const cfg of configs) {
    for (let idx = 0; idx < auto.transitions.length; idx++) {
      const t = auto.transitions[idx];
      if (t.from !== cfg.state) continue;
      if (t.read !== ch) continue;
      if (!canPop(cfg.stack, t.pop)) continue;
      const ns = applyPopPush(cfg.stack, t.pop, t.push);
      if (ns === null) continue;
      next.push({ state: t.to, stack: ns, pos: cfg.pos + 1 });
      via.add(idx);
    }
  }
  return { next, via };
}

function pdaSimulate(auto, input) {
  const initials = auto.states.filter(s => s.initial).map(s => s.id);
  const initStack = [auto.initialStack || "Z"];
  let { closure: cur, via: via0 } = pdaEpsilonClosure(auto, initials.map(id => ({ state: id, stack: [...initStack], pos: 0 })));
  const steps = [{ pos: 0, active: new Set(cur.map(c => c.state)), configs: cur, via: via0 }];
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const { next, via: viaMove } = pdaMove(auto, cur, ch);
    const { closure: newCur, via: viaEps } = pdaEpsilonClosure(auto, next);
    const combinedVia = new Set([...viaMove, ...viaEps]);
    cur = newCur;
    steps.push({ pos: i + 1, active: new Set(cur.map(c => c.state)), configs: cur, via: combinedVia, char: ch });
    if (cur.length === 0) {
      for (let j = i + 1; j < input.length; j++) {
        steps.push({ pos: j + 1, active: new Set(), configs: [], via: new Set(), char: input[j] });
      }
      break;
    }
  }
  const accepted = cur.some(c => auto.states.find(s => s.id === c.state)?.final);
  return { accepted, steps };
}
