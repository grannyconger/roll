// Classroom display. Smartboard, no controls. Signed in with the teacher account on the teacher laptop.
import { watchAuth, signInWithSchoolGoogle, isTeacherUser } from "../firebase.js";
import { watchSession, watchCollection, measureClockOffset, sessionIdFromUrl } from "../session.js";
import { GAMES, isCheckpointRound } from "../game.js";
import { el, mount, countdown, bootPage, setDyslexiaFont, reducedMotion, nameNode } from "../shared/ui.js";
import { agendaBlock, vocabBlock, guideBlock } from "../shared/panels.js";
import {
  OBJECTIVE, STANDARD, RULES, CHECKPOINT_PROMPT, GAME2_STEM, EXIT_PROMPT, CLOSURE_QUESTIONS, CER_STEPS, MIND_TRAPS
} from "../shared/content.js";
import { COLORS } from "../shared/tokens.js";

const root = document.getElementById("app");
const state = { session: null, players: {}, decisions: {}, rolls: {}, responses: {}, math: {}, teams: {}, probes: {}, peerReviews: {}, biasSurveys: {}, peerAssignments: {}, lastKey: null, localFont: false };

bootPage();
document.addEventListener("keydown", e => {
  if (e.key === "d" || e.key === "D") { state.localFont = !state.localFont; applyFont(); }
  if (e.key === "f" || e.key === "F") document.documentElement.requestFullscreen?.().catch(() => {});
});

watchAuth(async user => {
  if (!user || !isTeacherUser(user)) {
    mount(root, el("main", { class: "screen dark center" },
      el("h1", null, "Classroom display"),
      el("button", { class: "btn btn-big", onclick: () => signInWithSchoolGoogle() }, "Sign in with the teacher account")));
    return;
  }
  const sid = sessionIdFromUrl();
  if (!sid) { mount(root, el("main", { class: "screen dark center" }, el("h1", null, "Open the display from the teacher hub"))); return; }
  await measureClockOffset();
  const byId = l => Object.fromEntries(l.map(d => [d.id, d]));
  watchSession(sid, s => { state.session = s; applyFont(); render(); });
  for (const name of ["players", "decisions", "rolls", "responses", "mathEntries", "teams", "probes", "peerReviews", "biasSurveys", "peerAssignments"]) {
    watchCollection(sid, name, l => { state[name === "mathEntries" ? "math" : name] = byId(l); render(); });
  }
});

function applyFont() {
  setDyslexiaFont(state.localFont || (state.session && state.session.displayDyslexiaFont));
  requestAnimationFrame(fitToScreen);
}

// Every display screen is one fixed viewport with overflow hidden, so text that
// runs long is clipped silently. OpenDyslexic is wider and taller than the default
// font. After each mount, step the root size down from 48px until the screen fits,
// stopping at a floor that stays readable from the back of the room.
const BASE_PX = 48;
const FLOOR_PX = 36;
function fitToScreen() {
  const html = document.documentElement;
  const screenNode = root.firstElementChild;
  html.style.fontSize = "";
  if (!screenNode) return;
  let px = BASE_PX;
  while (overflows(screenNode) && px > FLOOR_PX) {
    px -= 2;
    html.style.fontSize = px + "px";
  }
}

function overflows(node) {
  return node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1;
}

window.addEventListener("resize", () => requestAnimationFrame(fitToScreen));
if (document.fonts) {
  document.fonts.ready.then(fitToScreen);
  document.fonts.addEventListener("loadingdone", () => requestAnimationFrame(fitToScreen));
}

function count(obj, fn) { return Object.values(obj).filter(fn).length; }
function nPlayers() { return Object.keys(state.players).length; }

// ---------- render ----------
function render() {
  const s = state.session;
  if (!s) return;
  const k = screenKey();
  if (k === state.lastKey) return;
  state.lastKey = k;
  mount(root, screen());
  fitToScreen();
}

