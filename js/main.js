// main, wires model + editor + renderer + ui together and owns persistence

import { createAutomaton } from "./model.js";
import { toggleInitial, toggleFinal } from "./model.js";
import { render, applyViewport, restyleSim } from "./renderer.js";
import { createEditor } from "./editor.js";
import { createUndo, pushUndo, undo, redo } from "./undo.js";
import * as jff from "./jff.js";
import { simulate } from "./engine.js";

const STORAGE_KEY = "automata-meow:model";

const svg = document.getElementById("canvas");
const debugEl = document.getElementById("debug");
const dirtyEl = document.getElementById("dirty");

// boot from autosave when present, otherwise an empty sheet
let auto = createAutomaton();
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    auto = JSON.parse(saved);
    // drop any states corrupted by the earlier localPt bug, they render at NaN and clutter storage
    const before = auto.states.length;
    auto.states = auto.states.filter(s => Number.isFinite(s.x) && Number.isFinite(s.y));
    auto.transitions = auto.transitions.filter(t => auto.states.some(s => s.id === t.from) && auto.states.some(s => s.id === t.to));
    if (auto.states.length !== before) localStorage.setItem(STORAGE_KEY, JSON.stringify(auto));
  }
} catch (err) {
  console.warn("autosave was corrupt, starting fresh", err);
}

const undoStack = createUndo();
let sim = null; // { input, steps, pos, accepted } while simulating, null otherwise

// debug log stays quiet unless ?debug is in the url, phone bugs need on-screen logs
const DEBUG = new URLSearchParams(location.search).has("debug");
function log(msg) {
  if (!DEBUG) return;
  const time = new Date().toLocaleTimeString();
  debugEl.textContent = (time + " " + msg + "\n" + debugEl.textContent).split("\n").slice(0, 6).join("\n");
}

function markDirty() {
  const name = document.getElementById("export-name")?.value.trim() || "automaton";
  const ext = document.getElementById("export-ext")?.value || ".jflap";
  dirtyEl.textContent = `${name}${ext} ● unsaved`;
  dirtyEl.classList.remove("hidden");
}

function clearDirty() {
  dirtyEl.classList.add("hidden");
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auto));
}

// coalesce render requests into one per animation frame, drag moves fire far faster than screens paint
let renderPending = false;
function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    fullRender();
    markDirty();
  });
}

// re-run the simulation against the current automaton and input string, clamping the step position
function refreshSim() {
  if (!sim) return;
  const result = simulate(auto, simInputEl.value);
  const keptPos = Math.min(sim.pos, result.steps.length - 1);
  sim.steps = result.steps;
  sim.accepted = result.accepted;
  sim.input = simInputEl.value;
  sim.pos = keptPos < 0 ? 0 : keptPos;
}

// highlight opts derived from the current editor + sim state, shared by render paths
function displayOpts() {
  const step = sim ? sim.steps[sim.pos] : null;
  return {
    selectedId: editor.ctx.selectedId,
    pendingFrom: editor.ctx.tools.pendingFrom,
    activeIds: step ? step.active : null,
    activeTransitionIds: step ? step.via : null,
  };
}

function fullRender() {
  refreshSim();
  render(svg, auto, displayOpts());
  applyViewport(svg, editor.ctx.vp);
  refreshStateActions();
  updateSimBar();
  updateLayout();
  // undo/redo can restore an older model, so the topbar controls must follow it
  typeSelect.value = auto.type || "fa";
  updateInitialStackVisibility();
  updateHistoryButtons();
}

// history buttons dim when their stack has nothing to act on
function updateHistoryButtons() {
  document.getElementById("btn-undo").disabled = undoStack.stack.length === 0;
  document.getElementById("btn-redo").disabled = undoStack.redo.length === 0;
}

// light path for simulation stepping and input edits, retints existing nodes instead of rebuilding
function updateSimDisplay() {
  restyleSim(svg, displayOpts());
  updateSimBar();
}

