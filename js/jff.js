// jff import and export, the format is jflap 7.1 xml with <structure> as the root
// ids and names are stored exactly as found, never normalized

export function parse(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("not valid xml");
  const root = doc.querySelector("structure");
  if (!root) throw new Error("no <structure> root, not a jflap file");
  const type = root.querySelector("type")?.textContent.trim() || "fa";
  if (type !== "fa" && type !== "pda") throw new Error(`unsupported type "${type}", only fa and pda are supported for now`);
  const automaton = root.querySelector("automaton");
  if (!automaton) throw new Error("no <automaton> block");

  const states = [];
  for (const s of automaton.querySelectorAll("state")) {
    states.push({
      id: parseInt(s.getAttribute("id"), 10),
      name: s.getAttribute("name") ?? ("q" + s.getAttribute("id")),
      x: parseFloat(s.querySelector("x")?.textContent ?? "0"),
      y: parseFloat(s.querySelector("y")?.textContent ?? "0"),
      initial: !!s.querySelector("initial"),
      final: !!s.querySelector("final"),
    });
  }

  const transitions = [];
  for (const t of automaton.querySelectorAll("transition")) {
    const base = {
      from: parseInt(t.querySelector("from")?.textContent ?? "-1", 10),
      to: parseInt(t.querySelector("to")?.textContent ?? "-1", 10),
      // empty <read/> means epsilon, kept as the empty string on the model
      read: t.querySelector("read")?.textContent ?? "",
    };
    // pda transitions carry pop and push, fa ones keep them off the object
    if (type === "pda") {
      base.pop = t.querySelector("pop")?.textContent ?? "";
      base.push = t.querySelector("push")?.textContent ?? "";
    }
    transitions.push(base);
  }

  const initialStack = type === "pda" ? (automaton.querySelector("initialStackSymbol")?.textContent ?? "Z") : undefined;

  return { type, initialStack, states, transitions };
}

export function serialize(auto) {
  const type = auto.type || "fa";
  // built by string since xml comments and exact spacing do not need dom ceremony
  let out = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\"?>\n";
  out += `<structure>\n\t<type>${type}</type>\n\t<automaton>\n`;
  if (type === "pda" && auto.initialStack) {
    out += `\t\t<initialStackSymbol>${esc(auto.initialStack)}</initialStackSymbol>\n`;
  }
  out += "\t\t<!--The list of states.-->\n";
  for (const s of auto.states) {
    out += `\t\t<state id="${s.id}" name="${esc(s.name)}">\n`;
    out += `\t\t\t<x>${s.x}</x>\n\t\t\t<y>${s.y}</y>\n`;
    if (s.initial) out += "\t\t\t<initial/>\n";
    if (s.final) out += "\t\t\t<final/>\n";
    out += "\t\t</state>\n";
  }
  out += "\t\t<!--The list of transitions.-->\n";
  for (const t of auto.transitions) {
    out += "\t\t<transition>\n";
    out += `\t\t\t<from>${t.from}</from>\n\t\t\t<to>${t.to}</to>\n\t\t\t<read>${esc(t.read)}</read>\n`;
    if (auto.type === "pda") {
      out += `\t\t\t<pop>${esc(t.pop ?? "")}</pop>\n`;
      out += `\t\t\t<push>${esc(t.push ?? "")}</push>\n`;
    }
    out += "\t\t</transition>\n";
  }
  out += "\t</automaton>\n</structure>\n";
  return out;
}

// xml attribute and text escaping, names with & or < would break round-trips otherwise
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
