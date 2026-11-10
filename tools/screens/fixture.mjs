// A fake class of 24 for the screenshot harness. Names, text lengths, and
// balances are picked to stress layouts: the longest allowed name, long
// responses, and the full leaderboard. The signed-in student is u1.
export const SID = "S1";
const P = `sessions/${SID}`;

const NAMES = [
  "Maximiliano", "Mary-Elizabeth Anne", "Bo", "Christopher", "Jacqueline", "Ty", "Guadalupe", "Anastasia",
  "Bartholomew", "Destiny", "Kwame", "Alexandria", "Li", "Santiago", "Priyanka", "Jo",
  "Nathaniel", "Esperanza", "Malik", "Genevieve", "Oluwaseun", "Ava", "Leonardo", "Wren"
];
const EMOJIS = ["🦉", "🐢", "🦊", "🐙", "🐝", "🦋", "🐳", "🐧", "🌵", "🌻", "🍄", "🌙", "⭐", "⚡", "❄️", "🌈", "🍋", "🍉", "🥨", "🎲", "🔷", "🔶", "🎈", "🪁"];
const ACCENTS = ["slate", "teal", "amber", "rose", "violet", "sage", "sky", "sand"];
const ARCH = ["Reactor", "Timer", "Sideliner", "Holder"];

// Fixed rolls so every run draws the same screens.
const ROLLS = {
  0: [[4, [3, 5, 2]], [1, [6, 4, 5]], [5, [2, 2, 6]]],
  1: [[3, [4, 4, 3]], [2, [5, 6, 4]], [6, [1, 3, 5]], [4, [6, 6, 2]], [1, [3, 4, 5]], [5, [2, 5, 6]]],
  2: [[5, [3, 3, 4]], [2, [6, 5, 5]], [4, [2, 1, 6]], [6, [4, 5, 3]], [3, [5, 2, 2]], [1, [4, 4, 6]], [4, [6, 5, 6]], [2, [1, 2, 3]]]
};
const DOUBLE = { 0: null, 1: 5, 2: 7 };

export const TEXT = {
  short: "I went IN because the market went up last round.",
  mid: "I chose IN because four of the six faces on the direction die are bull, so the market goes up more often than it goes down. That supports my choice because over many rounds IN should beat the $1 from OUT.",
  long: "I chose IN because the direction die is bull on 3, 4, 5, and 6, which is four out of six faces, and three dice average about 10.5. That means IN averages about plus $3.50 a round while OUT is a certain plus $1. This supports my choice because a single bad round can hurt, but over six rounds the odds are on my side. I passed on OUT because $1 is safe but small, and I am at $112 so one loss of $15 would not sink me. On a double round the gap is even bigger, about plus $7 for IN.",
  spotlight: "I stayed OUT in round 3 even though everyone at my table went IN. My claim is that OUT was the better call for me right then. My evidence is that I had already lost $16 in round 2 and I was down to $88, which was the lowest balance at the table. My reasoning is that a second big loss would have put me so far behind that I would start taking bigger risks to catch up, which is one of the mind traps. I know IN averages about $3.50 a round and OUT is only $1, so on average IN is better. But averages only work over many rounds, and I only had four rounds left. I passed on IN because protecting what I had mattered more to me than chasing the average. If I had more rounds left I would have gone IN, because then the odds would have time to work."
};

function rollDoc(game, round) {
  const [dd, dice] = ROLLS[game][round - 1];
  const amount = dice.reduce((a, b) => a + b, 0);
  const doubled = DOUBLE[game] === round;
  return { game, round, directionDie: dd, direction: dd <= 2 ? "down" : "up", amountDice: dice, amount, doubled, effectiveAmount: doubled ? amount * 2 : amount, rolledAt: { __ts: -30 } };
}

function value(choice, roll) {
  if (choice === "OUT") return 1;
  return (roll.direction === "up" ? 1 : -1) * roll.effectiveAmount;
}

