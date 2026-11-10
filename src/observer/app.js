// Observer view. Read-only. No controls of any kind beyond sign-in.
// Shows aggregates only. No student names appear on this page.
import { db, collection, getDocs, watchAuth, signInWithSchoolGoogle, signOutNow, isObserverUser } from "../firebase.js";
import { watchSession, watchCollection, measureClockOffset, serverNow, millisOf, formatClock, sessionIdFromUrl, PHASE_LABELS } from "../session.js";
import { GAMES, isCheckpointRound } from "../game.js";
import { el, mount, countdown, bootPage } from "../shared/ui.js";
import { OBJECTIVE, STANDARD, DESIGN_INTENT } from "../shared/content.js";
import { summaryNumbers } from "../teacher/exports.js";

const root = document.getElementById("app");
const state = {
  session: null, players: {}, decisions: {}, responses: {}, feedback: {}, math: {},
  probes: {}, peerReviews: {}, biasSurveys: {}
};

bootPage();
watchAuth(async user => {
  if (!user) return showSignIn();
  if (!isObserverUser(user)) return showSignIn("This page is open to the observer account only.");
  await measureClockOffset();
  const sid = sessionIdFromUrl();
  if (sid) watchClass(sid); else showSessionPicker();
});

function showSignIn(message) {
  mount(root, el("main", { class: "center-screen" },
    el("h1", null, "Observer view"),
    el("button", { class: "btn btn-big", onclick: () => signInWithSchoolGoogle().catch(() => showSignIn("Sign-in did not work. Try again.")) }, "Sign in with Google"),
    message ? el("p", { class: "notice" }, message) : null,
    message ? el("button", { class: "btn btn-quiet", onclick: () => signOutNow() }, "Sign out") : null));
}

// Without a session link, list today's sessions so the observer can pick one.
async function showSessionPicker() {
  const snap = await getDocs(collection(db, "sessions"));
  const today = new Date().toDateString();
  const list = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  const recent = list
    .filter(s => new Date(millisOf(s.createdAt) || 0).toDateString() === today)
    .sort((a, b) => (millisOf(b.createdAt) || 0) - (millisOf(a.createdAt) || 0));
  mount(root, el("main", { class: "picker" },
    el("h1", null, recent.length ? "Pick the class you are observing" : "No class sessions have started today"),
    el("ul", { class: "session-list" }, recent.map(s => el("li", null,
      el("a", { href: "?s=" + s.id }, `Section ${s.section}`),
      el("span", { class: "muted" }, `, started ${new Date(millisOf(s.createdAt)).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}, now in ${PHASE_LABELS[s.phase] || s.phase}`))))));
}

function watchClass(sid) {
  const byId = l => Object.fromEntries(l.map(d => [d.id, d]));
  watchSession(sid, s => { state.session = s; schedule(); });
  const names = { players: "players", decisions: "decisions", responses: "responses", feedback: "feedback",
    mathEntries: "math", probes: "probes", peerReviews: "peerReviews", biasSurveys: "biasSurveys" };
  for (const [collectionName, key] of Object.entries(names)) {
    watchCollection(sid, collectionName, l => { state[key] = byId(l); schedule(); });
  }
  setInterval(tickElapsed, 1000);
}

let frame = null;
function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = null; render(); });
}

// ---------- numbers ----------
const count = (obj, fn) => Object.values(obj).filter(fn).length;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const studentCount = () => Object.keys(state.players).length;

function levelOf(r) {
  const f = state.feedback[r.id];
  if (f && (f.teacherLevel || f.level)) return f.teacherLevel || f.level;
  return r.selfLevel || null;
}

function writtenResponses() {
  return Object.values(state.responses).filter(r => ["checkpoint", "chosen", "exit"].includes(r.kind));
}

function inRounds(s) {
  return ["learn-to-play", "game1", "game2"].includes(s.phase) && !!s.roundState;
}

