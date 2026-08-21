// main, wires model + editor + renderer + ui together and owns persistence

import { createAutomaton } from "./model.js";
import { render, applyViewport } from "./renderer.js";
import { createEditor } from "./editor.js";
import { createUndo, pushUndo, undo } from "./undo.js";
import * as jff from "./jff.js";

const STORAGE_KEY = "automata-meow:model";

const svg = document.getElementById("canvas");
const debugEl = document.getElementById("debug");
const dirtyEl = document.getElementById("dirty");

// boot from autosave when present, otherwise an empty sheet
let auto = createAutomaton();
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) auto = JSON.parse(saved);
} catch (err) {
  console.warn("autosave was corrupt, starting fresh", err);
}

const undoStack = createUndo();

// debug log stays quiet unless ?debug is in the url, phone bugs need on-screen logs
const DEBUG = new URLSearchParams(location.search).has("debug");
function log(msg) {
  if (!DEBUG) return;
  const time = new Date().toLocaleTimeString();
  debugEl.textContent = (time + " " + msg + "\n" + debugEl.textContent).split("\n").slice(0, 6).join("\n");
}

function markDirty() {
  dirtyEl.classList.remove("hidden");
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auto));
}

function fullRender() {
  render(svg, auto, { selectedId: editor.ctx.selectedId, pendingFrom: editor.ctx.tools.pendingFrom });
  applyViewport(svg, editor.ctx.vp);
}

const editor = createEditor(svg, auto);

editor.ctx.pushUndo = () => pushUndo(undoStack, auto);
editor.ctx.render = () => { fullRender(); markDirty(); };
editor.ctx.save = save;
editor.ctx.log = log;

// symbol input flow for the link tool, empty input means epsilon
const symPop = document.getElementById("symbol-pop");
const symInput = document.getElementById("symbol-input");
const symPair = document.getElementById("symbol-pair");

editor.ctx.askSymbol = (fromId, toId) => {
  const from = auto.states.find(s => s.id === fromId);
  const to = auto.states.find(s => s.id === toId);
  symPair.textContent = `${from ? from.name : "?"} → ${to ? to.name : "?"}`;
  symPop.classList.remove("hidden");
  symInput.value = "";
  symInput.focus();
  symInput.dataset.from = fromId;
  symInput.dataset.to = toId;
};

function closeSymbol(commit) {
  const from = parseInt(symInput.dataset.from, 10);
  const to = parseInt(symInput.dataset.to, 10);
  const read = symInput.value.trim();
  symPop.classList.add("hidden");
  if (commit && !Number.isNaN(from) && !Number.isNaN(to)) {
    pushUndo(undoStack, auto);
    // empty read is epsilon, stored as the empty string exactly like jflap does
    auto.transitions.push({ from, to, read });
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
    auto.states = parsed.states;
    auto.transitions = parsed.transitions;
    fullRender();
    save();
    markDirty();
    log("imported " + file.name);
  } catch (err) {
    alert("import failed, " + err.message);
  }
  e.target.value = "";
});

// export downloads a .jflap named file, the extension the handout asks for
document.getElementById("btn-export").addEventListener("click", () => {
  const blob = new Blob([jff.serialize(auto)], { type: "application/xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "automaton.jflap";
  a.click();
  URL.revokeObjectURL(a.href);
  dirtyEl.classList.add("hidden");
});

fullRender();
log("boot, states " + auto.states.length);

// test hook for the devtools agent, not used by the app itself
window.__app = { get auto() { return auto; }, editor, jff };
