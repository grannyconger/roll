// Teacher control hub. One screen, no page scroll. The primary action is large enough to hit from across the room.
import {
  db, collection, query, where, getDocs, watchAuth, signInWithSchoolGoogle, signOutNow, isTeacherUser
} from "../firebase.js";
import { watchSession, watchCollection, measureClockOffset, serverNow, millisOf, PHASES, PHASE_LABELS, formatClock } from "../session.js";
import { avgMoney, GAMES, isCheckpointRound, isTeamRound, teamStandings } from "../game.js";
import { el, mount, countdown, bootPage, nameNode, displayName } from "../shared/ui.js";
import { CER_STEPS, RULES } from "../shared/content.js";
import { assessorUrl, setAssessorUrl } from "../shared/config.js";
import { makeEngine, createSectionSession } from "./engine.js";
import { exportCsv, openSummary } from "./exports.js";

const root = document.getElementById("app");
const state = {
  user: null, sessionId: null, session: null,
  players: {}, roster: {}, decisions: {}, rolls: {}, responses: {}, feedback: {}, math: {},
  teams: {}, probes: {}, peerReviews: {}, biasSurveys: {}, quizAnswers: {}, confirmRemove: null,
  busy: false, picked: null, healthCheck: null, unsubs: []
};
let engine = null;

bootPage();
watchAuth(async user => {
  state.user = user;
  if (!user) return renderSignIn();
  if (!isTeacherUser(user)) return renderSignIn("This page is for the teacher account only.");
  await measureClockOffset();
  const sid = new URLSearchParams(location.search).get("s");
  if (sid) startSession(sid); else renderSessionPicker();
});

function renderSignIn(message) {
  mount(root, el("main", { class: "center-screen" },
    el("h1", null, "Teacher hub"),
    el("button", { class: "btn btn-big", onclick: () => signInWithSchoolGoogle().catch(() => renderSignIn("Sign-in did not work.")) }, "Sign in with Google"),
    message ? el("p", { class: "notice" }, message) : null,
    state.user ? el("button", { class: "btn btn-quiet", onclick: () => signOutNow() }, "Sign out") : null));
}

async function renderSessionPicker() {
  const snap = await getDocs(query(collection(db, "sessions"), where("teacherUid", "==", state.user.uid)));
  const list = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  list.sort((a, b) => (millisOf(b.createdAt) || 0) - (millisOf(a.createdAt) || 0));
  const create = async section => {
    const id = await createSectionSession(section, state.user.uid);
    location.search = "?s=" + id;
  };
  mount(root, el("main", { class: "picker" },
    el("h1", null, "Pick a class session"),
    el("div", { class: "row" },
      el("button", { class: "btn", onclick: () => create("2B") }, "New 2B session"),
      el("button", { class: "btn", onclick: () => create("4B") }, "New 4B session")),
    el("ul", { class: "session-list" }, list.map(s => el("li", null,
      el("a", { href: "?s=" + s.id }, `${s.section} with code ${s.classCode}`),
      el("span", { class: "muted" }, " created " + new Date(millisOf(s.createdAt) || 0).toLocaleString(), ", phase " + (PHASE_LABELS[s.phase] || s.phase)))))));
}

function startSession(sid) {
  state.sessionId = sid;
  engine = makeEngine({ sessionId: sid, get: () => state });
  const byId = l => Object.fromEntries(l.map(d => [d.id, d]));
  state.unsubs.push(watchSession(sid, s => {
    state.session = s;
    setAssessorUrl(s && s.assessorUrl);
    // students join only with the class code, so it is never left off.
    // Sessions made before this change, or with the old toggle off, are switched on here.
    if (s && s.allowAnonymous !== true && engine) engine.setSession({ allowAnonymous: true }).catch(() => {});
    schedule();
  }));
  for (const name of ["players", "roster", "decisions", "rolls", "responses", "feedback", "teams", "probes", "peerReviews", "biasSurveys", "quizAnswers"]) {
    state.unsubs.push(watchCollection(sid, name, l => { state[name] = byId(l); schedule(); }));
  }
  state.unsubs.push(watchCollection(sid, "mathEntries", l => { state.math = byId(l); schedule(); }));
  setInterval(tick, 3000);
}

