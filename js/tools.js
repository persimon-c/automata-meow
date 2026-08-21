// tool implementations, each tool interprets pointer events in canvas space
// a tool never touches the viewport, and the editor never interprets gestures itself

import { addState, deleteState, deleteTransitionAt, findState, toggleInitial, toggleFinal } from "./model.js";

export function createTools() {
  return {
    // link tool memory, first tap picks the from state, second tap completes the transition
    pendingFrom: null,
  };
}

// move tool, drag moves the state, a clean tap just selects it
export const moveTool = {
  down(ctx, hit, pt) {
    ctx.dragging = hit ? { id: hit.id, dx: hit.x - pt.x, dy: hit.y - pt.y, moved: false } : null;
    ctx.selectedId = hit ? hit.id : null;
    if (ctx.dragging) ctx.markDirty();
    ctx.render();
  },
  move(ctx, pt) {
    if (!ctx.dragging) return;
    const s = findState(ctx.auto, ctx.dragging.id);
    if (!s) return;
    const dx = pt.x - (s.x + ctx.dragging.dx);
    const dy = pt.y - (s.y + ctx.dragging.dy);
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
      s.x = pt.x - ctx.dragging.dx;
      s.y = pt.y - ctx.dragging.dy;
      ctx.dragging.moved = true;
      ctx.render();
    }
  },
  up(ctx) {
    ctx.dragging = null;
  },
};

// add state tool, tap empty canvas places a new auto-named state
export const addTool = {
  down(ctx, hit, pt) {
    if (hit) return; // placing on top of an existing state is almost always a mis-tap
    pushAndRun(ctx, () => addState(ctx.auto, pt.x, pt.y));
  },
  move() {},
  up() {},
};

// link tool, tap from state then to state, same state twice makes a self-loop
export const linkTool = {
  down(ctx, hit, pt) {
    if (!hit) {
      ctx.tools.pendingFrom = null;
      ctx.render();
      return;
    }
    if (ctx.tools.pendingFrom === null) {
      ctx.tools.pendingFrom = hit.id;
      ctx.selectedId = hit.id;
      ctx.render();
    } else {
      const from = ctx.tools.pendingFrom;
      ctx.tools.pendingFrom = null;
      ctx.askSymbol(from, hit.id);
    }
  },
  move() {},
  up() {},
};

// delete tool, tap removes a state with its transitions or a single edge
export const deleteTool = {
  down(ctx, hit, pt) {
    if (hit) {
      pushAndRun(ctx, () => deleteState(ctx.auto, hit.id));
      return;
    }
    const tid = ctx.hitEdge(pt);
    if (tid !== null) {
      pushAndRun(ctx, () => deleteTransitionAt(ctx.auto, tid));
    }
  },
  move() {},
  up() {},
};

// initial and final toggles hang off the move tool as double-tap-ish extras,
// kept simple for now, tap select then use the flag buttons that appear
export function toggleFlagsFor(ctx, id, which) {
  pushAndRun(ctx, () => (which === "initial" ? toggleInitial(ctx.auto, id) : toggleFinal(ctx.auto, id)));
}

function pushAndRun(ctx, mutation) {
  // snapshot goes in before the mutation so undo restores the exact prior model
  ctx.pushUndo();
  mutation();
  ctx.render();
  ctx.save();
}
