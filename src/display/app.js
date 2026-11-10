// Classroom display. Smartboard, no controls. Signed in with the teacher account on the teacher laptop.
// Press F on this screen for full screen. That key press also turns on the drumroll.
import { watchAuth, signInWithSchoolGoogle, isTeacherUser } from "../firebase.js";
import { watchSession, watchCollection, measureClockOffset, sessionIdFromUrl } from "../session.js";
import { avgMoney, GAMES, isCheckpointRound, isTeamRound, rankPlayers, teamStandings, signedMoney } from "../game.js";
import { el, mount, countdown, bootPage, setDyslexiaFont, reducedMotion, nameNode, rain, burst } from "../shared/ui.js";
import { agendaBlock, vocabBlock, guideBlock } from "../shared/panels.js";
import {
  OBJECTIVE, RULES, RULE_EXAMPLES, CHECKPOINT_PROMPT, GAME2_STEM, EXIT_PROMPT, CLOSURE_QUESTIONS, CER_STEPS, MIND_TRAPS
} from "../shared/content.js";
import { COLORS } from "../shared/tokens.js";
import { startDrumroll, drumHit, unlockSound, soundReady } from "./sound.js";

const root = document.getElementById("app");
const state = {
  session: null, players: {}, decisions: {}, rolls: {}, responses: {}, math: {}, teams: {}, probes: {}, peerReviews: {},
  biasSurveys: {}, peerAssignments: {}, quizAnswers: {}, lastKey: null, localFont: false
};
const seenInLobby = new Set();
let closureCelebrated = false;
let burstDone = null;