let frame = null;
function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = null; render(); autoAdvance(); });
}

// Things the hub does without a click: settle when every entry is in, retry the assessor, update health.
let settling = false;
async function autoAdvance() {
  const s = state.session;
  if (!s || state.busy || settling) return;
  if (s.roundState === "compute") {
    const p = engine.entryProgress();
    if (p.needed > 0 && p.done >= p.needed) {
      settling = true;
      try { await engine.settleRound(); } finally { settling = false; }
    }
  }
  if (s.roundState === "rolling") {
    const roll = state.rolls[`${s.game}_${s.round}`];
    const at = roll && millisOf(roll.rolledAt);
    if (at && serverNow() - at > 19000) engine.revealRoll();
  }
}

function tick() {
  if (!state.session) return;
  engine.retryPendingAssessments();
  const h = engine.assessorHealth();
  if (h !== state.session.assessorHealth) engine.setSession({ assessorHealth: h }).catch(() => {});
  schedule();
}

async function run(fn) {
  if (state.busy) return;
  state.busy = true; render();
  try { await fn(); } catch (e) { console.error(e); alertLine("That did not work: " + (e.code || e.message)); }
  state.busy = false; render();
}

let lastError = "";
function alertLine(msg) { lastError = msg; render(); }

// ---------- the primary action ----------
function primaryAction() {
  const s = state.session;
  const E = engine;
  const nPlayers = Object.keys(state.players).length;
  const inRounds = ["learn-to-play", "game1", "game2"].includes(s.phase) && s.roundState;
  if (inRounds) {
    const g = s.game, r = s.round;
    const total = GAMES[g].rounds;
    switch (s.roundState) {
      case "decide": {
        const n = Object.values(state.decisions).filter(d => d.game === g && d.round === r).length;
        return { label: `Lock decisions (${n} of ${nPlayers} in)`, run: E.lockDecisions };
      }
      case "locked": return { label: "Roll the dice", run: E.rollTheDice };
      case "rolling": return { label: "Rolling. Reveal now", run: E.revealRoll };
      case "revealed":
      case "compute": {
        const p = E.entryProgress();
        return { label: `Force settle (${p.done} of ${p.needed} entered)`, run: E.settleRound };
      }
      case "settled":
        if (r < total) {
          if (g === 2 && r === 4 && s.phase === "game2") return { label: "Open the probe", run: () => E.goToPhase("game2-probe") };
          return { label: `Start ${g === 0 ? "practice round" : "round"} ${r + 1}`, run: E.startNextRound };
        }
        if (g === 0) return { label: "Start Game 1", run: E.startGame1 };
        if (g === 1) return { label: "End Game 1", run: () => E.goToPhase("game1-complete") };
        return { label: "End Game 2", run: () => E.goToPhase("game2-complete") };
    }
  }
  switch (s.phase) {
    case "lobby": return { label: "Show the agenda", run: () => E.goToPhase("agenda") };
    case "agenda": return { label: "Start the vocab warm up", run: () => E.goToPhase("vocab-warmup") };
    case "vocab-warmup": return { label: "Start Learn to Play", run: E.startLearnToPlay };
    case "learn-to-play":
      if ((s.ruleStep || 0) < RULES.length) return { label: `Show rule ${(s.ruleStep || 0) + 1} of ${RULES.length}`, run: E.showNextRule };
      return { label: "Start practice round 1", run: E.startPracticeRounds };
    case "game1": return { label: "Start Game 1", run: E.startGame1 };
    case "game1-complete": return { label: "Show Game 1 feedback", run: () => E.goToPhase("feedback-1") };
    case "feedback-1": return { label: "Start the CER lesson", run: () => E.goToPhase("cer-lesson") };
    case "cer-lesson": {
      const step = s.cerSubStep || 1;
      const def = CER_STEPS[step - 1];
      if (def && def.kind === "poll" && !s.cerReveal) {
        const n = Object.values(state.quizAnswers).filter(a => a.kind === "cer" && a.qid === "cer" + (step - 1)).length;
        return { label: `Reveal the answer (${n} of ${nPlayers} answered)`, run: E.revealCerPoll };
      }
      if (step < CER_STEPS.length) return { label: `Next: ${CER_STEPS[step].title}`, run: () => E.goToCerStep(step + 1) };
      return { label: "Build strategy teams", run: E.buildStrategyTeams };
    }
    case "team-assignment": return { label: "Start the huddle", run: () => E.goToPhase("team-huddle") };
    case "team-huddle": return { label: "Start Game 2", run: E.startGame2 };
    case "game2": return { label: "Start Game 2", run: E.startGame2 };
    case "game2-probe": return { label: "Start round 5", run: () => E.startRound(2, 5, "game2") };
    case "game2-complete": return { label: "Start peer scoring", run: E.startPeerScoring };
    case "peer-scoring":
      if (!s.biasSurveyPushId) return { label: "Push the bias survey", run: E.pushBiasSurvey };
      return { label: "Start the mind traps debrief", run: async () => { await E.closeBiasSurvey(); await E.goToPhase("debrief"); } };
    case "debrief": return { label: "Start the exit ticket", run: () => E.goToPhase("exit-ticket") };
    case "exit-ticket": return { label: "Start closure", run: () => E.goToPhase("closure") };
    case "closure": return { label: "Lesson complete", run: null };
  }
  return { label: "Continue", run: null };
}