// The prompt open right now, and how many students have answered it. Null when nothing is open.
function participation() {
  const s = state.session;
  if (s.biasSurveyPushId) {
    return { what: "the mind traps survey", done: count(state.biasSurveys, b => b.pushId === s.biasSurveyPushId) };
  }
  if (inRounds(s) && s.roundState === "decide") {
    if (isCheckpointRound(s.game, s.round)) {
      return { what: `the round ${s.round} written justification`, done: count(state.responses, r => r.game === s.game && r.round === s.round && r.kind === "checkpoint") };
    }
    return { what: `the round ${s.round} IN or OUT decision`, done: count(state.decisions, d => d.game === s.game && d.round === s.round) };
  }
  if (inRounds(s) && ["revealed", "compute"].includes(s.roundState)) {
    return { what: "the new balance entry", done: count(state.math, m => m.game === s.game && m.round === s.round && (m.correct || m.revealed)) };
  }
  if (s.phase === "game2-probe") return { what: "the probe", done: count(state.probes, p => !!p.submittedAt) };
  if (s.phase === "exit-ticket") return { what: "the exit ticket", done: count(state.responses, r => r.kind === "exit") };
  if (s.phase === "closure") return { what: "the closing question", done: count(state.responses, r => r.kind === "closure") };
  if (s.phase === "peer-scoring") {
    const perReviewer = {};
    for (const r of Object.values(state.peerReviews)) perReviewer[r.reviewerUid] = (perReviewer[r.reviewerUid] || 0) + 1;
    return { what: "both peer scores", done: Object.values(perReviewer).filter(n => n >= 2).length };
  }
  return null;
}

function distributionRows() {
  const groups = [
    { label: "Game 1", list: writtenResponses().filter(r => r.kind !== "exit" && r.game === 1) },
    { label: "Game 2", list: writtenResponses().filter(r => r.kind !== "exit" && r.game === 2) },
    { label: "Exit ticket", list: writtenResponses().filter(r => r.kind === "exit") }
  ].filter(g => g.list.length);
  return groups.map(g => {
    const at = lvl => g.list.filter(r => levelOf(r) === lvl).length;
    return { label: g.label, l4: at(4), l3: at(3), l2: at(2), l1: at(1), waiting: g.list.filter(r => !levelOf(r)).length, total: g.list.length };
  });
}

function feedbackReach() {
  const players = new Set(Object.keys(state.players));
  const fromAssessor = new Set(Object.values(state.feedback)
    .filter(f => f.uid && players.has(f.uid) && (f.level || f.teacherLevel)).map(f => f.uid));
  const selfOnly = new Set(Object.values(state.responses)
    .filter(r => r.assessmentState === "degraded" && r.selfLevel && !fromAssessor.has(r.uid)).map(r => r.uid));
  return { assessed: fromAssessor.size, selfOnly: selfOnly.size };
}

function mathNumbers() {
  const entries = Object.values(state.math).filter(m => m.game > 0 && (m.correct || m.revealed));
  const firstTry = entries.filter(m => Array.isArray(m.attempts) && m.attempts[0] === m.expected).length;
  return { n: entries.length, correct: entries.filter(m => m.correct).length, firstTry };
}

// ---------- the current moment ----------
const ROUND_STATE_WORDS = {
  decide: "students are deciding", locked: "decisions are locked", rolling: "the dice are rolling",
  revealed: "students are entering new balances", compute: "students are entering new balances", settled: "the round is settled"
};

function nowLine() {
  const s = state.session;
  const phase = PHASE_LABELS[s.phase] || s.phase;
  if (!inRounds(s)) return phase;
  const game = s.game === 0 ? "Practice" : `Game ${s.game}`;
  return `${game}, round ${s.round} of ${GAMES[s.game].rounds}, ${ROUND_STATE_WORDS[s.roundState] || s.roundState}`;
}

function elapsedText() {
  const start = millisOf(state.session && state.session.phaseStartedAt);
  if (!start) return "";
  const secs = Math.max(0, Math.floor((serverNow() - start) / 1000));
  return formatClock(secs);
}

function tickElapsed() {
  const node = document.getElementById("elapsed");
  if (!node) return;
  const t = elapsedText();
  if (node.textContent !== t) node.textContent = t;
}

// ---------- render ----------
function render() {
  const s = state.session;
  if (!s) return mount(root, el("main", { class: "center-screen" }, el("h1", null, "This session does not exist")));
  mount(root, el("main", { class: "obs" },
    el("section", { class: "obs-col" }, headBlock(), momentBlock(), intentBlock()),
    el("section", { class: "obs-col" }, participationBlock(), distributionBlock(), growthBlock(), feedbackBlock(), mathBlock())));
  tickElapsed();
}

