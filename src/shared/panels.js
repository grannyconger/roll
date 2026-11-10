// Content blocks shared by the student view and the display.
import { el } from "./ui.js";
import { AGENDA, MARKET_TERMS, REASONING_TERMS, MIND_TRAPS, SCORING_GUIDE, OBJECTIVE, STANDARD } from "./content.js";

export function agendaIndexFor(phase) {
  return AGENDA.findIndex(item => item.phases.includes(phase));
}

export function agendaBlock(phase) {
  const current = agendaIndexFor(phase);
  return el("div", null,
    el("p", null, el("strong", null, "Objective: "), OBJECTIVE),
    el("p", { class: "muted" }, STANDARD),
    el("ol", { class: "agenda" },
      AGENDA.map((item, i) => el("li", { class: i === current ? "agenda-now" : (i < current ? "agenda-done" : "") },
        i < current ? "Done: " : (i === current ? "Now: " : ""),
        item.link
          ? el("a", { href: item.link, target: "_blank", rel: "noopener" }, item.label)
          : item.label))));
}

function termList(pairs) {
  return el("dl", { class: "term-list" }, pairs.map(([t, d]) => [el("dt", null, t), el("dd", null, d)]));
}

export function vocabBlock() {
  return el("div", null,
    el("h3", null, "Market terms"), termList(MARKET_TERMS),
    el("h3", null, "Reasoning terms"), termList(REASONING_TERMS),
    el("h3", null, "Mind traps"), termList(MIND_TRAPS.map(t => [t.name, t.def])));
}

export function guideBlock() {
  return el("div", { class: "guide" },
    SCORING_GUIDE.map(g => [el("div", { class: "lvl" }, "Level " + g.level), el("div", null, g.text)]));
}