function screenKey() {
  const s = state.session;
  const base = [s.phase, s.game, s.round, s.roundState, s.ruleStep, s.cerSubStep, s.spotlightResponseId, s.vocabModeVisible,
    s.teamSeatingVisible, s.leaderboardVisible, s.biasSurveyPushId, s.displayDyslexiaFont, String(s.roundEndsAt && s.roundEndsAt.toMillis && s.roundEndsAt.toMillis())];
  // the dice sequence must never be rebuilt by a counter changing
  if (s.roundState === "rolling" && inRounds()) return JSON.stringify(["rolling", s.game, s.round, !!state.rolls[`${s.game}_${s.round}`]]);
  return JSON.stringify(base.concat([nPlayers(), counterText(), (s.leaderboard || []).map(x => x.uid + x.balance).join(), Object.keys(state.teams).length,
    s.spotlightResponseId && state.responses[s.spotlightResponseId] ? 1 : 0, surveyCountsKey()]));
}

function inRounds() {
  const s = state.session;
  return ["learn-to-play", "game1", "game2"].includes(s.phase) && !!s.roundState;
}

function screen() {
  const s = state.session;
  if (inRounds() && s.roundState === "rolling") return rollScreen();
  if (s.spotlightResponseId && state.responses[s.spotlightResponseId]) return spotlightScreen(state.responses[s.spotlightResponseId]);
  if (s.vocabModeVisible) return light("Vocabulary", el("div", { class: "vocab-display" }, vocabBlock()));
  if (s.teamSeatingVisible && Object.keys(state.teams).length) return seatingScreen();
  if (s.biasSurveyPushId) return light("Check any trap you felt today", el("p", null, "Then write one sentence about the strongest one."), counterLine());
  if (s.leaderboardVisible && (!inRounds() || ["settled", "decide"].includes(s.roundState))) return leaderboardScreen();
  return phaseScreen();
}

function light(title, ...body) {
  return el("main", { class: "screen light" },
    el("p", { class: "objective-strip" }, OBJECTIVE),
    el("h1", null, title), body);
}

function dark(title, ...body) {
  return el("main", { class: "screen dark center on-dark" }, el("h1", null, title), body);
}

function timer() {
  const s = state.session;
  return s.roundEndsAt ? el("p", { class: "display-timer" }, countdown(s.roundEndsAt)) : null;
}

function counterText() {
  const s = state.session;
  const n = nPlayers();
  if (inRounds() && s.roundState === "decide") return `${count(state.decisions, d => d.game === s.game && d.round === s.round)} of ${n} decided`;
  if (inRounds() && ["revealed", "compute"].includes(s.roundState)) return `${count(state.math, m => m.game === s.game && m.round === s.round && (m.correct || m.revealed))} of ${n} balances entered`;
  if (s.biasSurveyPushId) return `${count(state.biasSurveys, b => b.pushId === s.biasSurveyPushId)} of ${n} submitted`;
  if (s.phase === "game2-probe") return `${count(state.probes, () => true)} of ${n} answered`;
  if (s.phase === "exit-ticket") return `${count(state.responses, r => r.kind === "exit")} of ${n} submitted`;
  if (s.phase === "closure") return `${count(state.responses, r => r.kind === "closure")} of ${n} submitted`;
  if (s.phase === "peer-scoring") {
    const expected = Object.values(state.peerAssignments).reduce((a, p) => a + (p.items || []).length, 0);
    return `${count(state.peerReviews, () => true)} of ${expected} scores submitted`;
  }
  return "";
}

function counterLine() {
  const t = counterText();
  return t ? el("p", { class: "counter" }, t) : null;
}

function roundLabel() {
  const s = state.session;
  return (s.game === 0 ? "Practice round " : `Game ${s.game}, round `) + `${s.round} of ${GAMES[s.game].rounds}`;
}