// u1's decisions in every round.
const U1_CHOICES = { 0: ["IN", "IN", "OUT"], 1: ["IN", "IN", "OUT", "IN", "IN", "OUT"], 2: ["IN", "IN", "OUT", "IN", "IN", "OUT", "IN", "IN"] };

// History of u1's balance up to and including round `upTo` of `game`.
export function historyFor(game, upTo) {
  if (game === 0) return [100];
  const h = [100];
  for (let r = 1; r <= upTo; r++) h.push(h[h.length - 1] + value(U1_CHOICES[game][r - 1], rollDoc(game, r)));
  return h;
}

export function baseDocs({ dys = false } = {}) {
  const docs = {};
  docs[P] = {
    section: "2B", classCode: "MKT42", teacherUid: "teacher", createdAt: { __ts: -3600 }, phase: "lobby", phaseStartedAt: { __ts: -95 },
    game: 0, round: 0, roundState: null, roundEndsAt: null, ruleStep: 1, cerSubStep: 1,
    spotlightResponseId: null, vocabModeVisible: false, teamSeatingVisible: false, leaderboardVisible: false, leaderboard: [],
    biasSurveyPushId: null, biasSurveyPushCount: 0, displayDyslexiaFont: dys, joinLocked: false, allowAnonymous: true,
    classAverageBalance: 104, assessorUrl: null, isDoubleRound: false, isTeamRound: false, assessorHealth: "ok"
  };

  const board = [];
  NAMES.forEach((name, i) => {
    const uid = "u" + (i + 1);
    const balance = 130 - i * 3 + (i % 3) * 2;
    const teamNo = Math.floor(i / 4) + 1;
    docs[`${P}/players/${uid}`] = {
      uid, preferredName: name, lastInitial: "MRTWJBSKLDPC"[i % 12], emoji: EMOJIS[i], accentColor: ACCENTS[i % 8], joinedAt: { __ts: -3000 }, joinedLate: i === 23,
      balance, balanceHistory: [100, balance], lateStart: null, archetype: ARCH[i % 4], teamId: "t" + teamNo, seat: (i % 4) + 1,
      calledOnCount: 0, dyslexiaFont: uid === "u1" ? dys : false
    };
    docs[`${P}/roster/${uid}`] = { uid, email: `${name.split(" ")[0].toLowerCase()}@greermiddlecollege.org`, accountName: name + " Student" };
    board.push({ uid, preferredName: name, lastInitial: "MRTWJBSKLDPC"[i % 12], emoji: EMOJIS[i], accentColor: ACCENTS[i % 8], balance });
  });
  board.sort((a, b) => b.balance - a.balance);
  board.forEach((b, i) => { b.rank = i + 1; });
  docs[P].leaderboard = board;
  docs[P].teamBoard = [1, 2, 3, 4, 5, 6].map(t => ({ teamId: "t" + t, table: "Table " + t, average: 124.5 - t * 3.25, size: 4 }));

  for (let t = 1; t <= 6; t++) {
    const members = [0, 1, 2, 3].map(k => {
      const i = (t - 1) * 4 + k;
      return { uid: "u" + (i + 1), preferredName: NAMES[i], lastInitial: "MRTWJBSKLDPC"[i % 12], emoji: EMOJIS[i], archetype: ARCH[i % 4], cerLevel: 1 + (i % 4), seat: k + 1 };
    });
    docs[`${P}/teams/t${t}`] = { teamId: "t" + t, table: "Table " + t, members, size: 4, createdAt: { __ts: -900 } };
  }

  for (const g of [0, 1, 2]) for (let r = 1; r <= ROLLS[g].length; r++) docs[`${P}/rolls/${g}_${r}`] = rollDoc(g, r);

  return docs;
}