// ---------- render ----------
let dragging = false;
function render() {
  // never rebuild during a drag, or the drop target disappears
  if (dragging) { setTimeout(schedule, 400); return; }
  // never rebuild under an open dropdown, or the teacher loses the selection
  const active = document.activeElement;
  if (active && active.tagName === "SELECT" && root.contains(active)) { setTimeout(schedule, 800); return; }
  const s = state.session;
  if (!s) { mount(root, el("main", { class: "center-screen" }, el("h1", null, "Loading session"))); return; }
  const act = primaryAction();
  // the hub redraws every few seconds. Keep every scrolled area where the teacher left it.
  const scrolled = [...root.querySelectorAll(".col, .feed, .students")].map(n => [n.scrollTop, n.scrollLeft]);
  const pageY = window.scrollY;
  mount(root, el("main", { class: "hub" },
    el("section", { class: "col col-1" },
      el("div", { class: "hub-head" },
        el("h1", null, `${s.section} hub`),
        el("p", { class: "muted" }, "Class code ", el("strong", { class: "mono" }, s.classCode), " ", linkRow())),
      el("p", { class: "now" }, nowLine()),
      s.roundEndsAt ? el("p", { class: "now-timer" }, "Time left ", countdown(s.roundEndsAt)) : null,
      el("button", { class: "btn primary", disabled: state.busy || !act.run, onclick: () => act.run && run(act.run) }, act.label),
      secondaryRow(),
      lastError ? el("p", { class: "notice" }, lastError, " ", el("button", { class: "btn btn-quiet", onclick: () => { lastError = ""; render(); } }, "Dismiss")) : null,
      phasePanel(), togglesPanel(), randomizerPanel(), healthPanel(), exportPanel()),
    el("section", { class: "col col-2" }, responsesPanel()),
    el("section", { class: "col col-3" }, teamsPanel(), distributionPanel(), spotlightPanel(), flagsPanel(), historyPanel(), studentsPanel())));
  root.querySelectorAll(".col, .feed, .students").forEach((n, i) => { if (scrolled[i]) { n.scrollTop = scrolled[i][0]; n.scrollLeft = scrolled[i][1]; } });
  if (pageY) window.scrollTo(0, pageY);
}

function linkRow() {
  const base = location.pathname.replace(/teacher(\.html)?$/, "");
  return el("span", null,
    el("a", { href: `${base}display.html?s=${state.sessionId}`, target: "_blank" }, "Open display"), "  ",
    el("a", { href: `${base}observer.html?s=${state.sessionId}`, target: "_blank" }, "Observer link"), "  ",
    el("a", { href: "?" }, "Switch session"));
}

function nowLine() {
  const s = state.session;
  let t = PHASE_LABELS[s.phase] || s.phase;
  if (s.roundState) {
    t += s.game === 0 ? `, practice round ${s.round}` : `, round ${s.round} of ${GAMES[s.game].rounds}`;
    t += `, ${s.roundState}`;
    if (s.isDoubleRound) t += ", double round";
    if (s.isTeamRound) t += ", team round";
    if (s.game > 0 && isCheckpointRound(s.game, s.round)) t += ", checkpoint";
  }
  if (s.phase === "cer-lesson") {
    const def = CER_STEPS[(s.cerSubStep || 1) - 1];
    t += `, step ${s.cerSubStep || 1} of ${CER_STEPS.length}`;
    if (def) t += def.kind === "talk" ? ", turn and talk" : def.kind === "poll" ? (s.cerReveal ? ", poll revealed" : ", poll open") : "";
  }
  return t;
}

