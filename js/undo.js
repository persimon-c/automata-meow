// snapshot undo/redo, deep copies of the whole model pushed before each mutation
// automata are tiny (2 to 8 states measured), so copying is cheaper than a command framework
// a fresh push invalidates the redo branch, exactly like every editor people already know

const LIMIT = 50;

export function createUndo() {
  return { stack: [], redo: [] };
}

export function pushUndo(undo, auto) {
  undo.stack.push(JSON.stringify(auto));
  if (undo.stack.length > LIMIT) undo.stack.shift();
  // a new action forks history, anything that could be redone is gone
  undo.redo.length = 0;
}

// swaps the current model state with the top of a stack and restores it into the same object,
// shared by undo and redo since they are the same operation over opposite stacks
function swap(undo, auto, from, to) {
  const snap = from.pop();
  if (!snap) return false;
  to.push(JSON.stringify(auto));
  const restored = JSON.parse(snap);
  // whole model, not just states, so undoing a fa/pda type switch really switches back
  auto.type = restored.type ?? auto.type;
  auto.initialStack = restored.initialStack;
  auto.states = restored.states;
  auto.transitions = restored.transitions;
  return true;
}

// restores the previous snapshot, returns true if something was undone
export function undo(undo, auto) {
  return swap(undo, auto, undo.stack, undo.redo);
}

// re-applies the most recently undone action, returns true if something was redone
export function redo(undo, auto) {
  return swap(undo, auto, undo.redo, undo.stack);
}