function updateLayout() {
  const topbar = document.getElementById("topbar");
  const simBarEl = document.getElementById("sim-bar");
  if (topbar && simBarEl && !simBarEl.classList.contains("hidden")) {
    simBarEl.style.top = topbar.offsetHeight + "px";
  }
  const emptyHint = document.getElementById("empty-hint");
  if (emptyHint) emptyHint.classList.toggle("hidden", auto.states.length !== 0);
}

function updatePopupPositions() {
  const vv = window.visualViewport;
  const kbHeight = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  const bottom = 84 + kbHeight;
  for (const id of ["symbol-pop", "rename-pop", "state-actions"]) {
    const el = document.getElementById(id);
    if (el) el.style.bottom = bottom + "px";
  }
}

window.addEventListener("resize", updateLayout);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updatePopupPositions);
  window.visualViewport.addEventListener("scroll", updatePopupPositions);
}

// state actions row, only meaningful while a state is actually selected in move mode
const stateActions = document.getElementById("state-actions");
function refreshStateActions() {
  const id = editor.ctx.selectedId;
  const s = id === null ? null : auto.states.find(x => x.id === id);
  const show = !!s && editor.ctx.toolName === "move";
  stateActions.classList.toggle("hidden", !show);
  if (s) {
    document.getElementById("btn-initial").classList.toggle("on", s.initial);
    document.getElementById("btn-final").classList.toggle("on", s.final);
  }
}

function withSelected(run) {
  const id = editor.ctx.selectedId;
  if (id === null) return;
  pushUndo(undoStack, auto);
  run(id);
  fullRender();
  save();
}

document.getElementById("btn-initial").addEventListener("click", () => withSelected(id => toggleInitial(auto, id)));
document.getElementById("btn-final").addEventListener("click", () => withSelected(id => toggleFinal(auto, id)));

// rename flow, same popup pattern as the symbol input
const renamePop = document.getElementById("rename-pop");
const renameInput = document.getElementById("rename-input");

document.getElementById("btn-rename").addEventListener("click", () => {
  const s = auto.states.find(x => x.id === editor.ctx.selectedId);
  if (!s) return;
  renameInput.value = s.name;
  renamePop.classList.remove("hidden");
  renameInput.focus();
  renameInput.select();
});

function closeRename(commit) {
  const id = editor.ctx.selectedId;
  const value = renameInput.value.trim();
  renamePop.classList.add("hidden");
  // empty names are rejected rather than silently blanking the label
  if (commit && id !== null && value) {
    withSelected(sid => {
      const s = auto.states.find(x => x.id === sid);
      if (s) s.name = value;
    });
  }
}

const editor = createEditor(svg, auto);

editor.ctx.pushUndo = () => pushUndo(undoStack, auto);
editor.ctx.render = () => scheduleRender();
editor.ctx.markDirty = markDirty;
editor.ctx.save = save;
editor.ctx.log = log;

// automaton type selector, FA vs PDA, kept in sync with the model and the file import
const typeSelect = document.getElementById("automaton-type");
const initialStackInput = document.getElementById("initial-stack");
typeSelect.value = auto.type || "fa";
function updateInitialStackVisibility() {
  const isPda = auto.type === "pda";
  initialStackInput.style.display = isPda ? "" : "none";
  if (isPda) initialStackInput.value = auto.initialStack || "Z";
}
updateInitialStackVisibility();
typeSelect.addEventListener("change", () => {
  const newType = typeSelect.value;
  if (auto.type !== newType) {
    pushUndo(undoStack, auto);
    auto.type = newType;
    if (newType === "pda" && !auto.initialStack) auto.initialStack = "Z";
    updateInitialStackVisibility();
    fullRender();
    save();
    markDirty();
  }
});
initialStackInput.addEventListener("input", () => {
  const val = initialStackInput.value.trim() || "Z";
  if (auto.initialStack !== val) {
    pushUndo(undoStack, auto);
    auto.initialStack = val;
    fullRender();
    save();
    markDirty();
  }
});