function secondaryRow() {
  const s = state.session;
  const items = [];
  if (s.roundState === "decide" || s.roundEndsAt) items.push(el("button", { class: "btn btn-small", onclick: () => run(engine.addThirtySeconds) }, "Add 30 seconds"));
  if (["revealed", "compute"].includes(s.roundState)) items.push(el("button", { class: "btn btn-small", onclick: () => run(engine.settleRound) }, "Force settle"));
  return items.length ? el("div", { class: "row" }, items) : null;
}

function panel(title, ...body) {
  return el("div", { class: "panel" }, el("h2", null, title), body);
}

function phasePanel() {
  const s = state.session;
  const i = PHASES.indexOf(s.phase);
  const select = el("select", { "aria-label": "Jump to phase" }, PHASES.map(p => el("option", { value: p, selected: p === s.phase ? "selected" : null }, PHASE_LABELS[p])));
  return panel("Phase",
    el("p", { class: "small" }, "Previous: ", i > 0 ? PHASE_LABELS[PHASES[i - 1]] : "none", ". Next: ", i < PHASES.length - 1 ? PHASE_LABELS[PHASES[i + 1]] : "none", "."),
    el("div", { class: "row" }, select, el("button", { class: "btn btn-small", onclick: () => {
      const target = select.value;
      if (target === s.phase) return;
      run(() => engine.goToPhase(target));
    } }, "Jump")));
}

function toggle(label, on, patch) {
  return el("button", { class: "btn btn-small toggle", "aria-pressed": on ? "true" : "false", onclick: () => run(() => engine.setSession(patch)) },
    label + (on ? ": on" : ": off"));
}

function togglesPanel() {
  const s = state.session;
  return panel("Toggles", el("div", { class: "toggles" },
    toggle("Leaderboard", s.leaderboardVisible, { leaderboardVisible: !s.leaderboardVisible }),
    toggle("Vocab on display", s.vocabModeVisible, { vocabModeVisible: !s.vocabModeVisible }),
    toggle("Seating chart", s.teamSeatingVisible, { teamSeatingVisible: !s.teamSeatingVisible }),
    el("button", { class: "btn btn-small toggle", "aria-pressed": s.biasSurveyPushId ? "true" : "false",
      onclick: () => run(s.biasSurveyPushId ? engine.closeBiasSurvey : engine.pushBiasSurvey) },
      s.biasSurveyPushId ? `Bias survey: open (${s.biasSurveyPushId})` : "Bias survey: push"),
    toggle("Display dyslexia font", s.displayDyslexiaFont, { displayDyslexiaFont: !s.displayDyslexiaFont }),
    toggle("Display drumroll", s.displaySound !== false, { displaySound: s.displaySound === false }),
    toggle("Joining locked", s.joinLocked, { joinLocked: !s.joinLocked })));
}

function randomizerPanel() {
  return panel("Randomizer",
    el("div", { class: "row" },
      el("button", { class: "btn btn-small", onclick: () => run(async () => { state.picked = await engine.pickNonVolunteer(); }) }, "Pick a student"),
      state.picked ? el("span", { class: "picked" }, nameNode(state.picked)) : null));
}

function healthPanel() {
  const h = state.session.assessorHealth || "ok";
  const words = { ok: "Green, working", degraded: "Degraded, slow", down: "Down, students self-assess" };
  const shapes = { ok: "●", degraded: "◐", down: "○" };
  return panel("Assessor",
    el("p", { class: "health health-" + h }, shapes[h] + " " + words[h]),
    el("div", { class: "row" },
      el("button", { class: "btn btn-small", onclick: () => run(checkHealth) }, "Run health check"),
      state.healthCheck ? el("span", { class: "small" }, state.healthCheck) : null),
    el("p", { class: "small muted" }, "Worker: " + assessorUrl()),
    el("button", { class: "btn btn-quiet btn-small", onclick: () => {
      const url = window.prompt("Assessor Worker URL for this session. Leave blank to use the default.", state.session.assessorUrl || "");
      if (url === null) return;
      run(() => engine.setSession({ assessorUrl: url.trim() || null }));
    } }, "Change Worker URL"));
}

