// Student view. One task visible at a time. Student text is rendered as text nodes only.
import {
  db, auth, doc, getDoc, getDocFromServer, getDocs, setDoc, updateDoc, collection, query, where, onSnapshot,
  serverTimestamp, watchAuth, signInWithSchoolGoogle, signInWithClassCode, signOutNow
} from "../firebase.js";
import { watchSession, watchCollection, subDoc, sub, measureClockOffset, serverNow, millisOf } from "../session.js";
import {
  GAMES, isCheckpointRound, isDoubleRound, isTeamRound, isFinalRound, valueOfChoice, signedMoney, START_BALANCE, avgMoney
} from "../game.js";
import {
  el, mount, countdown, bootPage, openOverlay, setDyslexiaFont, directionNode, reducedMotion, nameNode, displayName,
  applyAccent, burst, rain, countUp
} from "../shared/ui.js";
import { agendaBlock, vocabBlock, guideBlock } from "../shared/panels.js";
import {
  OBJECTIVE, EMOJIS, RULES, CHECKPOINT_PROMPT, GAME2_STEM, EXIT_PROMPT, CLOSURE_QUESTIONS,
  PROBE_TEXT, CER_STEPS, MIND_TRAPS, WAYGROUND_URL, SCORING_GUIDE, RULE_EXAMPLES,
  QUIZ, QUIZ_PER_WAIT, SPARKLE_RIGHT, SPARKLE_WRONG
} from "../shared/content.js";
import { ACCENTS, accentOnLight } from "../shared/tokens.js";
import { assessorUrl, setAssessorUrl } from "../shared/config.js";

const root = document.getElementById("app");
const state = {
  user: null, sessionId: null, session: null, player: undefined,
  decisions: {}, responses: {}, feedback: {}, math: {}, rolls: {}, teams: {}, probe: null,
  peerAssignment: null, joinError: null, busy: false, showReasonBox: false,
  mathLocal: {}, unsubs: [], lastKey: null, quiz: {}, quizShow: null, offline: false, lastScreen: null
};
// Google sign-in stays in the code but is hidden. Add ?google=1 to the address to show it.
const GOOGLE_ON = new URLSearchParams(location.search).get("google") === "1";
let pendingCode = null;
const drafts = loadDrafts();

bootPage();
applyAccent(localGet("rwm-accent") || "slate");
startFullscreenGate();
watchAuth(async user => {
  state.user = user;
  if (!user) { cleanup(); GOOGLE_ON ? renderSignIn() : renderClassCode(); return; }
  await measureClockOffset();
  // a remembered session is reused only if this student already joined it and it
  // started recently, because the same laptop serves both sections
  const fromUrl = new URLSearchParams(location.search).get("s");
  const remembered = localGet("rwm-session");
  if (pendingCode) { const c = pendingCode; pendingCode = null; lookupCode(c); }
  else if (fromUrl && await sessionExists(fromUrl)) startSession(fromUrl);
  else if (remembered && await recentlyJoined(remembered)) startSession(remembered);
  else renderClassCode();
});

// ---------- small helpers ----------
function localGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function localSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window */ } }
function loadDrafts() { try { return JSON.parse(localStorage.getItem("rwm-drafts") || "{}"); } catch (e) { return {}; } }
function saveDrafts() { localSet("rwm-drafts", JSON.stringify(drafts)); }
function uid() { return state.user.uid; }
function key(game, round) { return `${uid()}_${game}_${round}`; }
function isAnon() { return !!state.user && state.user.isAnonymous; }

async function alreadyJoined(sid) {
  try { return (await getDoc(subDoc(sid, "players", uid()))).exists(); } catch (e) { return false; }
}

// Sessions older than this are a different class period on a shared laptop.
const SESSION_REUSE_MS = 150 * 60 * 1000;
async function recentlyJoined(sid) {
  try {
    const sess = await getDoc(doc(db, "sessions", sid));
    if (!sess.exists()) return false;
    const at = millisOf(sess.data().createdAt);
    if (at && serverNow() - at > SESSION_REUSE_MS) return false;
    return await alreadyJoined(sid);
  } catch (e) { return false; }
}

async function sessionExists(sid) {
  try { return (await getDoc(doc(db, "sessions", sid))).exists(); } catch (e) { return false; }
}

function cleanup() {
  state.unsubs.forEach(u => u());
  state.unsubs = [];
  state.lastKey = null;
}

// ---------- sign in ----------
// Only shown with ?google=1. Students join with the class code.
function renderSignIn(message) {
  state.lastKey = null;
  mount(root, el("main", { class: "center-screen" },
    el("p", { class: "hero-emoji", "aria-hidden": "true" }, "🎲"),
    el("h1", null, "Roll with the Market"),
    el("button", { class: "btn btn-big", onclick: async () => {
      try { await signInWithSchoolGoogle(); } catch (e) { renderSignIn("Google sign-in did not work. Use the class code instead."); }
    } }, "Sign in with Google"),
    message ? el("p", { class: "notice" }, message) : null,
    el("p", { class: "spaced" }, el("button", { class: "btn-quiet btn", onclick: () => renderClassCode() }, "Use the class code instead")),
    preJoinFontButton()));
}

function renderClassCode(message) {
  state.lastKey = null;
  const input = el("input", { type: "text", id: "code", class: "code-input", autocomplete: "off", maxlength: "8", "aria-label": "Class code", spellcheck: "false" });
  const status = el("p", { class: "notice", role: "status" }, message || "");
  const btn = el("button", { class: "btn btn-big", onclick: () => go() }, "Join");
  const go = async () => {
    const code = input.value.trim().toUpperCase();
    if (!code) { status.textContent = "Type the class code from the board."; return; }
    btn.disabled = true;
    status.textContent = "Connecting.";
    if (!state.user) {
      pendingCode = code;
      try { await signInWithClassCode(); }
      catch (e) { pendingCode = null; btn.disabled = false; status.textContent = "Could not connect. Check the wifi and try again."; }
      return;
    }
    lookupCode(code);
  };
  input.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  mount(root, el("main", { class: "center-screen" },
    el("p", { class: "hero-emoji", "aria-hidden": "true" }, "🎲"),
    el("h1", null, "Roll with the Market"),
    el("label", { class: "field", for: "code" }, "Enter the class code"),
    el("p", { class: "muted" }, "The code is on the board."),
    el("div", { class: "row" }, input, btn),
    status,
    GOOGLE_ON && state.user ? el("p", { class: "spaced" }, el("button", { class: "btn btn-quiet", onclick: () => signOutNow() }, "Sign out")) : null,
    preJoinFontButton()));
  input.focus();
}

async function lookupCode(code) {
  try {
    const snap = await getDocs(query(collection(db, "sessions"), where("classCode", "==", code)));
    const found = [];
    snap.forEach(d => found.push({ id: d.id, ...d.data() }));
    found.sort((a, b) => (millisOf(b.createdAt) || 0) - (millisOf(a.createdAt) || 0));
    if (!found.length) return renderClassCode("No class has that code. Check the board.");
    const s = found[0];
    // say so now, before the student fills in the whole join form
    if (!(await alreadyJoined(s.id))) {
      if (s.joinLocked) return renderClassCode("Joining is closed. Tell your teacher.");
      if (isAnon() && !s.allowAnonymous) return renderClassCode("Class code sign-in is off. Tell your teacher, then enter the code again.");
    }
    startSession(s.id);
  } catch (e) {
    renderClassCode("That did not work. Check the code and try again.");
  }
}

// ---------- full screen ----------
// The site runs in full screen. Leaving it covers the page until the student returns.
function isFullscreen() {
  if (document.fullscreenElement) return true;
  // F11 full screen does not set fullscreenElement
  return Math.abs(window.innerHeight - screen.height) < 3 && Math.abs(window.innerWidth - screen.width) < 3;
}
function startFullscreenGate() {
  if (navigator.webdriver || !document.fullscreenEnabled) return;
  let gate = null;
  const check = () => {
    if (isFullscreen()) { if (gate) { gate.remove(); gate = null; } return; }
    if (gate) return;
    const msg = el("p", { class: "notice" });
    gate = el("div", { class: "fs-gate", role: "dialog", "aria-modal": "true", "aria-label": "Full screen" },
      el("div", { class: "fs-panel" },
        el("p", { class: "hero-emoji", "aria-hidden": "true" }, "🎲"),
        el("h1", null, "Full screen is on for this lesson"),
        el("p", null, "Your work is saved. Click to go back in."),
        el("button", { class: "btn btn-big", onclick: () => {
          document.documentElement.requestFullscreen().catch(() => { msg.textContent = "Full screen did not start. Press F11."; });
        } }, "Enter full screen"),
        msg));
    document.body.appendChild(gate);
  };
  document.addEventListener("fullscreenchange", check);
  window.addEventListener("resize", check);
  check();
}