const simBar = document.getElementById("sim-bar");
const simInputEl = document.getElementById("sim-input");
const simPosEl = document.getElementById("sim-pos");
const simStatusEl = document.getElementById("sim-status");
const simStackEl = document.getElementById("sim-stack");
const simBtn = document.getElementById("btn-sim");

function updateSimBar() {
  if (!sim) return;
  simPosEl.textContent = `${sim.pos} / ${sim.steps.length - 1}`;
  simStatusEl.textContent = sim.accepted ? "accept" : "reject";
  simStatusEl.className = sim.accepted ? "accept" : "reject";
  if (auto.type === "pda" && sim.steps[sim.pos]?.configs) {
    const cfgs = sim.steps[sim.pos].configs;
    if (cfgs.length === 0) {
      simStackEl.textContent = "stack: ∅";
    } else if (cfgs.length === 1) {
      simStackEl.textContent = `stack: ${cfgs[0].stack.join("") || "ε"}`;
    } else {
      const stacks = cfgs.slice(0, 3).map(c => c.stack.join("") || "ε").join(" | ");
      const more = cfgs.length > 3 ? ` +${cfgs.length - 3} more` : "";
      simStackEl.textContent = `stacks: ${stacks}${more}`;
    }
  } else if (simStackEl) {
    simStackEl.textContent = "";
  }
}

function enterSim() {
  const result = simulate(auto, simInputEl.value);
  sim = { input: simInputEl.value, steps: result.steps, pos: result.steps.length - 1, accepted: result.accepted };
  simBar.classList.remove("hidden");
  simBtn.classList.add("active");
  fullRender();
}

function exitSim() {
  sim = null;
  simBar.classList.add("hidden");
  simBtn.classList.remove("active");
  simStatusEl.textContent = "";
  fullRender();
}

simBtn.addEventListener("click", () => {
  if (sim) exitSim();
  else enterSim();
});

simInputEl.addEventListener("input", () => {
  if (!sim) return;
  refreshSim();
  updateSimDisplay();
});

document.getElementById("sim-prev").addEventListener("click", () => {
  if (!sim || sim.pos <= 0) return;
  sim.pos--;
  updateSimDisplay();
});
document.getElementById("sim-next").addEventListener("click", () => {
  if (!sim || sim.pos >= sim.steps.length - 1) return;
  sim.pos++;
  updateSimDisplay();
});

// symbol input flow for the link tool, empty input means epsilon
const symPop = document.getElementById("symbol-pop");
const symInput = document.getElementById("symbol-input");
const symPair = document.getElementById("symbol-pair");

editor.ctx.askSymbol = (fromId, toId) => {
  const from = auto.states.find(s => s.id === fromId);
  const to = auto.states.find(s => s.id === toId);
  symPair.textContent = `${from ? from.name : "?"} → ${to ? to.name : "?"}`;
  symPop.classList.remove("hidden");
  // show the right inputs for the current automaton type
  const isPda = auto.type === "pda";
  document.getElementById("symbol-fa").classList.toggle("hidden", isPda);
  document.getElementById("symbol-pda").classList.toggle("hidden", !isPda);
  if (isPda) {
    document.getElementById("pda-read").value = "";
    document.getElementById("pda-pop").value = "";
    document.getElementById("pda-push").value = "";
    document.getElementById("pda-read").focus();
  } else {
    symInput.value = "";
    symInput.focus();
  }
  symPop.dataset.from = fromId;
  symPop.dataset.to = toId;
};