function phaseScreen() {
  const s = state.session;
  const base = location.href.split("display")[0];
  switch (s.phase) {
    case "lobby": return el("main", { class: "screen dark center on-dark" },
      el("h1", null, "Sign in at " + base.replace(/^https?:\/\//, "").replace(/\/$/, "")),
      el("p", { class: "big-line" }, "Class code"),
      el("p", { class: "class-code mono" }, s.classCode),
      el("p", null, `${nPlayers()} joined`));
    case "agenda": return el("main", { class: "screen light" },
      el("h1", null, "Agenda"), el("div", { class: "agenda-display" }, agendaBlock(s.phase)));
    case "vocab-warmup": return dark("Vocab Warm Up", el("p", { class: "big-line mono" }, "wayground.com/join"));
    case "learn-to-play":
      if (!s.roundState) {
        const step = Math.max(1, Math.min(RULES.length, s.ruleStep || 1));
        return light("How the game works", el("ol", { class: "rules-display" }, RULES.slice(0, step).map((r, i) => el("li", { class: i === step - 1 ? "rule-new" : "" }, r))));
      }
      return roundScreen();
    case "game1":
    case "game2": return s.roundState ? roundScreen() : dark(s.phase === "game1" ? "Game 1" : "Game 2");
    case "game1-complete": return dark("Game 1 is over", el("p", { class: "big-line" }, "Check your final balance."));
    case "feedback-1": return light("Read your feedback", timer());
    case "cer-lesson": {
      const i = Math.max(0, Math.min(CER_STEPS.length - 1, (s.cerSubStep || 1) - 1));
      const step = CER_STEPS[i];
      return light(step.title, step.lines.map(l => el("p", { class: "lesson-display" }, l)), i === CER_STEPS.length - 1 ? el("div", { class: "guide-display" }, guideBlock()) : null);
    }
    case "team-assignment": return Object.keys(state.teams).length ? seatingScreen() : dark("Teams are being built");
    case "team-huddle": return light("Defend your Game 1 approach", el("p", null, "About 45 seconds each. Listen to the people who played it differently."), timer());
    case "game2-probe": return light("Answer the probe on your screen", el("p", null, "Nobody at your table sees your answer."), counterLine());
    case "game2-complete": return dark("Game 2 is over", el("p", { class: "big-line" }, "Check your final balance."));
    case "peer-scoring": return light("Score two classmates", el("div", { class: "guide-display" }, guideBlock()), counterLine(), timer());
    case "debrief": return debriefScreen();
    case "exit-ticket": return light("Exit ticket", el("p", { class: "lesson-display" }, EXIT_PROMPT), el("div", { class: "row-split" }, counterLine(), timer()));
    case "closure": return el("main", { class: "screen dark center on-dark" },
      el("h1", { class: "closure-objective" }, OBJECTIVE),
      CLOSURE_QUESTIONS.map(q => el("p", { class: "big-line" }, q)));
  }
  return dark("Roll with the Market");
}

function roundScreen() {
  const s = state.session;
  const g = s.game, r = s.round;
  const roll = state.rolls[`${g}_${r}`];
  switch (s.roundState) {
    case "decide": {
      const checkpoint = g > 0 && isCheckpointRound(g, r);
      return el("main", { class: "screen light" },
        el("p", { class: "objective-strip" }, OBJECTIVE),
        el("p", { class: "round-display" }, roundLabel()),
        el("h1", null, checkpoint ? CHECKPOINT_PROMPT : "Pick IN or OUT"),
        g === 2 && checkpoint ? el("p", { class: "stem-display" }, GAME2_STEM) : null,
        s.isDoubleRound ? el("p", { class: "callout-display" }, "Double round. IN moves twice the amount. OUT still earns $1.") : null,
        s.isTeamRound ? el("p", { class: "callout-display" }, "Your table decides together.") : null,
        el("div", { class: "row-split" }, counterLine(), timer()));
    }
    case "locked": return dark("Decisions locked", el("p", { class: "big-line" }, "Eyes on the board."));
    case "revealed":
    case "compute": return el("main", { class: "screen dark center on-dark" },
      roll ? resultBlock(roll) : null,
      el("p", { class: "big-line" }, "Enter your new balance."),
      counterLine());
    case "settled": return el("main", { class: "screen dark center on-dark" },
      el("h1", null, `${roundLabel()} settled`),
      roll ? marketObject(g, r, false) : null);
  }
  return dark(roundLabel());
}

function resultBlock(roll) {
  const up = roll.direction === "up";
  return el("div", { class: "result-block" },
    el("p", { class: "direction-big " + (up ? "dir-up" : "dir-down") }, (up ? "▲ Up, bull" : "▼ Down, bear")),
    roll.doubled
      ? el("p", { class: "amount-big mono" }, `$${roll.amount}`, el("span", { class: "doubled" }, `  doubled $${roll.effectiveAmount}`))
      : el("p", { class: "amount-big mono" }, `$${roll.amount}`));
}

// ---------- the reveal sequence ----------
function dieFace(value) {
  const pips = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] }[value];
  const die = el("div", { class: "die", "aria-hidden": "true" });
  for (let i = 1; i <= 9; i++) die.appendChild(el("span", { class: pips.includes(i) ? "pip" : "pip off" }));
  return die;
}

