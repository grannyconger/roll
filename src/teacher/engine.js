// Teacher hub engine. Every write that moves the lesson forward lives here.
// The hub is the only writer of the session document, rolls, teams, and balances.
import {
  db, doc, setDoc, updateDoc, writeBatch, serverTimestamp, Timestamp, collection
} from "../firebase.js";
import { sessionRef, subDoc, serverNow } from "../session.js";
import {
  GAMES, START_BALANCE, rollMarket, decideSecondsFor, isDoubleRound, isTeamRound, recomputeHistory,
  classifyClass, buildTeams, assignPeerReviews, averageBalance, valueOfChoice
} from "../game.js";
import { ASSESSOR_URL } from "../shared/config.js";

export const ROLL_ANIMATION_MS = 9000;

export function endsIn(seconds) {
  return Timestamp.fromMillis(serverNow() + seconds * 1000);
}

function randomCode(len, alphabet) {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, n => alphabet[n % alphabet.length]).join("");
}

export async function createSectionSession(section, teacherUid) {
  const sessionId = `${section.toLowerCase()}-${randomCode(8, "abcdefghjkmnpqrstuvwxyz23456789")}`;
  await setDoc(doc(db, "sessions", sessionId), {
    sessionId, section, teacherUid,
    classCode: randomCode(5, "ABCDEFGHJKLMNPQRSTUVWXYZ"),
    allowAnonymous: false, joinLocked: false, createdAt: serverTimestamp(),
    phase: "lobby", phaseStartedAt: serverTimestamp(), game: 0, round: 0, roundState: null, roundEndsAt: null,
    isDoubleRound: false, isTeamRound: false, cerSubStep: null, ruleStep: 0,
    leaderboardVisible: false, vocabModeVisible: false, teamSeatingVisible: false,
    spotlightResponseId: null, biasSurveyPushId: null, biasSurveyPushCount: 0,
    assessorHealth: "ok", classAverageBalance: START_BALANCE, leaderboard: [], displayDyslexiaFont: false
  });
  return sessionId;
}