// ---------- font before joining ----------
// Before a player record exists the choice lives on this laptop, then it is
// copied into the player record at join.
function preJoinFont() { return localGet("rwm-dyslexia") === "1"; }
function preJoinFontButton() {
  setDyslexiaFont(preJoinFont());
  const btn = el("button", { class: "btn btn-quiet", "aria-pressed": preJoinFont() ? "true" : "false" }, preJoinFont() ? "Standard font" : "Dyslexia font");
  btn.addEventListener("click", () => {
    const on = !preJoinFont();
    localSet("rwm-dyslexia", on ? "1" : "0");
    setDyslexiaFont(on);
    btn.textContent = on ? "Standard font" : "Dyslexia font";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  return el("p", { class: "spaced" }, btn);
}

// ---------- session subscriptions ----------
function startSession(sid) {
  cleanup();
  state.sessionId = sid;
  localSet("rwm-session", sid);
  const me = uid();
  state.unsubs.push(watchSession(sid, s => { state.session = s; setAssessorUrl(s && s.assessorUrl); render(); }, () => renderClassCode("That class is not available.")));
  state.unsubs.push(onSnapshot(subDoc(sid, "players", me), snap => {
    state.player = snap.exists() ? snap.data() : null;
    if (state.player) {
      setDyslexiaFont(state.player.dyslexiaFont);
      applyAccent(state.player.accentColor);
      localSet("rwm-accent", state.player.accentColor || "slate");
    }
    render();
  }, () => { state.player = null; render(); }));
  const mine = [["uid", "==", me]];
  const byId = list => Object.fromEntries(list.map(d => [d.id, d]));
  state.unsubs.push(watchCollection(sid, "decisions", l => { state.decisions = byId(l); render(); }, mine));
  state.unsubs.push(watchCollection(sid, "responses", l => { state.responses = byId(l); render(); }, mine));
  state.unsubs.push(watchCollection(sid, "feedback", l => { state.feedback = byId(l); render(); }, mine));
  state.unsubs.push(watchCollection(sid, "mathEntries", l => { state.math = byId(l); render(); }, mine));
  state.unsubs.push(watchCollection(sid, "rolls", l => { state.rolls = byId(l); render(); }));
  state.unsubs.push(watchCollection(sid, "teams", l => { state.teams = byId(l); render(); }));
  state.unsubs.push(onSnapshot(subDoc(sid, "probes", me), s => { state.probe = s.exists() ? s.data() : null; render(); }, () => {}));
  state.unsubs.push(onSnapshot(subDoc(sid, "peerAssignments", me), s => { state.peerAssignment = s.exists() ? s.data() : null; render(); }, () => {}));
  state.unsubs.push(watchCollection(sid, "quizAnswers", l => { state.quiz = byId(l); render(); }, mine));
  // re-check timed fallbacks, such as the 20 second assessor degrade
  const t = setInterval(() => render(), 2000);
  state.unsubs.push(() => clearInterval(t));
  state.unsubs.push(startWatchdog(sid));
}

// The live listener can stall on some school networks and leave a screen stuck
// on an old phase. Every 8 seconds, read the session straight from the server.
// If it disagrees with the screen twice in a row, use the fresh copy and
// restart every listener. Two strikes, so a normal phase change is never mistaken
// for a stall.
function startWatchdog(sid) {
  let strikes = 0, fails = 0;
  const sig = x => x ? [x.phase, x.game, x.round, x.roundState, x.cerSubStep, x.cerReveal, x.ruleStep, x.biasSurveyPushId].join("|") : "";
  const iv = setInterval(async () => {
    if (state.sessionId !== sid) return;
    try {
      const snap = await getDocFromServer(doc(db, "sessions", sid));
      fails = 0;
      if (state.offline) { state.offline = false; state.lastKey = null; render(); }
      if (!snap.exists()) return;
      const fresh = { id: snap.id, ...snap.data() };
      if (sig(fresh) === sig(state.session)) { strikes = 0; return; }
      if (++strikes < 2) return;
      console.warn("session listener stalled, restarting");
      startSession(sid);
      state.session = fresh;
      render();
    } catch (e) {
      if (++fails >= 2 && !state.offline) { state.offline = true; state.lastKey = null; render(); }
    }
  }, 8000);
  return () => clearInterval(iv);
}

// ---------- render loop ----------
// The screen is rebuilt only when what it shows changes, so typing is never interrupted.
function render() {
  if (!state.user || !state.sessionId) return;
  if (!state.session || state.player === undefined) return;
  if (state.player === null) return renderJoin();
  const vm = viewModel();
  const k = JSON.stringify(vm);
  if (k === state.lastKey) return;
  state.lastKey = k;
  const focusedId = document.activeElement && document.activeElement.id;
  let body;
  try { body = taskScreen(vm); }
  catch (e) {
    console.error(e);
    body = el("section", { class: "center-block" }, el("h1", null, "This screen did not load"),
      el("p", null, "Your work is saved."), el("button", { class: "btn btn-big", onclick: () => location.reload() }, "Reload"));
  }
  // a new screen slides in once. Updates to the same screen never move.
  const screenId = [vm.phase, vm.game, vm.round, vm.rs, vm.sub, vm.rule].join("|");
  const fresh = screenId !== state.lastScreen;
  state.lastScreen = screenId;
  mount(root, topBar(), el("main", { class: "task" + (fresh && !reducedMotion() ? " enter" : "") }, body));
  if (focusedId) { const f = document.getElementById(focusedId); if (f) f.focus(); }
  afterRender.splice(0).forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
}
// work that needs the new screen on the page, such as a burst at a button
const afterRender = [];
const celebrated = { poll: null, quiz: null };

function viewModel() {
  const s = state.session;
  const p = state.player;
  const g = s.game, r = s.round;
  const fb = Object.values(state.feedback).map(f => [f.id, f.level, f.teacherLevel]);
  const resp = Object.values(state.responses).map(x => [x.id, x.assessmentState, x.selfLevel, degradeDue(x)]);
  return {
    phase: s.phase, game: g, round: r, rs: s.roundState || null, sub: s.cerSubStep, rule: s.ruleStep,
    lb: s.leaderboardVisible ? (s.leaderboard || []).map(x => x.uid + x.balance) : null,
    survey: surveyOpen() ? s.biasSurveyPushId : null,
    bal: p.balance, hist: (p.balanceHistory || []).join(","), name: p.preferredName, emoji: p.emoji, accent: p.accentColor,
    team: p.teamId, seat: p.seat, dys: !!p.dyslexiaFont,
    dec: state.decisions[key(g, r)] ? state.decisions[key(g, r)].choice : null,
    math: mathState(g, r), mathLocal: state.mathLocal[key(g, r)] || null,
    roll: state.rolls[`${g}_${r}`] ? state.rolls[`${g}_${r}`].amount : null,
    fb, resp, reasonBox: state.showReasonBox, busy: state.busy,
    probe: state.probe ? state.probe.submittedAt ? "done" : "partial" : null,
    peer: state.peerAssignment ? state.peerAssignment.items.length : 0, peerDone: peerDone(),
    teams: Object.keys(state.teams).length, reveal: !!s.cerReveal,
    quiz: Object.keys(state.quiz).sort().join(), quizShow: state.quizShow, offline: state.offline,
    li: p.lastInitial || "", tb: (s.teamBoard || []).map(t => t.teamId + t.average).join()
  };
}

function mathState(g, r) {
  const m = state.math[key(g, r)];
  if (!m) return null;
  return [m.attempts.length, m.correct, m.revealed];
}

// ---------- top bar, always present after join ----------
function topBar() {
  const p = state.player;
  return el("header", { class: "topbar" },
    el("div", { class: "topbar-row" },
      el("div", { class: "me" }, nameNode(p)),
      el("div", { class: "stats" },
        el("span", { class: "stat" }, el("span", { class: "stat-k" }, "Balance"), el("span", { class: "money stat-v" }, "$" + (p.balance ?? START_BALANCE))),
        el("span", { class: "stat" }, el("span", { class: "stat-k" }, "✨ Sparkle Points"), el("span", { class: "money stat-v" }, String(sparkleTotal())))),
      el("nav", { class: "tools" },
        el("button", { class: "btn btn-quiet", onclick: () => openOverlay("Agenda", agendaBlock(state.session.phase)) }, "Agenda"),
        el("button", { class: "btn btn-quiet", onclick: () => openOverlay("Vocabulary", vocabBlock()) }, "Vocabulary"),
        el("button", { class: "btn btn-quiet", onclick: () => openOverlay("Scoring guide", guideBlock()) }, "Scoring guide"),
        el("button", { class: "btn btn-quiet", onclick: openProfile }, "Name and color"),
        GOOGLE_ON && !isAnon() ? el("button", { class: "btn btn-quiet", onclick: () => signOutNow() }, "Sign out") : null,
        el("button", { class: "btn btn-quiet", "aria-pressed": p.dyslexiaFont ? "true" : "false", onclick: toggleFont },
          p.dyslexiaFont ? "Standard font" : "Dyslexia font"))),
    el("div", { class: "objective" }, el("strong", null, "Objective: "), OBJECTIVE),
    state.offline ? el("p", { class: "offline", role: "status" }, "Reconnecting. If this stays, press Ctrl and R.") : null);
}

async function toggleFont() {
  const on = !state.player.dyslexiaFont;
  setDyslexiaFont(on);
  localSet("rwm-dyslexia", on ? "1" : "0");
  try { await updateDoc(subDoc(state.sessionId, "players", uid()), { dyslexiaFont: on }); } catch (e) { /* stays local */ }
}

// ---------- join flow ----------
let joinDraft = null;
function renderJoin() {
  state.lastKey = null;
  if (!joinDraft) {
    const parts = (state.user.displayName || "").split(" ");
    joinDraft = { name: parts[0] || "", last: parts.slice(1).join(" "), emoji: null, accent: null, confirmDuplicate: false };
  }
  const first = state.lastScreen !== "join";
  state.lastScreen = "join";
  mount(root, el("main", { class: "task join" + (first && !reducedMotion() ? " enter" : "") }, profileForm(joinDraft, "Join the class", submitJoin, true), preJoinFontButton()));
}

function profileForm(d, title, onSubmit, joining = false) {
  const nameInput = el("input", { type: "text", id: "pname", maxlength: "20", value: d.name || "", autocomplete: "off", "aria-label": joining ? "First name" : "Preferred first name" });
  nameInput.addEventListener("input", () => { d.name = nameInput.value; d.confirmDuplicate = false; });
  const lastInput = joining ? el("input", { type: "text", id: "plast", maxlength: "30", value: d.last || "", autocomplete: "off", "aria-label": "Last name" }) : null;
  if (lastInput) lastInput.addEventListener("input", () => { d.last = lastInput.value; d.confirmDuplicate = false; });
  const emojiGrid = el("div", { class: "emoji-grid", role: "radiogroup", "aria-label": "Emoji" },
    EMOJIS.map(e => el("button", {
      class: "emoji", type: "button", role: "radio", "aria-checked": d.emoji === e ? "true" : "false",
      onclick: ev => {
        d.emoji = e;
        emojiGrid.querySelectorAll(".emoji").forEach(b => b.setAttribute("aria-checked", "false"));
        ev.currentTarget.setAttribute("aria-checked", "true");
        burst(ev.currentTarget, [e], { count: 6, spread: 60 });
      }
    }, e)));
  const colorRow = el("div", { class: "color-row", role: "radiogroup", "aria-label": "Accent color" },
    Object.entries(ACCENTS).map(([k, a]) => el("button", {
      class: "swatch", type: "button", role: "radio", "aria-checked": d.accent === k ? "true" : "false",
      style: { color: a.onLight },
      onclick: ev => {
        d.accent = k;
        colorRow.querySelectorAll(".swatch").forEach(b => b.setAttribute("aria-checked", "false"));
        ev.currentTarget.setAttribute("aria-checked", "true");
        applyAccent(k);
      }
    }, el("span", { class: "swatch-dot", style: { background: a.onLight }, "aria-hidden": "true" }), a.label)));
  const error = el("p", { class: "notice", role: "status" }, state.joinError || "");
  return el("div", null,
    el("h1", null, title),
    joining
      ? el("div", { class: "name-row" },
          el("div", null, el("label", { class: "field", for: "pname" }, "First name"), nameInput),
          el("div", null, el("label", { class: "field", for: "plast" }, "Last name"), lastInput))
      : [el("label", { class: "field", for: "pname" }, "Preferred first name"), nameInput],
    joining ? el("p", { class: "muted small" }, "Classmates see your first name and last initial. Your teacher sees your full name.") : null,
    el("h2", { class: "field" }, "Pick one emoji"), emojiGrid,
    el("h2", { class: "field" }, "Pick one color"), el("p", { class: "muted small" }, "Your color follows you through the whole lesson."), colorRow,
    error,
    el("button", { class: "btn btn-big spaced", onclick: () => {
      const name = (d.name || "").trim();
      const last = (d.last || "").trim();
      if (!name) { error.textContent = "Enter your first name."; return; }
      if (joining && !last) { error.textContent = "Enter your last name."; return; }
      if (!d.emoji) { error.textContent = "Pick an emoji."; return; }
      if (!d.accent) { error.textContent = "Pick a color."; return; }
      onSubmit({ name: name.slice(0, 20), last: last.slice(0, 30), emoji: d.emoji, accent: d.accent }, error, d);
    } }, joining ? "Join" : "Save"));
}

// A student who already joined on another laptop would make a second copy of
// themselves. Ask before that happens.
async function nameAlreadyTaken(first, initial) {
  try {
    const snap = await getDocs(collection(db, "sessions", state.sessionId, "players"));
    let taken = false;
    snap.forEach(x => {
      const p = x.data();
      if (x.id !== uid() && (p.preferredName || "").toLowerCase() === first.toLowerCase() && (p.lastInitial || "") === initial) taken = true;
    });
    return taken;
  } catch (e) { return false; }
}

async function submitJoin(d, errorNode, draft) {
  const s = state.session;
  const inGame = (s.phase === "game1" || s.phase === "game2") && s.game >= 1;
  const lateBalance = Math.round(s.classAverageBalance ?? START_BALANCE);
  const joinedLate = PHASES_AFTER_START.includes(s.phase);
  const initial = d.last.charAt(0).toUpperCase();
  if (!draft.confirmDuplicate && await nameAlreadyTaken(d.name, initial)) {
    draft.confirmDuplicate = true;
    errorNode.textContent = `${d.name} ${initial}. already joined. If that is you on another laptop, tell your teacher. If it is a different student, press Join again.`;
    return;
  }
  const player = {
    uid: uid(), preferredName: d.name, lastInitial: initial, emoji: d.emoji, accentColor: d.accent,
    joinedAt: serverTimestamp(), joinedLate,
    balance: inGame ? lateBalance : START_BALANCE,
    balanceHistory: [inGame ? lateBalance : START_BALANCE],
    lateStart: inGame ? { game: s.game, round: s.round, balance: lateBalance } : null,
    archetype: null, teamId: null, seat: null, calledOnCount: 0, dyslexiaFont: preJoinFont()
  };
  state.joinError = null;
  errorNode.textContent = "Joining.";
  try {
    await setDoc(subDoc(state.sessionId, "players", uid()), player);
    await setDoc(subDoc(state.sessionId, "roster", uid()), {
      uid: uid(), email: state.user.email || null, accountName: `${d.name} ${d.last}`, firstName: d.name, lastName: d.last
    }).catch(() => {});
    joinDraft = null;
    requestAnimationFrame(() => rain([d.emoji, "✨"], { count: 28 }));
  } catch (e) {
    // A refused write first shows the player locally, then removes it, which
    // redraws the form. Keep the message in state so the redrawn form shows it.
    state.joinError = joinRefusedMessage(s);
    if (!state.player) renderJoin();
  }
}

function joinRefusedMessage(s) {
  if (s.joinLocked) return "Joining is closed. Tell your teacher.";
  if (isAnon() && !s.allowAnonymous) return "Class code sign-in is off. Tell your teacher.";
  const email = (state.user && state.user.email) || "";
  if (email && !/@greermiddlecollege\.org$/i.test(email)) return `${email} is not a school account. Tell your teacher.`;
  return "That did not work. Tell your teacher.";
}
const PHASES_AFTER_START = ["game1", "game1-complete", "feedback-1", "cer-lesson", "team-assignment", "team-huddle", "game2", "game2-probe", "game2-complete", "peer-scoring", "debrief", "exit-ticket", "closure"];

function openProfile() {
  const p = state.player;
  const d = { name: p.preferredName, emoji: p.emoji, accent: p.accentColor };
  let close = null;
  close = openOverlay("Name and color", profileForm(d, "Change your name, emoji, or color", async (v, err) => {
    applyAccent(v.accent);
    try {
      await updateDoc(subDoc(state.sessionId, "players", uid()), { preferredName: v.name, emoji: v.emoji, accentColor: v.accent });
      close();
    } catch (e) { err.textContent = "That did not save. Try again."; }
  }));
}

// ---------- the one task on screen ----------
function taskScreen(vm) {
  const s = state.session;
  if (surveyOpen()) return biasSurveyScreen();
  switch (s.phase) {
    case "lobby":
    case "agenda": return el("section", null,
      el("p", { class: "hello" }, `Welcome, ${state.player.emoji || ""} ${state.player.preferredName}.`),
      el("h1", null, "Read the agenda"), agendaBlock(s.phase));
    case "vocab-warmup": return el("section", { class: "center-block" },
      el("p", { class: "hero-emoji", "aria-hidden": "true" }, "🐂 🐻"),
      el("h1", null, "Vocab Warm Up"),
      el("p", null, el("a", { class: "btn btn-big", href: WAYGROUND_URL, target: "_blank", rel: "noopener" }, "Open Wayground")),
      el("p", null, "Come back to this tab when the warm-up ends."));
    case "learn-to-play": return s.roundState ? gameLoop() : rulesScreen();
    case "game1":
    case "game2": return s.roundState ? gameLoop() : el("section", { class: "center-block" }, el("h1", null, "The game starts in a moment"));
    case "game1-complete": return gameCompleteScreen(1);
    case "feedback-1": return feedbackScreen(1, "Read your feedback");
    case "cer-lesson": return cerScreen();
    case "team-assignment": return teamScreen(false);
    case "team-huddle": return teamScreen(true);
    case "game2-probe": return probeScreen();
    case "game2-complete": return gameCompleteScreen(2);
    case "peer-scoring": return peerScreen();
    case "debrief": return debriefScreen();
    case "exit-ticket": return exitScreen();
    case "closure": return closureScreen();
    default: return el("section", null, el("h1", null, "Wait for your teacher"));
  }
}

function timerLine() {
  const s = state.session;
  if (!s.roundEndsAt) return null;
  return el("p", { class: "time-left" }, "Time left ", countdown(s.roundEndsAt));
}

function rulesScreen() {
  const step = Math.max(1, Math.min(RULES.length, state.session.ruleStep || 1));
  return el("section", null,
    el("h1", null, "How the game works"),
    el("ol", { class: "rules" }, RULES.slice(0, step).map((r, i) => el("li", { class: i === step - 1 ? "rule-new" : "" }, r,
      i === step - 1 ? el("span", { class: "rule-example" }, "Example: " + RULE_EXAMPLES[i]) : null))));
}

// ---------- game loop ----------
function gameLoop() {
  const s = state.session;
  const g = s.game, r = s.round;
  const dec = state.decisions[key(g, r)];
  switch (s.roundState) {
    case "decide": return dec ? waitingScreen(dec, "Locked in. Wait for the roll.", quizSlotFor(g, r)) : decideScreen();
    case "locked":
    case "rolling": return waitingScreen(dec, "The roll is on the board. Look up.");
    case "revealed":
    case "compute": return computeScreen();
    case "settled": return settledScreen();
    default: return el("section", null, el("h1", null, "Wait for the next round"));
  }
}

function roundLabel() {
  const s = state.session;
  const total = GAMES[s.game].rounds;
  return (s.game === 0 ? "Practice round " : `Game ${s.game}, round `) + `${s.round} of ${total}`;
}

function chosenUsed(game) {
  return Object.values(state.responses).some(x => x.game === game && x.kind === "chosen");
}

function decideScreen() {
  const s = state.session;
  const g = s.game, r = s.round;
  const checkpoint = isCheckpointRound(g, r);
  const forced = g > 0 && !checkpoint && isFinalRound(g, r) && !chosenUsed(g);
  const canChoose = g > 0 && !checkpoint && !forced && !chosenUsed(g);
  const writing = checkpoint || forced || (canChoose && state.showReasonBox);
  const draftKey = key(g, r);
  const d = drafts[draftKey] || (drafts[draftKey] = { choice: null, text: "" });

  const choiceBtn = (c, icon, sub) => el("button", { class: "choice choice-card", "aria-pressed": d.choice === c ? "true" : "false", "aria-label": c, onclick: () => pick(c) },
    el("span", { class: "choice-icon", "aria-hidden": "true" }, icon),
    el("span", { class: "choice-word" }, c),
    el("span", { class: "choice-sub" }, sub));
  const inBtn = choiceBtn("IN", "📈", isDoubleRound(g, r) ? "The market moves you, twice" : "The market moves your money");
  const outBtn = choiceBtn("OUT", "🏦", "A sure $1");
  function pick(c) {
    d.choice = c; saveDrafts();
    inBtn.setAttribute("aria-pressed", c === "IN" ? "true" : "false");
    outBtn.setAttribute("aria-pressed", c === "OUT" ? "true" : "false");
  }

  let textArea = null;
  if (writing) {
    textArea = el("textarea", { id: "reason-" + draftKey, maxlength: "1200", "aria-label": "Your reason" });
    textArea.value = d.text;
    textArea.addEventListener("input", () => { d.text = textArea.value; saveDrafts(); });
  }
  const error = el("p", { class: "notice", role: "status" });
  const lockBtn = el("button", { class: "btn btn-big", disabled: state.busy, onclick: async () => {
    if (!d.choice) { error.textContent = "Pick IN or OUT."; return; }
    if (writing && d.text.trim().length < 3) { error.textContent = "Type your reason."; return; }
    state.busy = true; lockBtn.disabled = true;
    const ok = await submitDecision(g, r, d.choice, writing ? d.text.trim() : null, checkpoint ? "checkpoint" : "chosen");
    state.busy = false;
    if (!ok) { lockBtn.disabled = false; error.textContent = "The round is locked. Your pick did not count."; }
    else {
      state.showReasonBox = false; delete drafts[draftKey]; saveDrafts();
      requestAnimationFrame(() => burst(document.querySelector(".stamp"), [state.player.emoji || "✨", "✨"], { count: 12 }));
    }
  } }, "Lock in");

  return el("section", null,
    el("p", { class: "round-label" }, roundLabel()),
    timerLine(),
    isDoubleRound(g, r) ? el("p", { class: "callout" }, "Double round. IN moves twice the amount. OUT still earns $1.") : null,
    isTeamRound(g, r) ? el("p", { class: "callout" }, "Your table decides together. Enter your table's choice.") : null,
    el("h1", null, "Pick IN or OUT"),
    el("div", { class: "choices" }, inBtn, outBtn),
    writing ? el("div", { class: "writing" },
      forced ? el("p", { class: "callout" }, "Last round. You have not added your own reason this game, so write one now.") : null,
      el("label", { for: textArea.id, class: "field" }, CHECKPOINT_PROMPT),
      g === 2 ? el("p", { class: "stem" }, GAME2_STEM) : null,
      textArea) : null,
    canChoose && !state.showReasonBox ? el("p", null, el("button", { class: "btn btn-quiet", onclick: () => { state.showReasonBox = true; state.lastKey = null; render(); } },
      "Add a reason this round")) : null,
    canChoose && !state.showReasonBox ? el("p", { class: "muted small" }, "You add one reason of your own each game. Use it on any round without a prompt.") : null,
    error,
    lockBtn);
}

async function submitDecision(game, round, choice, text, kind) {
  const sid = state.sessionId;
  const id = key(game, round);
  try {
    await setDoc(subDoc(sid, "decisions", id), {
      uid: uid(), game, round, choice, decidedAt: serverTimestamp(), wasTeamRound: isTeamRound(game, round)
    });
  } catch (e) { return false; }
  if (text) await saveResponse(id, { game, round, kind, decision: choice, text, isDoubleRound: isDoubleRound(game, round) });
  return true;
}

async function saveResponse(id, r) {
  try {
    await setDoc(subDoc(state.sessionId, "responses", id), {
      uid: uid(), game: r.game, round: r.round, kind: r.kind, decision: r.decision, text: r.text,
      submittedAt: serverTimestamp(), assessmentState: "pending", selfLevel: null, selfNote: null
    });
  } catch (e) { return false; }
  requestAssessment(id, r);
  return true;
}

function requestAssessment(responseId, r) {
  fetch(assessorUrl() + "/assess", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: state.sessionId, responseId, game: r.game, round: r.round, decision: r.decision,
      text: r.text, isDoubleRound: !!r.isDoubleRound, isExitTicket: r.kind === "exit"
    })
  }).catch(() => { /* the hub retries pending responses */ });
}