function tumble(slot, finalValue, ms, onDone) {
  const still = reducedMotion();
  if (still) { slot.replaceChildren(dieFace(finalValue)); onDone && onDone(); return; }
  slot.classList.add("tumbling");
  const iv = setInterval(() => slot.replaceChildren(dieFace(1 + Math.floor(Math.random() * 6))), 85);
  setTimeout(() => {
    clearInterval(iv);
    slot.classList.remove("tumbling");
    slot.classList.add("landed");
    slot.replaceChildren(dieFace(finalValue));
    onDone && onDone();
  }, ms);
}

function rollScreen() {
  const s = state.session;
  const roll = state.rolls[`${s.game}_${s.round}`];
  const main = el("main", { class: "screen dark center on-dark roll" });
  if (!roll) { main.appendChild(el("h1", null, "Rolling")); return main; }
  const still = reducedMotion();
  const stage = el("div", { class: "stage" });
  const dirSlot = el("div", { class: "die-slot" });
  const dirWord = el("p", { class: "direction-big hidden" });
  const amountRow = el("div", { class: "dice-row hidden" }, [0, 1, 2].map(() => el("div", { class: "die-slot" })));
  const amountWord = el("p", { class: "amount-big mono hidden" });
  const marketSlot = el("div", { class: "market-slot hidden" });
  stage.append(el("p", { class: "round-display" }, roundLabel()), dirSlot, dirWord, amountRow, amountWord, marketSlot);
  main.appendChild(stage);
  const up = roll.direction === "up";
  const T = still ? { d: 0, w: 600, a: 1600, m: 3200 } : { d: 1500, w: 1700, a: 3300, m: 5600 };
  tumble(dirSlot, roll.directionDie, T.d);
  setTimeout(() => {
    dirWord.textContent = up ? "▲ Up, bull" : "▼ Down, bear";
    dirWord.classList.add(up ? "dir-up" : "dir-down");
    dirWord.classList.remove("hidden");
  }, T.w);
  setTimeout(() => {
    amountRow.classList.remove("hidden");
    [...amountRow.children].forEach((slot, i) => tumble(slot, roll.amountDice[i], still ? 0 : 1400 + i * 250));
  }, T.a - (still ? 0 : 1600));
  setTimeout(() => {
    amountWord.replaceChildren(document.createTextNode(`$${roll.amount}`));
    if (roll.doubled) amountWord.appendChild(el("span", { class: "doubled" }, `  doubled $${roll.effectiveAmount}`));
    amountWord.classList.remove("hidden");
  }, T.a + (still ? 0 : 400));
  setTimeout(() => {
    marketSlot.replaceChildren(marketObject(s.game, s.round, !still));
    marketSlot.classList.remove("hidden");
  }, T.m);
  return main;
}