export function makeEngine(ctx) {
  // ctx: { sessionId, get: () => state }
  const sid = ctx.sessionId;
  const S = () => ctx.get();
  const setSession = patch => updateDoc(sessionRef(sid), patch);

  function players() { return Object.values(S().players); }

  async function goToPhase(phase, extra = {}) {
    const patch = { phase, phaseStartedAt: serverTimestamp(), roundEndsAt: null, ...extra };
    if (!["game1", "game2", "learn-to-play"].includes(phase)) patch.roundState = null;
    if (phase === "feedback-1") patch.roundEndsAt = endsIn(120);
    if (phase === "cer-lesson") patch.cerSubStep = 1;
    if (phase === "team-huddle") patch.roundEndsAt = endsIn(180);
    if (phase === "exit-ticket") patch.roundEndsAt = endsIn(420);
    if (phase === "peer-scoring") patch.roundEndsAt = endsIn(240);
    if (phase !== "team-assignment" && phase !== "team-huddle") patch.teamSeatingVisible = false;
    await setSession(patch);
  }

  async function startLearnToPlay() {
    await goToPhase("learn-to-play", { ruleStep: 1, game: 0, round: 0, roundState: null });
  }

  async function showNextRule() {
    await setSession({ ruleStep: (S().session.ruleStep || 0) + 1 });
  }

  async function resetBalancesForGame(game) {
    const batch = writeBatch(db);
    for (const p of players()) {
      const patch = { balance: START_BALANCE, balanceHistory: [START_BALANCE], lateStart: null };
      if (game === 2) patch.game1History = p.balanceHistory || [];
      batch.update(subDoc(sid, "players", p.uid), patch);
    }
    await batch.commit();
  }

  async function startRound(game, round, phase) {
    const patch = {
      game, round, roundState: "decide", roundEndsAt: endsIn(decideSecondsFor(game, round)),
      isDoubleRound: isDoubleRound(game, round), isTeamRound: isTeamRound(game, round), spotlightResponseId: null
    };
    if (phase) { patch.phase = phase; patch.phaseStartedAt = serverTimestamp(); }
    await setSession(patch);
  }

  async function startPracticeRounds() {
    await resetBalancesForGame(0);
    await startRound(0, 1);
  }

  async function startGame1() {
    await resetBalancesForGame(1);
    await setSession({ classAverageBalance: START_BALANCE, leaderboard: [], leaderboardVisible: false });
    await startRound(1, 1, "game1");
  }

  async function startGame2() {
    await resetBalancesForGame(2);
    await setSession({ classAverageBalance: START_BALANCE, leaderboard: [], leaderboardVisible: false, teamSeatingVisible: false });
    await startRound(2, 1, "game2");
  }

  async function addThirtySeconds() {
    const s = S().session;
    const base = s.roundEndsAt && s.roundEndsAt.toMillis ? Math.max(s.roundEndsAt.toMillis(), serverNow()) : serverNow();
    await setSession({ roundEndsAt: Timestamp.fromMillis(base + 30000) });
  }

  // Lock first, then fill in defaulted OUT decisions. Once the session reads locked,
  // the rules reject any new student decision, so the fill cannot overwrite one.
  async function lockDecisions() {
    const s = S().session;
    await setSession({ roundState: "locked", roundEndsAt: null });
    const batch = writeBatch(db);
    let n = 0;
    for (const p of players()) {
      const id = `${p.uid}_${s.game}_${s.round}`;
      if (S().decisions[id]) continue;
      batch.set(subDoc(sid, "decisions", id), {
        uid: p.uid, game: s.game, round: s.round, choice: "OUT", defaulted: true,
        decidedAt: serverTimestamp(), wasTeamRound: !!s.isTeamRound
      });
      n++;
    }
    if (n) await batch.commit();
  }

  let revealTimer = null;
  async function rollTheDice() {
    const s = S().session;
    const roll = rollMarket(s.game, s.round);
    await setDoc(subDoc(sid, "rolls", `${s.game}_${s.round}`), { ...roll, rolledAt: serverTimestamp() });
    await setSession({ roundState: "rolling" });
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => revealRoll(), ROLL_ANIMATION_MS);
  }

  async function revealRoll() {
    clearTimeout(revealTimer);
    const s = S().session;
    if (s.roundState !== "rolling") return;
    await setSession({ roundState: "revealed" });
    await setSession({ roundState: "compute" });
  }

  function entryProgress() {
    const s = S().session;
    const needed = players().filter(p => {
      const d = S().decisions[`${p.uid}_${s.game}_${s.round}`];
      return d && !d.defaulted;
    });
    const done = needed.filter(p => {
      const m = S().math[`${p.uid}_${s.game}_${s.round}`];
      return m && (m.correct || m.revealed);
    });
    return { needed: needed.length, done: done.length };
  }

  // Balances are recomputed from decisions and rolls for every player at every settle.
  async function settleRound() {
    const s = S().session;
    const g = s.game;
    const rollsByRound = {};
    for (const r of Object.values(S().rolls)) if (r.game === g && r.round <= s.round) rollsByRound[r.round] = r;
    const batch = writeBatch(db);
    const board = [];
    for (const p of players()) {
      const decisionsByRound = {};
      for (let r = 1; r <= s.round; r++) {
        const d = S().decisions[`${p.uid}_${g}_${r}`];
        if (d) decisionsByRound[r] = d.choice;
      }
      const history = recomputeHistory(p, g, rollsByRound, decisionsByRound);
      const balance = history[history.length - 1];
      batch.update(subDoc(sid, "players", p.uid), { balance, balanceHistory: history });
      board.push({ uid: p.uid, preferredName: p.preferredName, emoji: p.emoji, accentColor: p.accentColor, balance });
    }
    await batch.commit();
    board.sort((a, b) => b.balance - a.balance);
    await setSession({
      roundState: "settled",
      leaderboard: g === 0 ? [] : board,
      classAverageBalance: averageBalance(board.map(b => b.balance))
    });
  }

  async function startNextRound() {
    const s = S().session;
    await startRound(s.game, s.round + 1);
  }

  // Archetypes and teams, from Game 1 decision records. Local, no API call.
  async function buildStrategyTeams() {
    const rolls1 = [];
    for (let r = 1; r <= GAMES[1].rounds; r++) rolls1.push(S().rolls[`1_${r}`] || null);
    const entries = players().map(p => {
      const choices = [], rolls = [];
      for (let r = 1; r <= GAMES[1].rounds; r++) {
        const d = S().decisions[`${p.uid}_1_${r}`];
        if (d) { choices.push(d.choice); rolls.push(rolls1[r - 1]); }
      }
      return { uid: p.uid, choices, rolls };
    });
    const archetypes = classifyClass(entries);
    const students = players().map(p => ({
      uid: p.uid, preferredName: p.preferredName, archetype: archetypes[p.uid], cerLevel: cerLevelFor(p.uid, 1)
    }));
    const teams = buildTeams(students);
    const batch = writeBatch(db);
    for (const t of Object.keys(S().teams)) batch.delete(subDoc(sid, "teams", t));
    for (const t of teams) {
      batch.set(subDoc(sid, "teams", t.teamId), { ...t, createdAt: serverTimestamp() });
      for (const m of t.members) batch.update(subDoc(sid, "players", m.uid), { archetype: m.archetype, teamId: t.teamId, seat: m.seat });
    }
    await batch.commit();
    await goToPhase("team-assignment", { teamSeatingVisible: true, roundEndsAt: endsIn(60) });
  }

  function cerLevelFor(uid, game) {
    const levels = Object.values(S().responses)
      .filter(r => r.uid === uid && r.game === game && (r.kind === "checkpoint" || r.kind === "chosen"))
      .map(r => levelOf(r))
      .filter(Boolean);
    if (!levels.length) return 1;
    return Math.round(levels.reduce((a, b) => a + b, 0) / levels.length);
  }

  function levelOf(response) {
    const f = S().feedback[response.id];
    if (f && (f.teacherLevel || f.level)) return f.teacherLevel || f.level;
    return response.selfLevel || null;
  }

  // Peer scoring: one Game 2 response per student, each reviewed exactly twice.
  async function startPeerScoring() {
    const byStudent = {};
    for (const r of Object.values(S().responses)) {
      if (r.game !== 2 || !(r.kind === "checkpoint" || r.kind === "chosen")) continue;
      const cur = byStudent[r.uid];
      const better = !cur || (r.round === 7) || (cur.round !== 7 && r.round > cur.round);
      if (better) byStudent[r.uid] = r;
    }
    const pool = Object.values(byStudent).map(r => ({ uid: r.uid, responseId: r.id, text: r.text }));
    const assigned = assignPeerReviews(pool);
    const reviewers = new Set(assigned.map(a => a.reviewerUid));
    // students with no Game 2 response still score two
    for (const p of players()) {
      if (reviewers.has(p.uid) || pool.length === 0) continue;
      const shuffled = pool.slice().sort(() => Math.random() - 0.5).slice(0, 2);
      assigned.push({ reviewerUid: p.uid, items: shuffled.map((x, i) => ({ anonId: i ? "B" : "A", responseId: x.responseId, text: x.text })) });
    }
    const batch = writeBatch(db);
    const map = {};
    for (const a of assigned) {
      batch.set(subDoc(sid, "peerAssignments", a.reviewerUid), { uid: a.reviewerUid, items: a.items.map(i => ({ anonId: i.anonId, text: i.text })) });
      for (const i of a.items) map[`${a.reviewerUid}_${i.anonId}`] = i.responseId;
    }
    // the anonId map is teacher-only. It is stored as a feedback document owned by the
    // teacher uid, which no student can read under the deployed rules.
    batch.set(subDoc(sid, "feedback", "peer-map"), { uid: S().user.uid, kind: "peer-map", map });
    await batch.commit();
    await goToPhase("peer-scoring");
  }

  async function pushBiasSurvey() {
    const n = (S().session.biasSurveyPushCount || 0) + 1;
    await setSession({ biasSurveyPushId: `push-${n}`, biasSurveyPushCount: n });
  }

  async function closeBiasSurvey() {
    await setSession({ biasSurveyPushId: null });
  }

  async function overrideScore(response, level) {
    const ref = subDoc(sid, "feedback", response.id);
    if (S().feedback[response.id]) await updateDoc(ref, { teacherLevel: level || null });
    else if (level) await setDoc(ref, {
      responseId: response.id, uid: response.uid, level: null, teacherLevel: level,
      why: "Scored by your teacher.", suggestedEdit: null, spotlightNominee: false, spotlightReason: null,
      model: "teacher", assessedAt: serverTimestamp()
    });
  }

  async function pickNonVolunteer() {
    const list = players();
    if (!list.length) return null;
    const min = Math.min(...list.map(p => p.calledOnCount || 0));
    const pool = list.filter(p => (p.calledOnCount || 0) === min);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    await updateDoc(subDoc(sid, "players", pick.uid), { calledOnCount: (pick.calledOnCount || 0) + 1 });
    return pick;
  }

  // Assessor retry queue: pending responses older than 15 seconds are re-sent.
  const retries = {};
  async function retryPendingAssessments() {
    const now = serverNow();
    for (const r of Object.values(S().responses)) {
      if (r.assessmentState !== "pending" || S().feedback[r.id]) continue;
      if (!["checkpoint", "chosen", "exit"].includes(r.kind)) continue;
      const at = r.submittedAt && r.submittedAt.toMillis ? r.submittedAt.toMillis() : null;
      if (!at || now - at < 15000) continue;
      const rec = retries[r.id] || (retries[r.id] = { n: 0, last: 0 });
      if (rec.n >= 4 || now - rec.last < 15000) continue;
      rec.n++; rec.last = now;
      fetch(ASSESSOR_URL + "/assess", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, responseId: r.id, game: r.game, round: r.round, decision: r.decision,
          text: r.text, isDoubleRound: isDoubleRound(r.game, r.round), isExitTicket: r.kind === "exit" })
      }).catch(() => {});
    }
  }

  // Health light from the last 10 real scoring results. No heartbeat calls.
  function assessorHealth() {
    const now = serverNow();
    const scored = Object.values(S().responses)
      .filter(r => ["checkpoint", "chosen", "exit"].includes(r.kind) && r.submittedAt && r.submittedAt.toMillis)
      .sort((a, b) => b.submittedAt.toMillis() - a.submittedAt.toMillis()).slice(0, 10);
    if (!scored.length) return "ok";
    let late = 0, missing = 0;
    for (const r of scored) {
      const f = S().feedback[r.id];
      const sub = r.submittedAt.toMillis();
      if (f && f.assessedAt && f.assessedAt.toMillis) { if (f.assessedAt.toMillis() - sub > 12000) late++; }
      else if (now - sub > 20000) missing++;
    }
    if (missing >= Math.max(2, scored.length / 2)) return "down";
    if (missing || late >= 3) return "degraded";
    return "ok";
  }

  return {
    goToPhase, startLearnToPlay, showNextRule, startPracticeRounds, startGame1, startGame2, startRound,
    addThirtySeconds, lockDecisions, rollTheDice, revealRoll, entryProgress, settleRound, startNextRound,
    buildStrategyTeams, startPeerScoring, pushBiasSurvey, closeBiasSurvey, overrideScore, pickNonVolunteer,
    retryPendingAssessments, assessorHealth, levelOf, setSession
  };
}
