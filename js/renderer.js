// svg renderer, consumes the model and draws it, owns all edge geometry
// the model carries no shape info, curves and offsets are derived here at draw time

import { toCanvas } from "./viewport.js";

const R = 26; // state circle radius in canvas units
const EDGE_SPACING = 40; // perpendicular gap between parallel edges

// build the full svg content fresh each call, tiny automata make this cheap
export function render(svg, auto, opts) {
  svg.innerHTML = "";
  const defs = el("defs");
  defs.innerHTML =
    '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
    '<path d="M 0 0 L 10 5 L 0 10 z" fill="#e8e8e8"></path></marker>';
  const root = el("g");
  root.setAttribute("id", "world");
  const edges = el("g");
  const nodes = el("g");
  root.appendChild(edges);
  root.appendChild(nodes);
  svg.appendChild(defs);
  svg.appendChild(root);
  svg._root = root;

  // group transitions by unordered endpoint pair so parallels get stable offsets,
  // self-loops get their own group since they orbit a single state
  const groups = new Map();
  auto.transitions.forEach((t, tid) => {
    const key = t.from === t.to ? "self:" + t.from : "pair:" + Math.min(t.from, t.to) + ":" + Math.max(t.from, t.to);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ t, tid });
  });

  const geoms = [];
  for (const list of groups.values()) {
    list.forEach((entry, i) => {
      const geom = entry.t.from === entry.t.to
        ? selfLoopGeom(auto, entry.t, i, list.length)
        : edgeGeom(auto, entry.t, i, list.length);
      // empty read means epsilon in jflap, shown as the ε glyph
      geom.symbol = entry.t.read || "ε";
      geoms[entry.tid] = geom;
      drawEdge(edges, geom, entry.tid);
    });
  }
  // sampled geometry is kept for hit testing, samples live in canvas space
  svg._geoms = geoms;

  for (const s of auto.states) drawState(nodes, s, opts);
}

// apply the viewport transform to the world group, called on every pan/zoom without a re-render
export function applyViewport(svg, vp) {
  const root = svg._root;
  if (root) root.setAttribute("transform", `translate(${vp.tx},${vp.ty}) scale(${vp.scale})`);
}

function el(tag) {
  return document.createElementNS("http://www.w3.org/2000/svg", tag);
}

function pos(auto, id) {
  const s = auto.states.find(st => st.id === id);
  return s ? { x: s.x, y: s.y } : null;
}

// straight or curved edge between two distinct states
function edgeGeom(auto, t, index, total) {
  const a = pos(auto, t.from);
  const b = pos(auto, t.to);
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  // trim the ends so lines start and stop on the circle boundary, not under it
  const p1 = { x: a.x + ux * R, y: a.y + uy * R };
  const p2 = { x: b.x - ux * R, y: b.y - uy * R };
  // parallel edges fan out around the straight line, single edges stay straight
  const k = (index - (total - 1) / 2) * (total > 1 ? EDGE_SPACING : 0);
  const c = { x: (p1.x + p2.x) / 2 - uy * k, y: (p1.y + p2.y) / 2 + ux * k };
  const d = `M ${p1.x} ${p1.y} Q ${c.x} ${c.y} ${p2.x} ${p2.y}`;
  // quadratic bezier midpoint for the label
  const label = { x: 0.25 * p1.x + 0.5 * c.x + 0.25 * p2.x, y: 0.25 * p1.y + 0.5 * c.y + 0.25 * p2.y };
  return { d, label, samples: sampleQuad(p1, c, p2) };
}

// self-loop drawn as an arc over the state, parallel loops fan out by angle
function selfLoopGeom(auto, t, index, total) {
  const s = pos(auto, t.from);
  const shift = (index - (total - 1) / 2) * (Math.PI / 180) * 42;
  const a1 = -Math.PI / 3 + shift;  // start on the upper right of the circle
  const a2 = -Math.PI + a1;         // end on the upper left, arc goes over the top
  const p1 = { x: s.x + R * Math.cos(a1), y: s.y + R * Math.sin(a1) };
  const p2 = { x: s.x + R * Math.cos(a2), y: s.y + R * Math.sin(a2) };
  const loopR = 0.62 * R;
  const d = `M ${p1.x} ${p1.y} A ${loopR} ${loopR} 0 0 1 ${p2.x} ${p2.y}`;
  const midA = (a1 + a2) / 2;
  const label = { x: s.x + (R + 16) * Math.cos(midA), y: s.y + (R + 16) * Math.sin(midA) };
  return { d, label, samples: sampleArc(s, R, a1, a2) };
}

function sampleQuad(p1, c, p2) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push({
      x: (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * c.x + t * t * p2.x,
      y: (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * c.y + t * t * p2.y,
    });
  }
  return pts;
}