// The shared market object. One line, the whole room watches it move.
function marketObject(game, round, animate) {
  const pts = [100];
  for (let r = 1; r <= round; r++) {
    const roll = state.rolls[`${game}_${r}`];
    if (!roll) continue;
    pts.push(pts[pts.length - 1] + (roll.direction === "up" ? roll.amount : -roll.amount));
  }
  const w = 1200, h = 300, pad = 24;
  const min = Math.min(...pts) - 10, max = Math.max(...pts) + 10;
  const total = Math.max(GAMES[game].rounds, pts.length - 1);
  const x = i => pad + i * (w - pad * 2) / total;
  const y = v => h - pad - (v - min) * (h - pad * 2) / Math.max(1, max - min);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("class", "market");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Market level by round: " + pts.join(", "));
  const line = document.createElementNS(ns, "polyline");
  line.setAttribute("points", pts.map((v, i) => `${x(i)},${y(v)}`).join(" "));
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", COLORS.darkText);
  line.setAttribute("stroke-width", "6");
  line.setAttribute("stroke-linejoin", "round");
  line.setAttribute("stroke-linecap", "round");
  if (animate) {
    const len = 4000;
    line.setAttribute("stroke-dasharray", String(len));
    line.setAttribute("class", "market-draw");
  }
  svg.appendChild(line);
  const last = pts[pts.length - 1];
  const dot = document.createElementNS(ns, "circle");
  dot.setAttribute("cx", x(pts.length - 1));
  dot.setAttribute("cy", y(last));
  dot.setAttribute("r", "14");
  const lastRoll = state.rolls[`${game}_${round}`];
  dot.setAttribute("fill", lastRoll && lastRoll.direction === "down" ? COLORS.downOnDark : COLORS.upOnDark);
  svg.appendChild(dot);
  return el("div", { class: "market-wrap" }, svg, el("p", { class: "market-level mono" }, "Market " + last));
}

// ---------- overlays ----------
function spotlightScreen(r) {
  return el("main", { class: "screen light" },
    el("p", { class: "objective-strip" }, OBJECTIVE),
    el("h1", null, r.decision ? `A classmate who went ${r.decision}` : "A classmate's answer"),
    el("p", { class: "spotlight-text" }, r.text));
}

function seatingScreen() {
  const teams = Object.values(state.teams).sort((a, b) => a.teamId.localeCompare(b.teamId, undefined, { numeric: true }));
  return el("main", { class: "screen light seating" },
    el("h1", null, "Find your table"),
    el("div", { class: "seating-grid" }, teams.map(t => el("div", { class: "team" },
      el("h2", null, t.table),
      el("ul", null, t.members.map(m => el("li", null, nameNode(state.players[m.uid] || m))))))),
    timer());
}

function leaderboardScreen() {
  const list = (state.session.leaderboard || []).slice(0, 10);
  return el("main", { class: "screen light" },
    el("h1", null, "Portfolio leaderboard"),
    el("ol", { class: "board" }, list.map(x => el("li", null, nameNode(x), el("span", { class: "money" }, "$" + x.balance)))));
}

function surveyCounts() {
  const counts = {};
  const pushes = [...new Set(Object.values(state.biasSurveys).map(b => b.pushId))].sort();
  const latest = pushes[pushes.length - 1];
  for (const b of Object.values(state.biasSurveys)) if (b.pushId === latest) for (const id of b.selected || []) counts[id] = (counts[id] || 0) + 1;
  return counts;
}
function surveyCountsKey() { return JSON.stringify(surveyCounts()); }

function debriefScreen() {
  const counts = surveyCounts();
  const any = Object.keys(counts).length > 0;
  return el("main", { class: "screen light" },
    el("h1", null, "Seven mind traps"),
    el("dl", { class: "traps-display" }, MIND_TRAPS.map(t => [
      el("dt", null, t.name, any ? el("span", { class: "trap-count mono" }, `  ${counts[t.id] || 0} felt it`) : null),
      el("dd", null, t.def)])));
}
