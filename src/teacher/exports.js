// Exports: the full CSV and the printable class summary. Built with text nodes only.
import { el, downloadText } from "../shared/ui.js";
import { MIND_TRAPS } from "../shared/content.js";

function levelOf(state, r) {
  const f = state.feedback[r.id];
  if (f && (f.teacherLevel || f.level)) return f.teacherLevel || f.level;
  return r.selfLevel || null;
}

function written(state) {
  return Object.values(state.responses).filter(r => ["checkpoint", "chosen", "exit"].includes(r.kind));
}

function peerLevelsByResponse(state) {
  const map = (state.feedback["peer-map"] && state.feedback["peer-map"].map) || {};
  const out = {};
  for (const [reviewKey, responseId] of Object.entries(map)) {
    const review = state.peerReviews[reviewKey];
    if (!review) continue;
    (out[responseId] = out[responseId] || []).push(review.level);
  }
  return out;
}

function csvCell(v) {
  if (v == null) return "";
  const s = String(v);
  // neutralize spreadsheet formulas in student text
  const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
  return /[",\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

export function exportCsv(state) {
  const peers = peerLevelsByResponse(state);
  const header = ["preferred name", "account email", "game", "round", "decision", "response text", "AI level",
    "teacher override level", "peer levels", "mental math correct", "archetype", "team", "probe answer", "counterfactual value"];
  const rows = [header];
  const list = written(state).sort((a, b) => (a.uid > b.uid ? 1 : -1) || a.game - b.game || a.round - b.round);
  for (const r of list) {
    const p = state.players[r.uid] || {};
    const acct = state.roster[r.uid] || {};
    const f = state.feedback[r.id] || {};
    const m = r.game > 0 ? state.math[r.id] : null;
    const probe = state.probes[r.uid];
    const team = p.teamId && state.teams[p.teamId] ? state.teams[p.teamId].table : "";
    rows.push([
      p.preferredName, acct.email, r.kind === "exit" ? "exit" : r.game, r.kind === "exit" ? "" : r.round, r.decision, r.text,
      f.level, f.teacherLevel, (peers[r.id] || []).join(" "), m ? (m.correct ? "yes" : "no") : "",
      p.archetype, team,
      probe ? (probe.overruled ? `yes, round ${probe.round}, would have gone ${probe.wouldHaveDone}, ${probe.why || ""}` : "no") : "",
      probe && probe.counterfactualValue != null ? probe.counterfactualValue : ""
    ]);
  }
  const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  const section = state.session ? state.session.section : "class";
  downloadText(`roll-with-the-market-${section}.csv`, csv);
}

export function summaryNumbers(state) {
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const byGame = g => written(state).filter(r => r.kind !== "exit" && r.game === g);
  const at3 = list => list.filter(r => (levelOf(state, r) || 0) >= 3).length;
  const g1 = byGame(1), g2 = byGame(2);
  const exit = written(state).filter(r => r.kind === "exit");
  const math = Object.values(state.math).filter(m => m.game > 0);
  const surveyCounts = {};
  for (const t of MIND_TRAPS) surveyCounts[t.id] = 0;
  for (const s of Object.values(state.biasSurveys)) for (const id of s.selected || []) surveyCounts[id] = (surveyCounts[id] || 0) + 1;
  let goalMet = 0;
  for (const uid of Object.keys(state.players)) {
    const mine = g2.filter(r => r.uid === uid);
    if (mine.filter(r => (levelOf(state, r) || 0) >= 3).length >= 3) goalMet++;
  }
  return {
    students: Object.keys(state.players).length,
    g1Pct: pct(at3(g1), g1.length), g2Pct: pct(at3(g2), g2.length), exitPct: pct(at3(exit), exit.length),
    g1n: g1.length, g2n: g2.length, exitn: exit.length,
    mathPct: pct(math.filter(m => m.correct).length, math.length), mathn: math.length,
    surveyCounts, surveyn: Object.keys(state.biasSurveys).length, goalMet
  };
}

export function openSummary(state) {
  const n = summaryNumbers(state);
  const w = window.open("", "_blank");
  if (!w) return;
  const d = w.document;
  d.title = "Class summary";
  const style = d.createElement("style");
  style.textContent = "body{font-family:Verdana,sans-serif;color:#16181D;background:#FFFFFF;margin:40px;font-size:16px;line-height:1.5}h1{font-size:28px}h2{font-size:20px;margin-top:28px}td,th{padding:4px 16px 4px 0;text-align:left}.mono{font-family:ui-monospace,monospace}";
  d.head.appendChild(style);
  const mk = (tag, text) => { const e = d.createElement(tag); if (text != null) e.textContent = String(text); return e; };
  const section = state.session ? state.session.section : "";
  d.body.appendChild(mk("h1", `Roll with the Market, section ${section}`));
  d.body.appendChild(mk("p", `${n.students} students. Printed ${new Date().toLocaleString()}.`));
  const table = (rows) => {
    const t = d.createElement("table");
    for (const r of rows) { const tr = d.createElement("tr"); r.forEach((c, i) => tr.appendChild(mk(i ? "td" : "th", c))); t.appendChild(tr); }
    return t;
  };
  d.body.appendChild(mk("h2", "Level 3 or higher"));
  d.body.appendChild(table([
    ["Game 1", `${n.g1Pct} percent of ${n.g1n} responses`],
    ["Game 2", `${n.g2Pct} percent of ${n.g2n} responses`],
    ["Exit ticket", `${n.exitPct} percent of ${n.exitn} responses`],
    ["Growth, Game 1 to Game 2", `${n.g2Pct - n.g1Pct} points`]
  ]));
  d.body.appendChild(mk("h2", "Goal"));
  d.body.appendChild(mk("p", `${n.goalMet} of ${n.students} students scored Level 3 or higher on at least 3 of 4 Game 2 responses.`));
  d.body.appendChild(mk("h2", "Mental math"));
  d.body.appendChild(mk("p", `${n.mathPct} percent correct on the first or second try, across ${n.mathn} entries.`));
  d.body.appendChild(mk("h2", "Bias survey"));
  d.body.appendChild(table(MIND_TRAPS.map(t => [t.name, `${n.surveyCounts[t.id]} of ${n.surveyn} responses`])));
}
