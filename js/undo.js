// snapshot undo, deep copies of the whole model pushed before each mutation
// automata are tiny (2 to 8 states measured), so copying is cheaper than a command framework

const LIMIT = 50;

export function createUndo() {
  return { stack: [] };
}

export function pushUndo(undo, auto) {
  undo.stack.push(JSON.stringify(auto));
  if (undo.stack.length > LIMIT) undo.stack.shift();
}

// restores the previous snapshot into the same model object, returns true if something was undone
export function undo(undo, auto) {
  const snap = undo.stack.pop();
  if (!snap) return false;
  const restored = JSON.parse(snap);
  auto.states = restored.states;
  auto.transitions = restored.transitions;
  return true;
}