async function checkHealth() {
  const t0 = performance.now();
  try {
    const res = await fetch(assessorUrl() + "/health", { cache: "no-store" });
    const j = await res.json();
    state.healthCheck = j.ok ? `OK in ${j.latencyMs} ms on ${j.model}` : "Failed: " + (j.error || res.status);
  } catch (e) {
    state.healthCheck = `No answer after ${Math.round(performance.now() - t0)} ms`;
  }
}

function exportPanel() {
  return panel("Export", el("div", { class: "row" },
    el("button", { class: "btn btn-small", onclick: () => exportCsv(state) }, "Full CSV"),
    el("button", { class: "btn btn-small", onclick: () => openSummary(state) }, "Class summary")));
}

// ---------- data panels ----------
function playerOf(uid) { return state.players[uid]; }

function writtenResponses() {
  return Object.values(state.responses).filter(r => ["checkpoint", "chosen", "exit"].includes(r.kind));
}

function responsesPanel() {
  const list = writtenResponses().sort((a, b) => (millisOf(b.submittedAt) || 0) - (millisOf(a.submittedAt) || 0));
  return panel(`Responses (${list.length})`, el("div", { class: "feed" }, list.map(r => {
    const p = playerOf(r.uid);
    const f = state.feedback[r.id];
    const lvl = engine.levelOf(r);
    const select = el("select", { "aria-label": "Override level" },
      el("option", { value: "" }, "Override"),
      [1, 2, 3, 4].map(n => el("option", { value: String(n), selected: f && f.teacherLevel === n ? "selected" : null }, "Level " + n)));
    select.addEventListener("change", () => run(() => engine.overrideScore(r, Number(select.value) || null)));
    return el("div", { class: "feed-item" },
      el("div", { class: "feed-top" },
        nameNode(p),
        el("span", { class: "small muted" }, r.kind === "exit" ? " exit ticket" : ` G${r.game} R${r.round} ${r.decision || ""}`),
        el("span", { class: "feed-level" }, lvl ? `Level ${lvl}` : (r.assessmentState === "pending" ? "scoring" : "no score")),
        f && f.teacherLevel ? el("span", { class: "small" }, " overridden") : null,
        r.assessmentState === "degraded" ? el("span", { class: "small" }, " self-scored") : null),
      el("p", { class: "feed-text" }, r.text),
      f && f.why ? el("p", { class: "small muted" }, f.why) : null,
      select);
  })));
}

function levelCounts(game) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const r of writtenResponses()) {
    if (r.game !== game || r.kind === "exit") continue;
    const l = engine.levelOf(r);
    if (l) counts[l]++;
  }
  return counts;
}

function distributionPanel() {
  const exitCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  writtenResponses().filter(r => r.kind === "exit").forEach(r => { const l = engine.levelOf(r); if (l) exitCounts[l]++; });
  const rows = [["Game 1", levelCounts(1)], ["Game 2", levelCounts(2)], ["Exit", exitCounts]];
  return panel("Distribution", el("table", { class: "dist" },
    el("thead", null, el("tr", null, el("th", null, ""), [1, 2, 3, 4].map(n => el("th", null, "L" + n)))),
    el("tbody", null, rows.map(([label, c]) => el("tr", null, el("th", null, label), [1, 2, 3, 4].map(n => el("td", { class: "mono" }, String(c[n]))))))));
}