function waitingScreen(dec, line, slot) {
  const head = [
    el("p", { class: "round-label" }, roundLabel()),
    el("p", { class: "stamp", "aria-hidden": "true" }, dec ? (dec.choice === "IN" ? "📈" : "🏦") : "⏳"),
    el("h1", null, line),
    dec ? el("p", { class: "pick-line" }, "Your pick: ", el("strong", { class: "accent-text" }, dec.choice)) : el("p", null, "No pick this round. You are OUT.")
  ];
  if (slot) return el("section", { class: "wait-split" }, el("div", { class: "wait-head" }, head), quizPanel(slot));
  return el("section", { class: "center-block" }, head);
}

// The impact modal. The student computes the new balance. The answer is never shown first.
function computeScreen() {
  const s = state.session;
  const g = s.game, r = s.round;
  const roll = state.rolls[`${g}_${r}`];
  if (!roll) return waitingScreen(state.decisions[key(g, r)], "The roll is on the board. Look up.");
  const dec = state.decisions[key(g, r)];
  const choice = dec ? dec.choice : "OUT";
  const start = state.player.balance ?? START_BALANCE;
  const delta = valueOfChoice(choice, roll);
  const expected = start + delta;
  const m = state.math[key(g, r)];
  const local = state.mathLocal[key(g, r)];
  const response = state.responses[key(g, r)];

  if (m && (m.correct || m.revealed) && !local) {
    return el("section", { class: "center-block" },
      el("h1", null, "Balance entered"),
      el("p", null, "New balance ", el("span", { class: "money big-num" }, "$" + expected)),
      el("p", { class: "muted" }, "Wait for the class."));
  }

  const attempts = m ? m.attempts.length : 0;
  const parts = [
    el("p", { class: "round-label" }, roundLabel()),
    el("div", { class: "impact-row" }, el("span", { class: "impact-k" }, "You picked"), el("span", { class: "impact-v" }, choice,
      dec && dec.defaulted ? " (no pick before the lock)" : "")),
    response ? el("div", { class: "impact-row" }, el("span", { class: "impact-k" }, "Your reason"), el("span", { class: "impact-v quote" }, response.text)) : null,
    el("div", { class: "impact-row" }, el("span", { class: "impact-k" }, "Market"),
      el("span", { class: "impact-v" }, directionNode(roll.direction), " ", el("span", { class: "money" }, "$" + roll.amount),
        roll.doubled ? el("span", null, " doubled to ", el("span", { class: "money" }, "$" + roll.effectiveAmount)) : null))
  ];

  if (local && local.done) {
    parts.push(el("p", { class: "result" }, local.message));
    parts.push(el("button", { class: "btn btn-big", onclick: () => { delete state.mathLocal[key(g, r)]; state.lastKey = null; render(); } }, "Continue"));
    return el("section", { class: "impact" }, parts);
  }

  if (attempts === 1) {
    const amt = choice === "IN" ? roll.effectiveAmount : 1;
    const sign = delta >= 0 ? "+" : "−";
    parts.push(el("div", { class: "hint" },
      el("p", null, "Check the setup."),
      el("p", { class: "money hint-math" }, `$${start} ${sign} $${amt} = ?`),
      choice === "OUT" ? el("p", null, "OUT always earns $1.") : null));
  }

  const input = el("input", { type: "number", id: "newbal-" + key(g, r), inputmode: "numeric", "aria-label": "New balance" });
  const error = el("p", { class: "notice", role: "status" });
  const submit = async () => {
    const val = Number(input.value);
    if (input.value === "" || !Number.isFinite(val)) { error.textContent = "Enter a number."; return; }
    await recordMath(g, r, expected, val, attempts);
  };
  input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
  parts.push(el("label", { class: "field", for: input.id }, "Enter your new balance"));
  parts.push(el("div", { class: "row" }, el("span", { class: "money big-num" }, "$"), input, el("button", { class: "btn btn-big", onclick: submit }, "Check")));
  parts.push(error);
  return el("section", { class: "impact" }, parts);
}