// Add u1's past decisions, responses, feedback, and math through a point in the lesson.
export function addHistory(docs, game, throughRound) {
  const games = game === 2 ? [1, 2] : [game];
  for (const g of games) {
    const last = g === game ? throughRound : ROLLS[g].length;
    for (let r = 1; r <= last; r++) {
      const id = `u1_${g}_${r}`;
      const choice = U1_CHOICES[g][r - 1];
      docs[`${P}/decisions/${id}`] = { uid: "u1", game: g, round: r, choice, decidedAt: { __ts: -600 }, wasTeamRound: g === 2 && r <= 4 };
      const h = historyFor(g, r);
      docs[`${P}/mathEntries/${id}`] = { uid: "u1", game: g, round: r, expected: h[r], attempts: [h[r]], correct: true, usedHint: false, revealed: false, settledAt: { __ts: -500 } };
    }
  }
  const writing = { 1: { 1: "checkpoint", 2: "chosen", 3: "checkpoint", 5: "checkpoint" }, 2: { 1: "checkpoint", 4: "checkpoint", 6: "chosen", 7: "checkpoint" } };
  const texts = [TEXT.short, TEXT.mid, TEXT.long, TEXT.mid];
  for (const g of games) {
    const last = g === game ? throughRound : ROLLS[g].length;
    Object.entries(writing[g]).forEach(([r, kind], i) => {
      r = Number(r);
      if (r > last) return;
      const id = `u1_${g}_${r}`;
      addResponse(docs, id, { uid: "u1", game: g, round: r, kind, decision: U1_CHOICES[g][r - 1], text: texts[i] }, 1 + ((i + g) % 4));
    });
  }
  const h = historyFor(game, throughRound);
  docs[`${P}/players/u1`] = { ...docs[`${P}/players/u1`], balance: h[h.length - 1], balanceHistory: h };
}

export function addResponse(docs, id, r, level) {
  docs[`${P}/responses/${id}`] = { ...r, submittedAt: { __ts: -400 }, assessmentState: level ? "done" : "pending", selfLevel: null, selfNote: null };
  if (level) {
    docs[`${P}/feedback/${id}`] = {
      responseId: id, uid: r.uid, level, teacherLevel: null,
      why: level >= 3
        ? "You made a clear claim and backed it with a real fact from the game, the four bull faces out of six. Your reasoning connects that fact to your choice."
        : "You gave a reason, but it is about how the last round felt. A fact from the game, such as how many faces on the die are bull, would make this stronger.",
      suggestedEdit: level >= 3 ? "Try: name the choice you did not make and why you passed on it." : "Try: add one number from the game, like the 4 of 6 bull faces.",
      spotlightNominee: level === 4, spotlightReason: level === 4 ? "Weighs OUT against the odds." : null, model: "fixture", assessedAt: { __ts: -380 }
    };
  }
}

// Classmates' work, for counters, the observer, and the display.
export function addClassWork(docs, game) {
  for (let i = 2; i <= 24; i++) {
    const uid = "u" + i;
    for (const r of game === 2 ? [1, 4] : [1, 3]) {
      const id = `${uid}_${game}_${r}`;
      addResponse(docs, id, { uid, game, round: r, kind: "checkpoint", decision: i % 3 ? "IN" : "OUT", text: i === 5 && r === 1 ? TEXT.spotlight : TEXT.mid }, 1 + (i % 4));
    }
  }
}

export function addSurveys(docs, pushId, n = 20) {
  const traps = ["loss-aversion", "recency", "expert", "overconfidence", "regret", "risk-taking", "herding"];
  for (let i = 2; i < 2 + n; i++) {
    docs[`${P}/biasSurveys/u${i}_${pushId}`] = {
      uid: "u" + i, pushId, selected: [traps[i % 7], "herding"], strongest: "herding", sentence: "My table went IN and I wanted OUT.", submittedAt: { __ts: -200 }
    };
  }
}

export const path = {
  session: P,
  doc: (name, id) => `${P}/${name}/${id}`
};