function spotlightPanel() {
  const s = state.session;
  const nominees = Object.values(state.feedback).filter(f => f.spotlightNominee && state.responses[f.responseId]);
  const strongest = choice => nominees.filter(f => state.responses[f.responseId].decision === choice)
    .sort((a, b) => (b.teacherLevel || b.level) - (a.teacherLevel || a.level));
  const ordered = [];
  const ins = strongest("IN"), outs = strongest("OUT");
  if (ins[0]) ordered.push(ins[0]);
  if (outs[0]) ordered.push(outs[0]);
  for (const f of nominees) if (!ordered.includes(f)) ordered.push(f);
  return panel("Spotlight",
    s.spotlightResponseId ? el("div", { class: "row" }, el("span", { class: "small" }, "On the display now."),
      el("button", { class: "btn btn-small", onclick: () => run(() => engine.setSession({ spotlightResponseId: null })) }, "Clear")) : null,
    ordered.length ? el("div", { class: "tray" }, ordered.slice(0, 6).map(f => {
      const r = state.responses[f.responseId];
      return el("div", { class: "tray-item" },
        el("p", { class: "small" }, el("strong", null, `${r.decision}, Level ${f.teacherLevel || f.level}. `), f.spotlightReason || ""),
        el("p", { class: "feed-text" }, r.text),
        el("button", { class: "btn btn-small", onclick: () => run(() => engine.setSession({ spotlightResponseId: r.id })) }, "Push to display"));
    })) : el("p", { class: "small muted" }, "No nominees yet."));
}

function flagsPanel() {
  const s = state.session;
  const level1 = new Set(), mathMiss = new Set(), nothing = [], late = [];
  for (const r of writtenResponses()) if (engine.levelOf(r) === 1) level1.add(r.uid);
  for (const m of Object.values(state.math)) if (m.game > 0 && m.revealed) mathMiss.add(m.uid);
  const practiceMiss = new Set(Object.values(state.math).filter(m => m.game === 0 && !m.correct && m.attempts.length >= 2).map(m => m.uid));
  const g = s.game > 0 ? s.game : null;
  for (const p of Object.values(state.players)) {
    if (g && !writtenResponses().some(r => r.uid === p.uid && r.game === g)) nothing.push(p);
    if (p.joinedLate) late.push(p);
  }
  const names = set => [...set].map(playerOf).filter(Boolean);
  const line = (label, list) => el("p", { class: "flag-line" }, el("strong", null, `${label} (${list.length}): `),
    list.length ? list.map((p, i) => [i ? ", " : "", nameNode(p)]) : "none");
  return panel("Flags",
    line("Level 1", names(level1)),
    line("Missed math twice", names(mathMiss)),
    line("Practice math misses", names(practiceMiss)),
    g ? line(`Nothing written in Game ${g}`, nothing) : null,
    line("Joined late", late));
}

function historyPanel() {
  const rows = [];
  for (const g of [1, 2]) {
    for (let r = 1; r <= GAMES[g].rounds; r++) {
      if (!state.rolls[`${g}_${r}`]) continue;
      const ds = Object.values(state.decisions).filter(d => d.game === g && d.round === r);
      const nIn = ds.filter(d => d.choice === "IN").length;
      const roll = state.rolls[`${g}_${r}`];
      rows.push(el("tr", null, el("td", null, `G${g} R${r}${roll.doubled ? " x2" : ""}`), el("td", { class: "mono" }, String(nIn)), el("td", { class: "mono" }, String(ds.length - nIn)),
        el("td", null, (roll.direction === "up" ? "▲ up " : "▼ down ") + roll.effectiveAmount)));
    }
  }
  return panel("History", rows.length ? el("table", { class: "dist" },
    el("thead", null, el("tr", null, el("th", null, "Round"), el("th", null, "IN"), el("th", null, "OUT"), el("th", null, "Roll"))),
    el("tbody", null, rows)) : el("p", { class: "small muted" }, "No rounds yet."));
}