async function recordMath(g, r, expected, value, priorAttempts) {
  const id = key(g, r);
  const prev = state.math[id];
  const attempts = (prev ? prev.attempts : []).concat([value]);
  const correct = value === expected;
  const revealed = !correct && attempts.length >= 2;
  const entry = {
    uid: uid(), game: g, round: r, expected, attempts, correct,
    usedHint: attempts.length > 1, revealed, settledAt: (correct || revealed) ? serverTimestamp() : null
  };
  if (correct) {
    state.mathLocal[id] = { done: true, message: `Correct. Your new balance is $${expected}.` };
    afterRender.push(() => burst(document.querySelector(".result"), ["✔", "✨", state.player.emoji || "⭐"], { count: 12 }));
  }
  else if (revealed) state.mathLocal[id] = { done: true, message: `Your new balance is $${expected}.` };
  // redraw now, before the save is confirmed. Redrawing after the confirm would
  // wipe a second answer the student has already started typing on slow wifi.
  state.lastKey = null;
  render();
  try { await setDoc(subDoc(state.sessionId, "mathEntries", id), entry); } catch (e) { /* retried on next entry */ }
}

let lastCelebrated = null;
function settledScreen() {
  const s = state.session;
  const p = state.player;
  const response = state.responses[key(s.game, s.round)];
  const h = p.balanceHistory || [];
  const change = h.length >= 2 ? h[h.length - 1] - h[h.length - 2] : null;
  const balNode = el("span", { class: "money big-num accent-text" }, "$" + p.balance);
  const celebrateKey = `${s.game}_${s.round}_${p.balance}`;
  if (lastCelebrated !== celebrateKey) {
    lastCelebrated = celebrateKey;
    if (change !== null) countUp(balNode, p.balance - change, p.balance);
    if (change > 1) afterRender.push(() => rain([p.emoji || "💵", "💵", "✨"], { count: Math.min(40, 10 + change * 2) }));
    else if (change === 1) afterRender.push(() => burst(balNode, ["🏦", "✨"], { count: 8 }));
  }
  return el("section", null,
    el("p", { class: "round-label" }, roundLabel()),
    el("h1", null, change === null ? "Round over" : change > 1 ? "Your money grew" : change === 1 ? "You banked $1" : "The market took some back"),
    el("p", { class: "settled-balance" }, "Balance ", balNode),
    change !== null ? el("p", { class: "round-change" },
      el("span", { class: change >= 0 ? "dir-up" : "dir-down" }, change >= 0 ? "▲ " : "▼ ", el("span", { class: "money" }, signedMoney(change))),
      " this round") : null,
    s.game > 0 ? balanceChart(p.balanceHistory || [], p.accentColor) : null,
    s.game === 2 && response ? feedbackItem(response) : null,
    s.game === 2 && isTeamRound(2, s.round) && (s.teamBoard || []).length ? teamBoardList() : null,
    s.leaderboardVisible && !(s.game === 2 && isTeamRound(2, s.round)) ? leaderboardList() : null);
}