function closeSymbol(commit) {
  const from = parseInt(symPop.dataset.from, 10);
  const to = parseInt(symPop.dataset.to, 10);
  symPop.classList.add("hidden");
  if (commit && !Number.isNaN(from) && !Number.isNaN(to)) {
    pushUndo(undoStack, auto);
    if (auto.type === "pda") {
      const read = document.getElementById("pda-read").value.trim();
      const pop = document.getElementById("pda-pop").value.trim();
      const push = document.getElementById("pda-push").value.trim();
      auto.transitions.push({ from, to, read, pop, push });
    } else {
      const read = symInput.value.trim();
      // empty read is epsilon, stored as the empty string exactly like jflap does
      auto.transitions.push({ from, to, read });
    }
    fullRender();
    save();
    markDirty();
  }
  editor.ctx.selectedId = null;
  fullRender();
}

document.getElementById("symbol-ok").addEventListener("click", () => closeSymbol(true));
document.getElementById("symbol-cancel").addEventListener("click", () => closeSymbol(false));
symInput.addEventListener("keydown", e => {
  if (e.key === "Enter") closeSymbol(true);
  if (e.key === "Escape") closeSymbol(false);
});
["pda-read", "pda-pop", "pda-push"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("keydown", e => {
    if (e.key === "Enter") closeSymbol(true);
    if (e.key === "Escape") closeSymbol(false);
  });
});

// toolbar tool switching
document.querySelectorAll("#toolbar button[data-tool]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#toolbar button[data-tool]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    editor.setTool(btn.dataset.tool);
    fullRender();
    log("tool " + btn.dataset.tool);
  });
});

document.getElementById("btn-undo").addEventListener("click", () => {
  if (undo(undoStack, auto)) {
    fullRender();
    save();
    log("undo");
  }
});

document.getElementById("btn-redo").addEventListener("click", () => {
  if (redo(undoStack, auto)) {
    fullRender();
    save();
    log("redo");
  }
});

// import replaces the whole model, the previous state stays one undo away
document.getElementById("file-import").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    pushUndo(undoStack, auto);
    auto.states = [];
    auto.transitions = [];
    const parsed = jff.parse(text);
    auto.type = parsed.type || "fa";
    auto.initialStack = parsed.initialStack || (parsed.type === "pda" ? "Z" : undefined);
    document.getElementById("automaton-type").value = auto.type;
    document.getElementById("initial-stack").value = auto.initialStack || "Z";
    updateInitialStackVisibility();
    auto.states = parsed.states;
    auto.transitions = parsed.transitions;
    // adopt the imported filename as the export name, keep the chosen extension
    const base = file.name.replace(/\.(jff|jflap|xml)$/i, "");
    if (base) document.getElementById("export-name").value = base;
    fullRender();
    save();
    markDirty();
    log("imported " + file.name);
  } catch (err) {
    alert("import failed, " + err.message);
  }
  e.target.value = "";
});