// Teams, editable by drag and drop. Drag a name onto another table.
function teamsPanel() {
  const teams = Object.values(state.teams).sort((a, b) => a.teamId.localeCompare(b.teamId, undefined, { numeric: true }));
  if (!teams.length) return null;
  const s = state.session;
  const balances = uid => (state.players[uid] || {}).balance;
  const standings = s.game === 2 ? teamStandings(teams, balances) : [];
  const avgOf = id => { const t = standings.find(x => x.teamId === id); return t ? ` avg $${avgMoney(t.average)}` : ""; };
  const grid = el("div", { class: "team-grid" }, teams.map(t => {
    const box = el("div", { class: "team-box", "data-team": t.teamId },
      el("p", { class: "team-name" }, `${t.table} (${t.members.length})`, el("span", { class: "small muted mono" }, avgOf(t.teamId))),
      el("ul", { class: "team-members" }, t.members.map(m => {
        const p = state.players[m.uid] || m;
        const li = el("li", { class: "drag-name", draggable: "true", title: "Drag to another table" }, nameNode(p),
          p.archetype ? el("span", { class: "small muted" }, " " + p.archetype) : null);
        li.addEventListener("dragstart", e => { dragging = true; e.dataTransfer.setData("text/plain", m.uid); e.dataTransfer.effectAllowed = "move"; li.classList.add("is-dragging"); });
        li.addEventListener("dragend", () => { dragging = false; li.classList.remove("is-dragging"); schedule(); });
        return li;
      })));
    box.addEventListener("dragover", e => { e.preventDefault(); box.classList.add("drop-here"); });
    box.addEventListener("dragleave", () => box.classList.remove("drop-here"));
    box.addEventListener("drop", e => {
      e.preventDefault();
      box.classList.remove("drop-here");
      dragging = false;
      const uid = e.dataTransfer.getData("text/plain");
      if (uid) run(() => engine.moveToTeam(uid, t.teamId));
    });
    return box;
  }));
  const unplaced = Object.values(state.players).filter(p => !teams.some(t => t.members.some(m => m.uid === p.uid)));
  return panel("Teams",
    el("p", { class: "small muted" }, "Drag a name onto another table. Students see the change at once."),
    grid,
    unplaced.length ? el("div", { class: "unplaced" }, el("p", { class: "small" }, el("strong", null, "Not on a table: ")),
      el("ul", { class: "team-members" }, unplaced.map(p => {
        const li = el("li", { class: "drag-name", draggable: "true" }, nameNode(p));
        li.addEventListener("dragstart", e => { dragging = true; e.dataTransfer.setData("text/plain", p.uid); });
        li.addEventListener("dragend", () => { dragging = false; schedule(); });
        return li;
      }))) : null,
    el("button", { class: "btn btn-small", onclick: () => run(engine.addTable) }, "Add a table"));
}

function sparkleOf(uid) {
  return Object.values(state.quizAnswers).filter(a => a.uid === uid).reduce((t, a) => t + (a.points || 0), 0);
}

function studentsPanel() {
  const list = Object.values(state.players).sort((a, b) => (a.preferredName || "").localeCompare(b.preferredName || ""));
  const fullName = p => { const acct = state.roster[p.uid]; return acct ? (acct.accountName || acct.email || "") : ""; };
  const counts = {};
  for (const p of list) { const k = (fullName(p) || displayName(p)).toLowerCase(); counts[k] = (counts[k] || 0) + 1; }
  const dupes = list.filter(p => counts[(fullName(p) || displayName(p)).toLowerCase()] > 1).length;
  return panel(`Students (${list.length})`,
    dupes ? el("p", { class: "small notice" }, `${dupes} records share a name. Remove the copy with no decisions.`) : null,
    el("div", { class: "students" }, list.map(p => {
      const dup = counts[(fullName(p) || displayName(p)).toLowerCase()] > 1;
      const nDecisions = Object.values(state.decisions).filter(d => d.uid === p.uid && !d.defaulted).length;
      const confirming = state.confirmRemove === p.uid;
      return el("div", { class: "student-row" + (dup ? " is-dup" : "") },
        nameNode(p), el("span", { class: "small muted" }, " " + fullName(p)),
        el("span", { class: "mono small" }, " $" + p.balance), el("span", { class: "small" }, ` ✨${sparkleOf(p.uid)}`),
        el("span", { class: "small muted" }, ` ${nDecisions} picks`),
        p.archetype ? el("span", { class: "small" }, " " + p.archetype) : null,
        dup ? el("span", { class: "small notice" }, " duplicate name") : null,
        confirming
          ? el("span", null, " ", el("button", { class: "btn btn-small", onclick: () => { state.confirmRemove = null; run(() => engine.removePlayer(p.uid)); } }, "Confirm remove"),
              el("button", { class: "btn btn-quiet btn-small", onclick: () => { state.confirmRemove = null; render(); } }, "Keep"))
          : el("button", { class: "btn btn-quiet btn-small", onclick: () => { state.confirmRemove = p.uid; render(); } }, "Remove"));
    })));
}
