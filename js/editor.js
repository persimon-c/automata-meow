// editor, owns the pointer pipeline and dispatches events to the active tool
// pipeline: pointer event -> canvas coords -> active tool -> model mutation -> render -> autosave

import { toCanvas, createViewport, applyPinch } from "./viewport.js";
import { hitState, hitEdgeIndex, applyViewport } from "./renderer.js";
import { createTools, moveTool, addTool, linkTool, deleteTool } from "./tools.js";

export function createEditor(svg, auto) {
  const vp = createViewport();
  const tools = createTools();

  // rubber-band preview for the link tool, dashed line from from-state to cursor
  const preview = document.createElementNS("http://www.w3.org/2000/svg", "path");
  preview.id = "preview-line";
  preview.setAttribute("stroke", "#4c8dff");
  preview.setAttribute("stroke-width", "2");
  preview.setAttribute("stroke-dasharray", "6 4");
  preview.setAttribute("fill", "none");
  preview.setAttribute("marker-end", "url(#arrow)");
  preview.style.display = "none";
  preview.style.pointerEvents = "none";
  // preview lives directly under svg so it does not get wiped by renderer re-renders
  svg.appendChild(preview);
  function updatePreview(sp) {
    if (tools.pendingFrom === null) {
      preview.style.display = "none";
      return;
    }
    const from = auto.states.find(s => s.id === tools.pendingFrom);
    if (!from) { preview.style.display = "none"; return; }
    const p = toCanvas(vp, sp.x, sp.y);
    // start at the circle edge, not the center
    const dx = p.x - from.x, dy = p.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const R = 26;
    const x1 = from.x + ux * R, y1 = from.y + uy * R;
    preview.setAttribute("d", `M ${x1} ${y1} L ${p.x} ${p.y}`);
    // keep preview in sync with viewport
    preview.setAttribute("transform", `translate(${vp.tx},${vp.ty}) scale(${vp.scale})`);
    preview.style.display = "";
  }
  const ctx = {
    auto,
    vp,
    tools,
    selectedId: null,
    dragging: null,
    tool: addTool,
    toolName: "add",
    pushUndo: null,
    render: null,
    save: null,
    hitEdge: pt => hitEdgeIndex(svg, vp, pt.x, pt.y),
    askSymbol: null,
    log: () => {},
  };

  // multi-pointer bookkeeping, two fingers always mean pinch or pan never a tool gesture
  const pointers = new Map();
  let pinch = null;   // { mid, dist }
  let downPt = null;  // screen coords of the single pointer that started a gesture
  let moved = false;
  let rightPan = null; // { start, origin: {tx, ty} } for right-click drag panning on desktop

  // right-click context menu would steal the gesture on desktop, suppress it on the canvas
  svg.addEventListener("contextmenu", e => e.preventDefault());

  function localPt(e) {
    // returns {x, y} in screen space, callers all read .x / .y
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  svg.addEventListener("pointerdown", e => {
    // capture can throw for synthetic or already-gone pointers, losing the gesture over it is silly
    try { svg.setPointerCapture(e.pointerId); } catch {}
    const sp = localPt(e);
    // right-click drag pans the workspace on desktop, independent of the active tool
    if (e.button === 2) {
      rightPan = { start: sp, origin: { tx: vp.tx, ty: vp.ty } };
      return;
    }
    pointers.set(e.pointerId, sp);
    if (pointers.size === 2) {
      // second finger cancels any in-progress tool gesture and starts the pinch
      const pts = [...pointers.values()];
      pinch = { mid: midOf(pts[0], pts[1]), dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) };
      ctx.dragging = null;
      return;
    }
    if (pointers.size > 2) return;
    downPt = sp;
    moved = false;
    const cp = toCanvas(vp, sp.x, sp.y);
    const hit = hitState(auto, vp, sp.x, sp.y);
    ctx.log(`down ${ctx.toolName} screen ${Math.round(sp.x)},${Math.round(sp.y)} canvas ${Math.round(cp.x)},${Math.round(cp.y)} hit ${hit ? hit.name : "none"}`);
    ctx.tool.down(ctx, hit, cp);
    // show or hide the link preview right after the tool runs
    if (tools.pendingFrom !== null) updatePreview(sp);
    else preview.style.display = "none";
  });

  svg.addEventListener("pointermove", e => {
    if (rightPan) {
      const sp = localPt(e);
      vp.tx = rightPan.origin.tx + (sp.x - rightPan.start.x);
      vp.ty = rightPan.origin.ty + (sp.y - rightPan.start.y);
      applyViewport(svg, vp);
      if (tools.pendingFrom !== null) updatePreview(sp);
      return;
    }
    if (!pointers.has(e.pointerId)) return;
    const sp = localPt(e);
    pointers.set(e.pointerId, sp);
    if (pointers.size === 2 && pinch) {
      const pts = [...pointers.values()];
      const mid = midOf(pts[0], pts[1]);
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      applyPinch(vp, pinch.mid, pinch.dist, mid, dist);
      pinch = { mid, dist };
      applyViewport(svg, vp);
      if (tools.pendingFrom !== null) updatePreview(sp);
      return;
    }
    if (moved || (downPt && Math.hypot(sp.x - downPt.x, sp.y - downPt.y) > DRAG)) moved = true;
    const cp = toCanvas(vp, sp.x, sp.y);
    ctx.tool.move(ctx, cp);
    if (tools.pendingFrom !== null) updatePreview(sp);
  });

  function finish(e) {
    if (e.button === 2) rightPan = null;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      // a tap is a down+up without meaningful movement, tools decide what taps mean
      ctx.tool.up(ctx);
      downPt = null;
      moved = false;
    }
  }
  svg.addEventListener("pointerup", finish);
  svg.addEventListener("pointercancel", finish);

  // browser pan/zoom gestures on the page would fight the editor for the same fingers
  svg.addEventListener("wheel", e => {
    e.preventDefault();
    const sp = localPt(e);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomAt(sp, factor);
    if (tools.pendingFrom !== null) updatePreview(sp);
  }, { passive: false });

  const DRAG = 8;

  function zoomAt(sp, factor) {
    const ns = Math.min(6, Math.max(0.2, vp.scale * factor));
    const real = ns / vp.scale;
    // keep the point under the cursor fixed while zooming
    vp.tx = sp.x - (sp.x - vp.tx) * real;
    vp.ty = sp.y - (sp.y - vp.ty) * real;
    vp.scale = ns;
    applyViewport(svg, vp);
  }

  function midOf(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  return {
    ctx,
    setTool(name) {
      const map = { add: addTool, move: moveTool, link: linkTool, delete: deleteTool };
      if (!map[name]) return;
      ctx.tool = map[name];
      ctx.toolName = name;
      ctx.tools.pendingFrom = null;
      preview.style.display = "none";
    },
    zoomAt,
  };
}