function sampleArc(center, r, a1, a2) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const a = a1 + ((a2 - a1) * i) / 12;
    pts.push({ x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) });
  }
  return pts;
}

function drawEdge(layer, geom, tid) {
  // wide invisible stroke is the real tap target, thin visible line would be brutal on a phone
  const hit = el("path");
  hit.setAttribute("d", geom.d);
  hit.setAttribute("stroke", "transparent");
  hit.setAttribute("stroke-width", "18");
  hit.setAttribute("fill", "none");
  hit.dataset.tid = tid;
  hit.classList.add("edge-hit");
  const vis = el("path");
  vis.setAttribute("d", geom.d);
  vis.setAttribute("stroke", "#cfcfcf");
  vis.setAttribute("stroke-width", "2");
  vis.setAttribute("fill", "none");
  vis.setAttribute("marker-end", "url(#arrow)");
  vis.setAttribute("pointer-events", "none");
  const label = el("text");
  label.setAttribute("x", geom.label.x);
  label.setAttribute("y", geom.label.y);
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("font-size", "15");
  label.setAttribute("fill", "#ffd27f");
  label.setAttribute("pointer-events", "none");
  label.textContent = geom.symbol;
  layer.appendChild(hit);
  layer.appendChild(vis);
  layer.appendChild(label);
}

function drawState(layer, s, opts) {
  const g = el("g");
  g.dataset.sid = s.id;
  g.classList.add("state");
  const selected = opts.selectedId === s.id || opts.pendingFrom === s.id;
  if (s.initial) {
    // short stub arrow pointing into the state marks the start
    const arr = el("line");
    arr.setAttribute("x1", s.x - R - 20);
    arr.setAttribute("y1", s.y);
    arr.setAttribute("x2", s.x - R - 4);
    arr.setAttribute("y2", s.y);
    arr.setAttribute("stroke", "#e8e8e8");
    arr.setAttribute("stroke-width", "2");
    arr.setAttribute("marker-end", "url(#arrow)");
    arr.setAttribute("pointer-events", "none");
    g.appendChild(arr);
  }
  const c = el("circle");
  c.setAttribute("cx", s.x);
  c.setAttribute("cy", s.y);
  c.setAttribute("r", R);
  c.setAttribute("fill", "#2a2a2a");
  c.setAttribute("stroke", selected ? "#4c8dff" : "#e8e8e8");
  c.setAttribute("stroke-width", selected ? "3.5" : "2");
  g.appendChild(c);
  if (s.final) {
    // accepting states get the classic double ring
    const inner = el("circle");
    inner.setAttribute("cx", s.x);
    inner.setAttribute("cy", s.y);
    inner.setAttribute("r", R - 6);
    inner.setAttribute("fill", "none");
    inner.setAttribute("stroke", "#e8e8e8");
    inner.setAttribute("stroke-width", "1.6");
    inner.setAttribute("pointer-events", "none");
    g.appendChild(inner);
  }
  const name = el("text");
  name.setAttribute("x", s.x);
  name.setAttribute("y", s.y);
  name.setAttribute("text-anchor", "middle");
  name.setAttribute("dominant-baseline", "central");
  name.setAttribute("font-size", "14");
  name.setAttribute("fill", "#e8e8e8");
  name.setAttribute("pointer-events", "none");
  name.textContent = s.name;
  g.appendChild(name);
  layer.appendChild(g);
}

// attach symbol text to an already created edge group, used during render pass
export function decorateEdges(svg, auto) {
  svg.querySelectorAll("text").forEach(t => t.remove());
  const edgeLayer = svg._root.firstChild;
  auto.transitions.forEach((t, tid) => {
    // find matching geometry by re-deriving it, cheap at this scale
  });
}

// hit tests work in canvas space against sampled geometry, tolerance is screen px converted to canvas units
export function hitState(auto, vp, sx, sy) {
  const p = toCanvas(vp, sx, sy);
  const tol = 14 / vp.scale + R;
  let best = null, bestD = Infinity;
  for (const s of auto.states) {
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d < tol && d < bestD) { best = s; bestD = d; }
  }
  return best;
}

export function hitEdgeIndex(svg, vp, sx, sy) {
  const p = toCanvas(vp, sx, sy);
  const tol = 16 / vp.scale;
  let best = null, bestD = Infinity;
  (svg._geoms || []).forEach((g, tid) => {
    if (!g) return;
    for (const pt of g.samples) {
      const d = Math.hypot(pt.x - p.x, pt.y - p.y);
      if (d < tol && d < bestD) { best = tid; bestD = d; }
    }
  });
  return best;
}