bootPage();
// browsers allow sound only after a key press or click on the page
function wakeSound() { const was = soundReady(); unlockSound(); if (!was && soundReady()) render(); }
document.addEventListener("keydown", e => {
  wakeSound();
  if (e.key === "d" || e.key === "D") { state.localFont = !state.localFont; applyFont(); }
  if (e.key === "f" || e.key === "F") document.documentElement.requestFullscreen?.().catch(() => {});
});
document.addEventListener("pointerdown", wakeSound);

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
  for (const name of ["players", "decisions", "rolls", "responses", "mathEntries", "teams", "probes", "peerReviews", "biasSurveys", "peerAssignments", "quizAnswers"]) {
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
const FLOOR_PX = 30;
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
function playersKey() { return Object.values(state.players).map(p => [p.uid, p.balance, p.preferredName, p.lastInitial, p.emoji, p.accentColor, p.teamId].join(":")).sort().join(); }
function decidedKey() {
  const s = state.session;
  return Object.values(state.decisions).filter(d => d.game === s.game && d.round === s.round).map(d => d.uid).sort().join();
}

// ---------- render ----------
const afterRender = [];
function render() {
  const s = state.session;
  if (!s) return;
  const k = screenKey();
  if (k === state.lastKey) return;
  state.lastKey = k;
  mount(root, screen());
  fitToScreen();
  afterRender.splice(0).forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
}

function screenKey() {
  const s = state.session;
  const base = [s.phase, s.game, s.round, s.roundState, s.ruleStep, s.cerSubStep, s.cerReveal, s.spotlightResponseId, s.vocabModeVisible,
    s.teamSeatingVisible, s.leaderboardVisible, s.biasSurveyPushId, s.displayDyslexiaFont, soundReady(), String(s.roundEndsAt && s.roundEndsAt.toMillis && s.roundEndsAt.toMillis())];
  // the dice sequence must never be rebuilt by a counter changing
  if (s.roundState === "rolling" && inRounds()) return JSON.stringify(["rolling", s.game, s.round, !!state.rolls[`${s.game}_${s.round}`]]);
  return JSON.stringify(base.concat([nPlayers(), counterText(), playersKey(), decidedKey(), Object.keys(state.teams).length,
    JSON.stringify(Object.values(state.teams).map(t => t.members.map(m => m.uid))),
    s.spotlightResponseId && state.responses[s.spotlightResponseId] ? 1 : 0, surveyCountsKey(), pollKey()]));
}

function inRounds() {
  const s = state.session;
  return ["learn-to-play", "game1", "game2"].includes(s.phase) && !!s.roundState;
}

function teamRoundNow() {
  const s = state.session;
  return s.phase === "game2" && s.game === 2 && isTeamRound(2, s.round) && Object.keys(state.teams).length > 0;
}

function screen() {
  const s = state.session;
  if (inRounds() && s.roundState === "rolling") return rollScreen();
  if (s.spotlightResponseId && state.responses[s.spotlightResponseId]) return spotlightScreen(state.responses[s.spotlightResponseId]);
  if (s.vocabModeVisible) return light("Vocabulary", el("div", { class: "vocab-display" }, vocabBlock()));
  if (s.teamSeatingVisible && Object.keys(state.teams).length) return seatingScreen();
  if (s.biasSurveyPushId) return light("Check any trap you felt today", el("p", null, "Then write one sentence about the strongest one."), counterLine());
  if (s.leaderboardVisible && (!inRounds() || ["settled", "decide"].includes(s.roundState))) return teamRoundNow() ? teamBoardScreen() : leaderboardScreen();
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
  if (s.phase === "cer-lesson") {
    const i = (s.cerSubStep || 1) - 1;
    if (CER_STEPS[i] && CER_STEPS[i].kind === "poll") return `${pollCounts(i).total} of ${n} answered`;
  }
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

// A grid of who is here, or who has locked in. Still, never animated during a decide round.
function emojiWall(list, { pop = false } = {}) {
  return el("div", { class: "emoji-wall" + (list.length > 16 ? " dense" : "") }, list.map(p => {
    const isNew = pop && !seenInLobby.has(p.uid);
    if (pop) seenInLobby.add(p.uid);
    return el("div", { class: "wall-item" + (isNew && !reducedMotion() ? " pop" : "") }, nameNode(p, true));
  }));
}

function phaseScreen() {
  const s = state.session;
  const base = location.href.split("display")[0];
  switch (s.phase) {
    case "lobby": {
      const list = Object.values(state.players).sort((a, b) => (a.preferredName || "").localeCompare(b.preferredName || ""));
      return el("main", { class: "screen dark center on-dark lobby" },
        el("p", { class: "big-line" }, "Go to " + base.replace(/^https?:\/\//, "").replace(/\/$/, "")),
        el("p", { class: "class-code mono" }, s.classCode),
        el("p", { class: "lobby-count" }, `🎲 ${nPlayers()} joined`),
        emojiWall(list, { pop: true }),
        soundReady() || s.displaySound === false ? null : el("p", { class: "hint-line muted" }, "Press F on this screen for full screen and sound."));
    }
    case "agenda": return el("main", { class: "screen light" },
      el("h1", null, "Agenda"), el("div", { class: "agenda-display" }, agendaBlock(s.phase)));
    case "vocab-warmup": return dark("Vocab Warm Up", el("p", { class: "hero-big", "aria-hidden": "true" }, "🐂  🐻"), el("p", { class: "big-line mono" }, "wayground.com/join"));
    case "learn-to-play":
      if (!s.roundState) {
        const step = Math.max(1, Math.min(RULES.length, s.ruleStep || 1));
        return light("How the game works", el("ol", { class: "rules-display" }, RULES.slice(0, step).map((r, i) => el("li", { class: i === step - 1 ? "rule-new" : "" }, r,
          i === step - 1 ? el("span", { class: "rule-example" }, "Example: " + RULE_EXAMPLES[i]) : null))));
      }
      return roundScreen();
    case "game1":
    case "game2": return s.roundState ? roundScreen() : dark(s.phase === "game1" ? "Game 1" : "Game 2", el("p", { class: "hero-big", "aria-hidden": "true" }, "🎲"));
    case "game1-complete": return dark("Game 1 is over", el("p", { class: "hero-big", "aria-hidden": "true" }, "🏁"), el("p", { class: "big-line" }, "Check your final balance."));
    case "feedback-1": return light("Read your feedback", el("p", null, "Each response has a level and one thing to try next."), timer());
    case "cer-lesson": return cerScreen();
    case "team-assignment": return Object.keys(state.teams).length ? seatingScreen() : dark("Teams are being built");
    case "team-huddle": return light("Defend your Game 1 approach", el("p", null, "About 45 seconds each. Listen to the people who played it differently."), timer());
    case "game2-probe": return light("Answer the probe on your screen", el("p", null, "Nobody at your table sees your answer."), counterLine());
    case "game2-complete": return dark("Game 2 is over", el("p", { class: "hero-big", "aria-hidden": "true" }, "🏁"), el("p", { class: "big-line" }, "Check your final balance."));
    case "peer-scoring": return light("Score two classmates", el("div", { class: "guide-display" }, guideBlock()), el("div", { class: "row-split" }, counterLine(), timer()));
    case "debrief": return debriefScreen();
    case "exit-ticket": return light("Exit ticket", el("p", { class: "lesson-display" }, EXIT_PROMPT), el("div", { class: "row-split" }, counterLine(), timer()));
    case "closure":
      if (!closureCelebrated) { closureCelebrated = true; afterRender.push(() => rain(["🎉", "✨", "🎲", "📈"], { count: 50, ms: 3200 })); }
      return el("main", { class: "screen dark center on-dark" },
        el("h1", { class: "closure-objective" }, OBJECTIVE),
        CLOSURE_QUESTIONS.map(q => el("p", { class: "big-line" }, q)));
  }
  return dark("Roll with the Market");
}

// ---------- CER lesson ----------
function pollCounts(i) {
  const counts = {};
  let total = 0;
  for (const a of Object.values(state.quizAnswers)) if (a.kind === "cer" && a.qid === "cer" + i) { counts[a.choice] = (counts[a.choice] || 0) + 1; total++; }
  return { counts, total };
}
function pollKey() {
  const s = state.session;
  if (s.phase !== "cer-lesson") return "";
  return JSON.stringify(pollCounts((s.cerSubStep || 1) - 1));
}

function cerScreen() {
  const s = state.session;
  const i = Math.max(0, Math.min(CER_STEPS.length - 1, (s.cerSubStep || 1) - 1));
  const step = CER_STEPS[i];
  switch (step.kind) {
    case "example": return light(step.title,
      el("p", { class: "scenario-display" }, step.scenario),
      el("dl", { class: "cer-display" }, step.parts.map(([k, v]) => [el("dt", null, k), el("dd", null, v)])));
    case "talk": return el("main", { class: "screen dark center on-dark" },
      el("p", { class: "hero-big", "aria-hidden": "true" }, "🗣️"),
      el("h1", null, step.title),
      el("p", { class: "talk-prompt" }, step.prompt),
      timer());
    case "poll": {
      const { counts, total } = pollCounts(i);
      const revealed = !!s.cerReveal;
      if (revealed && burstDone !== i) { burstDone = i; afterRender.push(() => burst(document.querySelector(".poll-answer"), ["✨", "⭐"], { count: 18, spread: 260 })); }
      return light(step.title,
        el("p", { class: "scenario-display" }, step.scenario),
        el("p", { class: "poll-ask" }, step.ask),
        el("ol", { class: "poll-options" }, step.options.map((o, k) => el("li", { class: revealed && k === step.answer ? "poll-answer" : "" },
          el("span", null, revealed && k === step.answer ? "✔ " : "", o),
          revealed ? el("span", { class: "mono poll-count" }, String(counts[k] || 0)) : null))),
        revealed ? el("p", { class: "poll-why" }, step.why) : el("p", { class: "counter" }, `Answer on your screen. ${total} of ${nPlayers()} answered.`));
    }
    case "guide": return light(step.title, el("div", { class: "guide-display" }, guideBlock()));
    default: return light(step.title, step.lines.map(l => el("p", { class: "lesson-display" }, l)));
  }
}

function roundScreen() {
  const s = state.session;
  const g = s.game, r = s.round;
  const roll = state.rolls[`${g}_${r}`];
  switch (s.roundState) {
    case "decide": {
      const checkpoint = g > 0 && isCheckpointRound(g, r);
      const decided = Object.values(state.decisions).filter(d => d.game === g && d.round === r).map(d => state.players[d.uid]).filter(Boolean);
      return el("main", { class: "screen light" },
        el("p", { class: "objective-strip" }, OBJECTIVE),
        el("p", { class: "round-display" }, roundLabel()),
        el("h1", null, checkpoint ? CHECKPOINT_PROMPT : "Pick IN or OUT"),
        g === 2 && checkpoint ? el("p", { class: "stem-display" }, GAME2_STEM) : null,
        s.isDoubleRound ? el("p", { class: "callout-display" }, "Double round. IN moves twice the amount. OUT still earns $1.") : null,
        s.isTeamRound ? el("p", { class: "callout-display" }, "Your table decides together.") : null,
        el("div", { class: "row-split" }, counterLine(), timer()),
        decided.length ? el("div", { class: "locked-wall" }, el("p", { class: "wall-label" }, "Locked in"), emojiWall(decided)) : null);
    }
    case "locked": return dark("Decisions locked", el("p", { class: "hero-big", "aria-hidden": "true" }, "🔒"), el("p", { class: "big-line" }, "Eyes on the board."));
    case "revealed":
    case "compute": return el("main", { class: "screen dark center on-dark" },
      roll ? resultBlock(roll) : null,
      el("p", { class: "big-line" }, "Enter your new balance."),
      counterLine());
    case "settled": return el("main", { class: "screen dark center on-dark" },
      el("h1", null, `${roundLabel()} settled`),
      teamRoundNow() ? teamBoardBlock(true) : (roll ? marketObject(g, r, false) : null));
  }
  return dark(roundLabel());
}

function resultBlock(roll) {
  const up = roll.direction === "up";
  return el("div", { class: "result-block" },
    el("p", { class: "direction-big " + (up ? "dir-up" : "dir-down") }, (up ? "🐂 ▲ Up, bull" : "🐻 ▼ Down, bear")),
    roll.doubled
      ? el("p", { class: "amount-big mono" }, `$${roll.amount}`, el("span", { class: "doubled" }, `  doubled $${roll.effectiveAmount}`))
      : el("p", { class: "amount-big mono" }, `$${roll.amount}`));
}

// ---------- the reveal sequence ----------
// About 15 seconds. A title card, the direction die with a drumroll, a held
// pause, then the three amount dice landing one by one, then the market moves.
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
  let wait = 70;
  let stopped = false;
  // the faces flick fast, then slow down before the die lands
  const t0 = performance.now();
  const flick = () => {
    if (stopped) return;
    slot.replaceChildren(dieFace(1 + Math.floor(Math.random() * 6)));
    const k = (performance.now() - t0) / ms;
    wait = 70 + Math.max(0, k - 0.6) * 500;
    setTimeout(flick, wait);
  };
  flick();
  setTimeout(() => {
    stopped = true;
    slot.classList.remove("tumbling");
    slot.classList.add("landed");
    slot.replaceChildren(dieFace(finalValue));
    onDone && onDone();
  }, ms);
}

export const REVEAL = { intro: 1100, dirRoll: 3000, pause: 2600, diceRoll: 2900, stagger: 450 };

function rollScreen() {
  const s = state.session;
  const roll = state.rolls[`${s.game}_${s.round}`];
  const main = el("main", { class: "screen dark center on-dark roll" });
  if (!roll) { main.appendChild(el("h1", null, "Rolling")); return main; }
  const still = reducedMotion();
  const up = roll.direction === "up";

  const title = el("p", { class: "roll-title" + (still ? "" : " title-in") }, roundLabel() + (roll.doubled ? ". Double round." : ""));
  const dirAsk = el("p", { class: "roll-ask" }, "Bull or bear?");
  const dirSlot = el("div", { class: "die-slot die-hero" }, dieFace(1));
  const dirWord = el("p", { class: "direction-big hidden" });
  const dirCol = el("div", { class: "roll-col" }, dirAsk, dirSlot, dirWord);

  const amtAsk = el("p", { class: "roll-ask hidden" }, "How far?");
  const slots = [0, 1, 2].map(() => el("div", { class: "die-slot" }, dieFace(1)));
  const amountRow = el("div", { class: "dice-row hidden" }, slots);
  const amountWord = el("p", { class: "amount-big mono hidden" }, "$0");
  const amtCol = el("div", { class: "roll-col" }, amtAsk, amountRow, amountWord);

  const marketSlot = el("div", { class: "market-slot hidden" });
  main.append(el("div", { class: "stage" }, title, el("div", { class: "roll-cols" }, dirCol, amtCol), marketSlot));

  const R = still ? { intro: 0, dirRoll: 0, pause: 600, diceRoll: 0, stagger: 0 } : REVEAL;
  const tDir = R.intro;
  const tWord = tDir + R.dirRoll + 150;
  const tAmt = tWord + R.pause;

  // 1. the direction die, with the drumroll
  setTimeout(() => {
    dirSlot.classList.add("spotlight");
    const sound = s.displaySound !== false;
    if (sound) startDrumroll(R.dirRoll);
    tumble(dirSlot, roll.directionDie, R.dirRoll, () => { if (sound) drumHit(); });
  }, tDir);
  setTimeout(() => {
    dirSlot.classList.remove("spotlight");
    dirWord.textContent = up ? "🐂 ▲ Up, bull" : "🐻 ▼ Down, bear";
    dirWord.classList.add(up ? "dir-up" : "dir-down");
    dirWord.classList.remove("hidden");
    if (!still) dirWord.classList.add("slam");
    rain(up ? ["🐂", "📈", "💵"] : ["🐻", "📉", "🍯"], { count: 34, ms: 2400 });
  }, tWord);

  // 2. a held pause, then the three amount dice, landing one at a time
  setTimeout(() => {
    amtAsk.classList.remove("hidden");
    amountRow.classList.remove("hidden");
    amountWord.classList.remove("hidden");
    let total = 0;
    slots.forEach((slot, i) => tumble(slot, roll.amountDice[i], R.diceRoll + i * R.stagger, () => {
      total += roll.amountDice[i];
      amountWord.replaceChildren(document.createTextNode(`$${total}`));
      if (!still) { amountWord.classList.remove("bump"); void amountWord.offsetWidth; amountWord.classList.add("bump"); }
      if (i === 2 && roll.doubled) amountWord.appendChild(el("span", { class: "doubled" }, `  doubled $${roll.effectiveAmount}`));
    }));
  }, tAmt);

  // 3. the market moves
  const tMarket = tAmt + R.diceRoll + 2 * R.stagger + (still ? 0 : 900);
  setTimeout(() => {
    marketSlot.replaceChildren(marketObject(s.game, s.round, !still));
    marketSlot.classList.remove("hidden");
  }, tMarket);
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
  const w = 1200, h = 260, pad = 24;
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
    line.setAttribute("stroke-dasharray", "4000");
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

// Every student, ranked by live balance. Columns are added so nobody is cut off.
const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };
function leaderboardScreen() {
  const list = rankPlayers(Object.values(state.players));
  const cols = list.length > 18 ? 3 : list.length > 8 ? 2 : 1;
  return el("main", { class: "screen light" },
    el("h1", { class: "board-title" }, "Portfolio leaderboard"),
    list.length ? el("ol", { class: `board cols-${cols}`, style: { gridTemplateRows: `repeat(${Math.ceil(list.length / cols)}, auto)`, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoFlow: "column" } }, list.map(x => el("li", { class: "board-row" + (x.rank <= 3 ? " top" : "") },
      el("span", { class: "board-rank mono" }, MEDALS[x.rank] || String(x.rank)),
      el("span", { class: "board-name" }, nameNode(x)),
      el("span", { class: "money board-bal" }, "$" + x.balance),
      x.change === null ? el("span", null, "") : el("span", { class: "board-change mono " + (x.change >= 0 ? "dir-up" : "dir-down") }, (x.change >= 0 ? "▲ " : "▼ ") + signedMoney(x.change)))))
      : el("p", null, "Nobody has joined yet."));
}

function teamBoardBlock(onDark) {
  const teams = Object.values(state.teams);
  const standings = teamStandings(teams, uid => (state.players[uid] || {}).balance);
  return el("div", { class: "team-board" + (onDark ? " on-dark" : "") },
    el("p", { class: "team-board-title" }, "Table standings, average portfolio"),
    el("ol", { class: "team-rows" }, standings.map((t, i) => {
      const team = state.teams[t.teamId];
      return el("li", { class: "team-row" + (i === 0 ? " top" : "") },
        el("span", { class: "board-rank mono" }, MEDALS[i + 1] || String(i + 1)),
        el("span", { class: "team-row-name" }, t.table, el("span", { class: "team-emojis", "aria-hidden": "true" }, " " + (team ? team.members.map(m => (state.players[m.uid] || m).emoji || "").join(" ") : ""))),
        el("span", { class: "money board-bal" }, "$" + avgMoney(t.average)));
    })));
}

function teamBoardScreen() {
  return el("main", { class: "screen light" }, el("h1", { class: "board-title" }, "Team leaderboard"), teamBoardBlock(false));
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
      el("dd", null, t.def + ". ", el("span", { class: "trap-life" }, t.life))])));
}