let lastChartEnd = null;
function balanceChart(history, accent) {
  const w = 640, h = 180, pad = 14;
  if (history.length < 1) return null;
  const min = Math.min(...history) - 5, max = Math.max(...history) + 5;
  const x = i => pad + (history.length === 1 ? 0 : i * (w - pad * 2) / (history.length - 1));
  const y = v => h - pad - (v - min) * (h - pad * 2) / Math.max(1, max - min);
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("class", "chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Your balance by round: " + history.map(v => "$" + v).join(", "));
  const line = document.createElementNS(svgNS, "polyline");
  line.setAttribute("points", history.map((v, i) => `${x(i)},${y(v)}`).join(" "));
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", accentOnLight(accent));
  line.setAttribute("stroke-width", "4");
  line.setAttribute("stroke-linejoin", "round");
  svg.appendChild(line);
  const end = history[history.length - 1];
  const dot = document.createElementNS(svgNS, "circle");
  dot.setAttribute("cx", x(history.length - 1));
  dot.setAttribute("cy", y(end));
  dot.setAttribute("r", "7");
  dot.setAttribute("fill", accentOnLight(accent));
  svg.appendChild(dot);
  const sig = history.join(",");
  if (lastChartEnd !== null && lastChartEnd !== sig && !reducedMotion()) svg.classList.add("jolt");
  lastChartEnd = sig;
  return svg;
}