// export handles all four extensions from the single dropdown, image exports go through the canvas path
document.getElementById("btn-export").addEventListener("click", async () => {
  const ext = document.getElementById("export-ext").value || ".jflap";
  if (ext === ".png") { exportImage("image/png"); return; }
  if (ext === ".jpg") { exportImage("image/jpeg"); return; }
  const name = document.getElementById("export-name").value.trim() || "automaton";
  const filename = name + ext;
  const blob = new Blob([jff.serialize(auto)], { type: "application/xml" });
  // prefer the share sheet on phones when the browser can share files, falls back to download
  if (navigator.canShare) {
    const file = new File([blob], filename, { type: "application/xml" });
    try {
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        clearDirty();
        return;
      }
    } catch (err) {
      // user cancelled the share sheet, still consider it saved
      if (err.name === "AbortError") { clearDirty(); return; }
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  clearDirty();
});

// image export, renders the current automaton as a high-res PNG or JPEG
function exportImage(mime) {
  const name = document.getElementById("export-name").value.trim() || "automaton";
  const ext = mime === "image/jpeg" ? ".jpg" : ".png";
  const filename = name + ext;
  // bounding box of the drawn automaton in canvas space
  let x, y, w, h;
  try {
    const bbox = svg._root.getBBox();
    if (bbox.width === 0 && bbox.height === 0) throw new Error("empty");
    const pad = 40;
    x = bbox.x - pad;
    y = bbox.y - pad;
    w = bbox.width + 2 * pad;
    h = bbox.height + 2 * pad;
  } catch {
    x = -100; y = -100; w = 400; h = 300;
  }
  const scale = 2; // crisp on retina
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  // JPEG gets a white page, PNG stays transparent so it works on any background
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  ctx.scale(scale, scale);
  // selection rings, pending link highlights, and sim glows must never bake into an export,
  // so redraw with every interaction highlight off, clone, then put the display state back
  const savedOpts = displayOpts();
  render(svg, auto, { selectedId: null, pendingFrom: null, activeIds: null, activeTransitionIds: null });
  const exportSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  exportSvg.setAttribute("width", w);
  exportSvg.setAttribute("height", h);
  exportSvg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
  exportSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const defs = svg.querySelector("defs").cloneNode(true);
  // marker arrow is light in the app, needs to be dark on a light/transparent export
  defs.querySelectorAll("path[fill=\"#e8e8e8\"]").forEach(p => p.setAttribute("fill", "#222222"));
  exportSvg.appendChild(defs);
  for (const child of svg._root.children) exportSvg.appendChild(child.cloneNode(true));
  render(svg, auto, savedOpts);
  applyViewport(svg, editor.ctx.vp);
  // invert the dark-theme colors to dark-on-light for the exported image
  exportSvg.querySelectorAll("circle[fill=\"#2a2a2a\"]").forEach(c => c.setAttribute("fill", "#ffffff"));
  exportSvg.querySelectorAll("circle[stroke=\"#e8e8e8\"], line[stroke=\"#e8e8e8\"]").forEach(el => el.setAttribute("stroke", "#222222"));
  exportSvg.querySelectorAll("path[stroke=\"#cfcfcf\"]").forEach(p => p.setAttribute("stroke", "#222222"));
  exportSvg.querySelectorAll("text[fill=\"#e8e8e8\"]").forEach(t => t.setAttribute("fill", "#111111"));
  exportSvg.querySelectorAll("text[fill=\"#ffd27f\"]").forEach(t => t.setAttribute("fill", "#8a5a00"));
  const svgStr = new XMLSerializer().serializeToString(exportSvg);
  const blob = new Blob([svgStr], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob(blob2 => {
      if (!blob2) return;
      const doDownload = () => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob2);
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };
      if (mime === "image/png" && navigator.canShare) {
        const file = new File([blob2], filename, { type: mime });
        try {
          if (navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: filename }).then(doDownload).catch(err => {
              if (err.name !== "AbortError") doDownload();
            });
            return;
          }
        } catch {}
      }
      doDownload();
    }, mime, mime === "image/jpeg" ? 0.92 : undefined);
  };
  img.onerror = () => { alert("image export failed"); URL.revokeObjectURL(url); };
  img.src = url;
}

// keep the dirty label in sync when the filename changes while unsaved
document.getElementById("export-name").addEventListener("input", () => {
  if (!dirtyEl.classList.contains("hidden")) markDirty();
});
document.getElementById("export-ext").addEventListener("change", () => {
  if (!dirtyEl.classList.contains("hidden")) markDirty();
});

document.getElementById("rename-ok").addEventListener("click", () => closeRename(true));
document.getElementById("rename-cancel").addEventListener("click", () => closeRename(false));
renameInput.addEventListener("keydown", e => {
  if (e.key === "Enter") closeRename(true);
  if (e.key === "Escape") closeRename(false);
});

fullRender();
log("boot, states " + auto.states.length);

// service worker keeps the app usable offline in lectures
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(err => log("sw failed " + err.message)));
}

// test hook for the devtools agent, not used by the app itself
window.__app = { get auto() { return auto; }, editor, jff };