function headBlock() {
  return el("div", { class: "obs-block" },
    el("p", { class: "obs-objective" }, el("strong", null, "Objective: "), OBJECTIVE),
    el("p", { class: "muted" }, STANDARD),
    el("p", { class: "muted" }, `Section ${state.session.section}, ${studentCount()} students signed in`));
}

function momentBlock() {
  const s = state.session;
  const timed = s.roundEndsAt && millisOf(s.roundEndsAt) > serverNow();
  return el("div", { class: "obs-block" },
    el("h1", { class: "obs-now" }, nowLine()),
    el("p", null, "Time on this task ", el("span", { id: "elapsed", class: "mono" }, elapsedText())),
    timed ? el("p", null, "Time left on the student timer ", countdown(s.roundEndsAt, "mono")) : null);
}

function intentBlock() {
  const text = DESIGN_INTENT[state.session.phase];
  if (!text) return null;
  return el("div", { class: "obs-block obs-intent" },
    el("h2", null, "Why this part is built this way"),
    el("p", null, text));
}

function participationBlock() {
  const p = participation();
  const n = studentCount();
  if (!p) return el("div", { class: "obs-block" }, el("h2", null, "No student prompt is open right now"));
  return el("div", { class: "obs-block" },
    el("p", { class: "obs-big mono" }, `${p.done} of ${n}`),
    el("p", null, `have answered ${p.what}, ${pct(p.done, n)} percent`));
}

function distributionBlock() {
  const rows = distributionRows();
  if (!rows.length) return el("div", { class: "obs-block" }, el("h2", null, "No written responses yet"));
  return el("div", { class: "obs-block" },
    el("h2", null, "Claim, evidence, reasoning scores"),
    el("table", { class: "obs-table" },
      el("thead", null, el("tr", null,
        el("th", null, ""), el("th", null, "Level 4"), el("th", null, "Level 3"), el("th", null, "Level 2"),
        el("th", null, "Level 1"), el("th", null, "Awaiting score"))),
      el("tbody", null, rows.map(r => el("tr", null,
        el("th", null, r.label),
        el("td", { class: "mono" }, r.l4), el("td", { class: "mono" }, r.l3), el("td", { class: "mono" }, r.l2),
        el("td", { class: "mono" }, r.l1), el("td", { class: "mono" }, r.waiting))))));
}

function growthBlock() {
  const g2Exists = writtenResponses().some(r => r.kind !== "exit" && r.game === 2);
  if (!g2Exists) return null;
  const n = summaryNumbers({ ...state, roster: {} });
  const change = n.g2Pct - n.g1Pct;
  const changeWords = change === 0 ? "no change" : `${change > 0 ? "up" : "down"} ${Math.abs(change)} ${Math.abs(change) === 1 ? "point" : "points"}`;
  return el("div", { class: "obs-block" },
    el("h2", null, `Level 3 or higher, ${changeWords} from Game 1 to Game 2`),
    el("table", { class: "obs-table" },
      el("tbody", null,
        el("tr", null, el("th", null, "Game 1"), el("td", { class: "mono" }, `${n.g1Pct}%`), el("td", { class: "muted" }, `of ${n.g1n} responses`)),
        el("tr", null, el("th", null, "Game 2"), el("td", { class: "mono" }, `${n.g2Pct}%`), el("td", { class: "muted" }, `of ${n.g2n} responses so far`)),
        n.exitn ? el("tr", null, el("th", null, "Exit ticket"), el("td", { class: "mono" }, `${n.exitPct}%`), el("td", { class: "muted" }, `of ${n.exitn} responses so far`)) : null)));
}

function feedbackBlock() {
  const f = feedbackReach();
  const n = studentCount();
  if (!f.assessed && !f.selfOnly) return null;
  return el("div", { class: "obs-block" },
    el("p", null, el("span", { class: "mono obs-mid" }, `${f.assessed} of ${n}`), " students have received written feedback"),
    f.selfOnly ? el("p", { class: "muted" }, `${f.selfOnly} more self-assessed against the scoring guide while feedback was delayed`) : null);
}

function mathBlock() {
  const m = mathNumbers();
  if (!m.n) return null;
  return el("div", { class: "obs-block" },
    el("p", null, el("span", { class: "mono obs-mid" }, `${pct(m.correct, m.n)}%`), ` of ${m.n} mental math entries correct within two tries`),
    el("p", { class: "muted" }, `${pct(m.firstTry, m.n)}% correct on the first try`));
}