function ordinal(n) { const t = n % 100; if (t >= 11 && t <= 13) return n + "th"; return n + ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"); }
const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

function leaderboardList() {
  const list = state.session.leaderboard || [];
  const me = list.find(x => x.uid === uid());
  const rankOf = x => x.rank || list.indexOf(x) + 1;
  const shown = list.slice(0, 5);
  if (me && !shown.includes(me)) shown.push(me);
  return el("div", { class: "leaderboard" },
    el("h2", null, "Leaderboard"),
    me ? el("p", { class: "my-rank" }, `You are ${ordinal(rankOf(me))} of ${list.length}.`) : null,
    el("ol", { class: "lb-rows" }, shown.map(x => el("li", { class: "lb-row" + (x.uid === uid() ? " lb-me" : "") },
      el("span", { class: "lb-rank mono" }, MEDALS[rankOf(x)] || String(rankOf(x))),
      nameNode(x),
      el("span", { class: "money lb-bal" }, "$" + x.balance)))));
}

function teamBoardList() {
  const list = state.session.teamBoard || [];
  const mine = state.player.teamId;
  return el("div", { class: "leaderboard" },
    el("h2", null, "Table standings, average balance"),
    el("ol", { class: "lb-rows" }, list.map((t, i) => el("li", { class: "lb-row" + (t.teamId === mine ? " lb-me" : "") },
      el("span", { class: "lb-rank mono" }, MEDALS[i + 1] || String(i + 1)),
      el("span", null, t.table, t.teamId === mine ? " (your table)" : ""),
      el("span", { class: "money lb-bal" }, "$" + avgMoney(t.average))))));
}

// ---------- feedback ----------
function responsesFor(game) {
  return Object.values(state.responses).filter(x => x.game === game && (x.kind === "checkpoint" || x.kind === "chosen"))
    .sort((a, b) => a.round - b.round);
}

function degradeDue(response) {
  if (state.feedback[response.id]) return false;
  const at = millisOf(response.submittedAt);
  return !!at && serverNow() - at > 20000;
}

function feedbackItem(response) {
  const f = state.feedback[response.id];
  const head = el("p", { class: "fb-head" },
    response.kind === "exit" ? "Exit ticket" : `Game ${response.game}, round ${response.round}, you picked ${response.decision}`);
  const text = el("p", { class: "quote" }, response.text);
  if (f) {
    const lvl = f.teacherLevel || f.level;
    return el("article", { class: "fb" + (reducedMotion() ? "" : " arrive") }, head, text,
      el("p", { class: "fb-level" }, "Level " + lvl),
      el("p", null, f.why),
      f.suggestedEdit ? el("p", null, el("strong", null, "Try: "), f.suggestedEdit.replace(/^Try:\s*/i, "")) : null,
      response.selfLevel ? el("p", { class: "muted" }, "Your own score: Level " + response.selfLevel) : null);
  }
  if (response.assessmentState === "degraded" && response.selfLevel) {
    return el("article", { class: "fb" }, head, text,
      el("p", { class: "fb-level" }, "Your score: Level " + response.selfLevel),
      response.selfNote ? el("p", null, "What is missing: ", response.selfNote) : null);
  }
  if (!degradeDue(response)) {
    return el("article", { class: "fb" }, head, text, el("p", { class: "muted" }, "Scoring. Feedback arrives in a few seconds."));
  }
  return selfAssessForm(response, head, text);
}

function selfAssessForm(response, head, text) {
  let level = null;
  const noteId = "self-" + response.id;
  const note = el("input", { type: "text", id: noteId, maxlength: "200", "aria-label": "What is missing" });
  note.value = (drafts[noteId] && drafts[noteId].text) || "";
  note.addEventListener("input", () => { drafts[noteId] = { text: note.value }; saveDrafts(); });
  const levels = el("div", { class: "level-pick", role: "radiogroup", "aria-label": "Your level" },
    SCORING_GUIDE.map(gd => el("button", { class: "level-btn", type: "button", role: "radio", "aria-checked": "false",
      onclick: ev => { level = gd.level; levels.querySelectorAll(".level-btn").forEach(b => b.setAttribute("aria-checked", "false")); ev.currentTarget.setAttribute("aria-checked", "true"); } },
      el("strong", null, "Level " + gd.level), " ", gd.text)));
  const error = el("p", { class: "notice", role: "status" });
  return el("article", { class: "fb" }, head, text,
    el("h3", null, "Score your own response"),
    el("p", null, "Pick the level that matches what you wrote."),
    levels,
    el("label", { class: "field", for: noteId }, "What is missing?"), note,
    error,
    el("button", { class: "btn", onclick: async () => {
      if (!level) { error.textContent = "Pick a level."; return; }
      try {
        await updateDoc(subDoc(state.sessionId, "responses", response.id), { assessmentState: "degraded", selfLevel: level, selfNote: note.value.trim() || null });
      } catch (e) { error.textContent = "That did not save. Try again."; }
    } }, "Save my score"));
}

function feedbackScreen(game, title) {
  const list = responsesFor(game);
  return el("section", null,
    el("h1", null, title),
    timerLine(),
    list.length ? list.map(feedbackItem) : el("p", null, "You have no written responses in this game."));
}

function gameCompleteScreen(game) {
  const p = state.player;
  const list = responsesFor(game);
  return el("section", null,
    el("h1", null, `Game ${game} is over`),
    el("p", null, "Final balance ", el("span", { class: "money big-num" }, "$" + p.balance)),
    balanceChart(p.balanceHistory || [], p.accentColor),
    el("p", null, `${list.length} of 4 responses submitted.`),
    game === 2 ? list.map(feedbackItem) : null);
}

// ---------- CER lesson follow-along ----------
function cerIndex() { return Math.max(0, Math.min(CER_STEPS.length - 1, (state.session.cerSubStep || 1) - 1)); }

function cerScreen() {
  const i = cerIndex();
  const step = CER_STEPS[i];
  switch (step.kind) {
    case "example": return el("section", null,
      el("h1", null, step.title),
      el("p", { class: "scenario" }, step.scenario),
      el("dl", { class: "cer-parts" }, step.parts.map(([k, v]) => [el("dt", { class: "accent-text" }, k), el("dd", null, v)])));
    case "talk": return el("section", { class: "center-block talk" },
      el("p", { class: "hero-emoji", "aria-hidden": "true" }, "🗣️"),
      el("h1", null, step.title),
      el("p", { class: "lesson-line" }, step.prompt),
      timerLine(),
      el("p", { class: "muted" }, "Talk with your partner. Nothing to type."));
    case "poll": return cerPoll(i, step);
    case "guide": return el("section", null, el("h1", null, step.title), guideBlock());
    default: return el("section", null,
      el("h1", null, step.title),
      step.lines.map(l => el("p", { class: "lesson-line" }, l)));
  }
}

function cerPoll(i, step) {
  const answer = state.quiz[`${uid()}_cer_${i}`];
  const revealed = !!state.session.cerReveal;
  const parts = [
    el("p", { class: "round-label" }, "Everyone answers"),
    el("h1", null, step.title),
    el("p", { class: "scenario" }, step.scenario),
    el("p", { class: "field" }, step.ask)
  ];
  if (revealed) {
    const right = answer && answer.correct;
    if (right && celebrated.poll !== i) { celebrated.poll = i; afterRender.push(() => burst(document.querySelector(".poll-result"), ["✨", "⭐"], { count: 14 })); }
    parts.push(el("div", { class: "options" }, step.options.map((o, k) => el("div", {
      class: "option-static" + (k === step.answer ? " is-answer" : "") + (answer && answer.choice === k ? " is-mine" : "")
    }, k === step.answer ? "✔ " : "", o, answer && answer.choice === k ? "  (your answer)" : ""))));
    parts.push(el("p", { class: "poll-result" }, !answer ? "No answer this time." : right ? `Correct. +${SPARKLE_RIGHT} Sparkle Points.` : `Not this time. ${SPARKLE_WRONG} Sparkle Point.`));
    parts.push(el("p", null, step.why));
    return el("section", null, parts);
  }
  if (answer) {
    parts.push(el("div", { class: "options" }, step.options.map((o, k) => el("div", { class: "option-static" + (answer.choice === k ? " is-mine" : "") }, o))));
    parts.push(el("p", { class: "callout" }, "Answer locked. Wait for your teacher to reveal it."));
    return el("section", null, parts);
  }
  parts.push(el("div", { class: "options" }, step.options.map((o, k) => el("button", { class: "option-btn", onclick: ev => {
    ev.currentTarget.disabled = true;
    saveQuizAnswer(`${uid()}_cer_${i}`, { kind: "cer", slot: "cer", qid: "cer" + i, choice: k, correct: k === step.answer });
  } }, o))));
  return el("section", null, parts);
}

// ---------- Sparkle Points quiz ----------
// Up to three CER analysis questions after each written response, while the class finishes.
function sparkleTotal() {
  const i = state.session && state.session.phase === "cer-lesson" ? cerIndex() : -1;
  const hidden = state.session && !state.session.cerReveal ? `${uid()}_cer_${i}` : null;
  return Object.values(state.quiz).filter(a => a.id !== hidden).reduce((t, a) => t + (a.points || 0), 0);
}

function quizSlotFor(g, r) {
  if (g < 1) return null;
  return state.responses[key(g, r)] ? `${g}_${r}` : null;
}

function seededOrder(list, seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 2246822507) ^ i;
    const j = (h >>> 0) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function saveQuizAnswer(id, a) {
  const points = a.correct ? SPARKLE_RIGHT : SPARKLE_WRONG;
  const rec = { id, uid: uid(), kind: a.kind, slot: a.slot, qid: a.qid, choice: a.choice, correct: a.correct, points, answeredAt: serverTimestamp() };
  state.quiz[id] = rec;          // shown at once, before the save confirms
  state.lastKey = null;
  render();
  try { const { id: _x, ...data } = rec; await setDoc(subDoc(state.sessionId, "quizAnswers", id), data); }
  catch (e) { /* already answered on another tab */ }
}

function quizPanel(slot) {
  const mine = Object.values(state.quiz).filter(a => a.kind === "quiz");
  const inSlot = mine.filter(a => a.slot === slot);
  const show = state.quizShow && state.quizShow.slot === slot ? state.quizShow : null;
  const wrap = (...kids) => el("aside", { class: "quiz", "aria-label": "Sparkle Points challenge" },
    el("p", { class: "quiz-top" }, el("span", null, "✨ Sparkle challenge"), el("span", { class: "mono" }, `${Math.min(inSlot.length + (show ? 0 : 1), QUIZ_PER_WAIT)} of ${QUIZ_PER_WAIT}`)), kids);

  if (show) {
    const q = QUIZ.find(x => x.id === show.qid);
    if (show.correct && celebrated.quiz !== show.qid) { celebrated.quiz = show.qid; afterRender.push(() => burst(document.querySelector(".quiz-result"), ["✨", "⭐", "💎"], { count: 16 })); }
    return wrap(
      el("p", { class: "quiz-result " + (show.correct ? "dir-up" : "dir-down") }, show.correct ? `▲ Correct. +${SPARKLE_RIGHT}` : `▼ Not quite. ${SPARKLE_WRONG}`),
      el("p", null, el("strong", null, "Answer: "), q.options[q.answer]),
      el("p", { class: "muted" }, q.why),
      el("button", { class: "btn", onclick: () => { state.quizShow = null; state.lastKey = null; render(); } },
        inSlot.length >= QUIZ_PER_WAIT ? "Done" : "Next question"));
  }
  if (inSlot.length >= QUIZ_PER_WAIT) return wrap(
    el("p", { class: "quiz-done" }, `✨ ${sparkleTotal()} Sparkle Points`),
    el("p", { class: "muted" }, "That is all three for now. More after your next written answer."));
  const answered = new Set(mine.map(a => a.qid));
  const q = seededOrder(QUIZ, uid()).find(x => !answered.has(x.id));
  if (!q) return wrap(el("p", null, "You answered every question in the bank."));
  return wrap(
    el("p", { class: "quiz-scenario" }, q.scenario),
    el("p", { class: "field" }, q.ask),
    el("div", { class: "options" }, q.options.map((o, k) => el("button", { class: "option-btn", onclick: ev => {
      ev.currentTarget.disabled = true;
      const correct = k === q.answer;
      state.quizShow = { slot, qid: q.id, correct };
      saveQuizAnswer(`${uid()}_q_${q.id}`, { kind: "quiz", slot, qid: q.id, choice: k, correct });
    } }, o))));
}

// ---------- teams ----------
function teamScreen(huddle) {
  const p = state.player;
  const team = p.teamId ? state.teams[p.teamId] : null;
  if (!team) return el("section", { class: "center-block" }, el("h1", null, "Teams are being built"));
  return el("section", null,
    el("p", { class: "hero-emoji", "aria-hidden": "true" }, "🤝"),
    el("h1", null, `${team.table}, seat ${p.seat}`),
    huddle ? el("p", { class: "callout" }, "Defend your Game 1 approach to your table. About 45 seconds each.") : el("p", null, "Find your table and sit down."),
    huddle ? timerLine() : null,
    el("h2", null, "Your table"),
    el("ul", { class: "members" }, team.members.map(m => el("li", null, (m.emoji ? m.emoji + " " : "") + displayName(m), m.uid === p.uid ? " (you)" : ""))));
}

// ---------- the probe and the counterfactual ----------
const probeDraft = { overruled: null, round: null, wouldHaveDone: null, why: "" };
function probeScreen() {
  const pr = state.probe;
  if (pr && pr.submittedAt) return counterfactualScreen(pr);
  const d = probeDraft;
  const error = el("p", { class: "notice", role: "status" });
  const yesNo = el("div", { class: "choices" },
    ["Yes", "No"].map(v => el("button", { class: "choice choice-sm", "aria-pressed": d.overruled === (v === "Yes") ? "true" : "false",
      onclick: () => { d.overruled = v === "Yes"; state.lastKey = null; render(); } }, v)));
  const parts = [el("h1", null, "Answer honestly. Nobody at your table sees this."), el("p", { class: "field" }, PROBE_TEXT.q1), yesNo];
  if (d.overruled) {
    parts.push(el("p", { class: "field" }, PROBE_TEXT.q2));
    parts.push(el("div", { class: "choices" }, [1, 2, 3, 4].map(n => el("button", { class: "choice choice-sm", "aria-pressed": d.round === n ? "true" : "false",
      onclick: () => { d.round = n; state.lastKey = null; render(); } }, "Round " + n))));
    parts.push(el("p", { class: "field" }, PROBE_TEXT.q3));
    parts.push(el("div", { class: "choices" }, ["IN", "OUT"].map(c => el("button", { class: "choice choice-sm", "aria-pressed": d.wouldHaveDone === c ? "true" : "false",
      onclick: () => { d.wouldHaveDone = c; state.lastKey = null; render(); } }, c))));
    const why = el("textarea", { id: "probe-why", maxlength: "600", "aria-label": "Why" });
    why.value = d.why;
    why.addEventListener("input", () => { d.why = why.value; });
    parts.push(el("label", { class: "field", for: "probe-why" }, PROBE_TEXT.q4), why);
  }
  parts.push(error);
  parts.push(el("button", { class: "btn btn-big", onclick: async () => {
    if (d.overruled === null) { error.textContent = "Pick Yes or No."; return; }
    if (d.overruled && (!d.round || !d.wouldHaveDone)) { error.textContent = "Pick the round and what you would have done."; return; }
    const out = { uid: uid(), overruled: d.overruled, round: null, wouldHaveDone: null, why: null, counterfactualValue: null, actualValue: null, submittedAt: serverTimestamp() };
    if (d.overruled) {
      const roll = state.rolls[`2_${d.round}`];
      const actual = state.decisions[key(2, d.round)];
      out.round = d.round; out.wouldHaveDone = d.wouldHaveDone; out.why = d.why.trim() || null;
      if (roll) {
        out.counterfactualValue = valueOfChoice(d.wouldHaveDone, roll);
        out.actualValue = valueOfChoice(actual ? actual.choice : "OUT", roll);
      }
    }
    try { await setDoc(subDoc(state.sessionId, "probes", uid()), out); } catch (e) { error.textContent = "That did not save. Try again."; }
  } }, "Submit"));
  return el("section", null, parts);
}

function counterfactualScreen(pr) {
  if (!pr.overruled) return el("section", { class: "center-block" }, el("h1", null, "Answer recorded"), el("p", null, "Wait for the next round."));
  if (pr.counterfactualValue == null) return el("section", { class: "center-block" }, el("h1", null, "Answer recorded"));
  return el("section", { class: "center-block" },
    el("h1", { class: "counterfactual" }, `You would have gone ${pr.wouldHaveDone} in round ${pr.round}. That was ${signedMoney(pr.counterfactualValue)}.`),
    el("p", { class: "counterfactual-2" }, `Your team's call was ${signedMoney(pr.actualValue)}.`));
}

// ---------- peer scoring ----------
function peerDone() {
  const a = state.peerAssignment;
  if (!a) return [];
  return a.items.filter(it => localGet(`rwm-peer-${state.sessionId}-${it.anonId}`)).map(it => it.anonId);
}

function peerScreen() {
  const a = state.peerAssignment;
  if (!a) return el("section", { class: "center-block" }, el("h1", null, "Peer scoring opens in a moment"));
  if (!a.items.length) return el("section", { class: "center-block" }, el("h1", null, "No responses to score"), el("p", null, "Wait for your teacher."));
  const done = peerDone();
  const item = a.items.find(it => !done.includes(it.anonId));
  if (!item) return el("section", { class: "wait-split" },
    el("div", { class: "wait-head" }, el("p", { class: "stamp", "aria-hidden": "true" }, "✅"), el("h1", null, "Both scores submitted"), el("p", null, "Wait for the class.")),
    quizPanel("peer"));
  const idx = a.items.indexOf(item) + 1;
  let level = null;
  const noteId = "peer-" + item.anonId;
  const note = el("input", { type: "text", id: noteId, maxlength: "240", "aria-label": "One sentence" });
  note.value = (drafts[noteId] && drafts[noteId].text) || "";
  note.addEventListener("input", () => { drafts[noteId] = { text: note.value }; saveDrafts(); });
  const levels = el("div", { class: "level-pick", role: "radiogroup", "aria-label": "Level" },
    SCORING_GUIDE.map(gd => el("button", { class: "level-btn", type: "button", role: "radio", "aria-checked": "false",
      onclick: ev => { level = gd.level; levels.querySelectorAll(".level-btn").forEach(b => b.setAttribute("aria-checked", "false")); ev.currentTarget.setAttribute("aria-checked", "true"); } },
      el("strong", null, "Level " + gd.level), " ", gd.text)));
  const error = el("p", { class: "notice", role: "status" });
  return el("section", null,
    el("p", { class: "round-label" }, `Response ${idx} of ${a.items.length}`),
    timerLine(),
    el("h1", null, "Score this response"),
    el("p", { class: "quote big-quote" }, item.text),
    levels,
    el("label", { class: "field", for: noteId }, "One sentence. Name what is missing or what works."), note,
    error,
    el("button", { class: "btn btn-big", onclick: async () => {
      if (!level) { error.textContent = "Pick a level."; return; }
      if (note.value.trim().length < 3) { error.textContent = "Write one sentence."; return; }
      try {
        await setDoc(subDoc(state.sessionId, "peerReviews", `${uid()}_${item.anonId}`), {
          reviewerUid: uid(), anonId: item.anonId, level, note: note.value.trim(), submittedAt: serverTimestamp()
        });
      } catch (e) { /* already submitted from another device */ }
      localSet(`rwm-peer-${state.sessionId}-${item.anonId}`, "1");
      state.lastKey = null; render();
    } }, "Submit score"));
}

// ---------- bias survey overlay task ----------
function surveyOpen() {
  const s = state.session;
  if (!s || !s.biasSurveyPushId || !state.player) return false;
  if (localGet(`rwm-survey-${state.sessionId}-${s.biasSurveyPushId}`)) return false;
  // never interrupt the impact modal. The survey waits for the round to settle.
  if (["revealed", "compute"].includes(s.roundState) && ["game1", "game2", "learn-to-play"].includes(s.phase)) {
    const m = state.math[key(s.game, s.round)];
    if (!m || !(m.correct || m.revealed)) return false;
  }
  return true;
}

const surveyDraft = { selected: [], strongest: null, sentence: "" };
function biasSurveyScreen() {
  const pushId = state.session.biasSurveyPushId;
  const d = surveyDraft;
  const error = el("p", { class: "notice", role: "status" });
  const list = el("div", { class: "traps" }, MIND_TRAPS.map(t => {
    const id = "trap-" + t.id;
    const box = el("input", { type: "checkbox", id, checked: d.selected.includes(t.id) });
    box.addEventListener("change", () => {
      d.selected = box.checked ? d.selected.concat([t.id]) : d.selected.filter(x => x !== t.id);
      if (!d.selected.includes(d.strongest)) d.strongest = null;
      state.lastKey = null; render();
    });
    return el("div", { class: "trap" }, box,
      el("label", { for: id }, el("strong", null, t.name), el("span", null, ". " + t.def + ". "), el("span", { class: "muted" }, "Example: " + t.example)));
  }));
  const sentence = el("input", { type: "text", id: "survey-sentence", maxlength: "300", "aria-label": "One sentence" });
  sentence.value = d.sentence;
  sentence.addEventListener("input", () => { d.sentence = sentence.value; });
  return el("section", null,
    el("h1", null, "Check any trap you felt today"),
    list,
    d.selected.length ? el("div", null,
      el("p", { class: "field" }, "Which one was strongest?"),
      el("div", { class: "choices wrap" }, d.selected.map(idv => {
        const t = MIND_TRAPS.find(x => x.id === idv);
        return el("button", { class: "choice choice-sm", "aria-pressed": d.strongest === idv ? "true" : "false",
          onclick: () => { d.strongest = idv; state.lastKey = null; render(); } }, t.name);
      })),
      el("label", { class: "field", for: "survey-sentence" }, "One sentence about the strongest one."), sentence) : null,
    error,
    el("button", { class: "btn btn-big", onclick: async () => {
      if (d.selected.length && (!d.strongest || d.sentence.trim().length < 3)) { error.textContent = "Pick the strongest one and write one sentence."; return; }
      try {
        await setDoc(subDoc(state.sessionId, "biasSurveys", `${uid()}_${pushId}`), {
          uid: uid(), pushId, selected: d.selected, strongest: d.strongest, sentence: d.sentence.trim() || null, submittedAt: serverTimestamp()
        });
        localSet(`rwm-survey-${state.sessionId}-${pushId}`, "1");
        surveyDraft.selected = []; surveyDraft.strongest = null; surveyDraft.sentence = "";
        state.lastKey = null; render();
      } catch (e) { error.textContent = "That did not save. Try again."; }
    } }, "Submit"));
}

// ---------- debrief, exit ticket, closure ----------
function debriefScreen() {
  return el("section", null,
    el("h1", null, "Seven mind traps"),
    el("dl", { class: "traps-list" }, MIND_TRAPS.map(t => [el("dt", { class: "accent-text" }, t.name),
      el("dd", null, t.def + ".", el("span", { class: "trap-life" }, "In real life: " + t.life))])));
}

function exitScreen() {
  const id = key(0, 0);
  const existing = state.responses[id];
  if (existing) return el("section", { class: "wait-split" },
    el("div", { class: "wait-head" }, el("h1", null, "Exit ticket submitted"), feedbackItem(existing)),
    quizPanel("exit"));
  const d = drafts[id] || (drafts[id] = { text: "" });
  const ta = el("textarea", { id: "exit-text", maxlength: "1500", "aria-label": "Your answer" });
  ta.value = d.text;
  ta.addEventListener("input", () => { d.text = ta.value; saveDrafts(); });
  const error = el("p", { class: "notice", role: "status" });
  const btn = el("button", { class: "btn btn-big", onclick: async () => {
    if (d.text.trim().length < 3) { error.textContent = "Type your answer."; return; }
    btn.disabled = true;
    const ok = await saveResponse(id, { game: 0, round: 0, kind: "exit", decision: null, text: d.text.trim() });
    if (!ok) { btn.disabled = false; error.textContent = "That did not save. Try again."; }
  } }, "Submit");
  return el("section", null,
    el("h1", null, "Exit ticket"),
    timerLine(),
    el("p", { class: "lesson-line" }, EXIT_PROMPT),
    ta, error, btn);
}

function closureScreen() {
  const id = key(0, 9);
  const existing = state.responses[id];
  const head = [el("p", { class: "objective-big" }, OBJECTIVE)];
  if (existing) return el("section", { class: "center-block" }, head, el("p", { class: "hero-emoji", "aria-hidden": "true" }, "🎉"), el("h1", null, "Answers submitted"),
    el("p", null, `Final Sparkle Points: ✨ ${sparkleTotal()}`));
  const d = drafts[id] || (drafts[id] = { a: "", b: "" });
  const a = el("textarea", { id: "closure-a", maxlength: "600", "aria-label": CLOSURE_QUESTIONS[0] });
  const b = el("textarea", { id: "closure-b", maxlength: "600", "aria-label": CLOSURE_QUESTIONS[1] });
  a.value = d.a; b.value = d.b;
  a.addEventListener("input", () => { d.a = a.value; saveDrafts(); });
  b.addEventListener("input", () => { d.b = b.value; saveDrafts(); });
  const error = el("p", { class: "notice", role: "status" });
  return el("section", null, head,
    el("label", { class: "field", for: "closure-a" }, CLOSURE_QUESTIONS[0]), a,
    el("label", { class: "field", for: "closure-b" }, CLOSURE_QUESTIONS[1]), b,
    error,
    el("button", { class: "btn btn-big", onclick: async () => {
      if (!d.a.trim() && !d.b.trim()) { error.textContent = "Answer at least one question."; return; }
      try {
        await setDoc(subDoc(state.sessionId, "responses", id), {
          uid: uid(), game: 0, round: 9, kind: "closure", decision: null,
          text: `1. ${d.a.trim()}\n2. ${d.b.trim()}`, submittedAt: serverTimestamp(), assessmentState: "none", selfLevel: null, selfNote: null
        });
      } catch (e) { error.textContent = "That did not save. Try again."; }
    } }, "Submit"));
}
