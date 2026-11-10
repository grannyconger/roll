// Dice, market math, balance rules, archetypes, teams, peer assignment.
// Pure functions. No Firestore here.

export const START_BALANCE = 100;

export const GAMES = {
  0: { rounds: 3, checkpoints: [], doubleRound: null, teamRounds: [] },
  1: { rounds: 6, checkpoints: [1, 3, 5], doubleRound: 5, teamRounds: [] },
  2: { rounds: 8, checkpoints: [1, 4, 7], doubleRound: 7, teamRounds: [1, 2, 3, 4] }
};

// Decide timers, in seconds. Rounds with a written response keep their full time.
export function decideSecondsFor(game, round) {
  const g = GAMES[game]
  if (game === 0) return 30;
  const team = g.teamRounds.includes(round);
  const checkpoint = g.checkpoints.includes(round);
  if (team && checkpoint) return 180;
  if (checkpoint) return 120;
  if (team) return 105;
  return 45;
}

export function isCheckpointRound(game, round) {
  return (GAMES[game]?.checkpoints || []).includes(round);
}

export function isDoubleRound(game, round) {
  return GAMES[game]?.doubleRound === round;
}

export function isTeamRound(game, round) {
  return (GAMES[game]?.teamRounds || []).includes(round);
}

export function isFinalRound(game, round) {
  return GAMES[game]?.rounds === round;
}

function rollDie() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % 6) + 1;
}

export function rollMarket(game, round) {
  const directionDie = rollDie();
  const amountDice = [rollDie(), rollDie(), rollDie()];
  const amount = amountDice[0] + amountDice[1] + amountDice[2];
  const doubled = isDoubleRound(game, round);
  return {
    game, round, directionDie,
    direction: directionDie <= 2 ? "down" : "up",
    amountDice, amount, doubled,
    effectiveAmount: doubled ? amount * 2 : amount
  };
}

// What one choice was worth against one roll.
export function valueOfChoice(choice, roll) {
  if (choice !== "IN") return 1;
  return roll.direction === "up" ? roll.effectiveAmount : -roll.effectiveAmount;
}

export function signedMoney(n) {
  return (n >= 0 ? "+$" : "-$") + Math.abs(n);
}

// Rebuilds one player's balance history for one game from decisions and rolls.
// rollsByRound: { 1: roll, ... } for rounds already rolled.
// decisionsByRound: { 1: "IN", ... }. Missing means OUT.
export function recomputeHistory(player, game, rollsByRound, decisionsByRound) {
  const late = player.lateStart && player.lateStart.game === game ? player.lateStart : null;
  let balance = late ? late.balance : START_BALANCE;
  const startRound = late ? late.round : 1;
  const history = [balance];
  const rounds = Object.keys(rollsByRound).map(Number).sort((a, b) => a - b);
  for (const r of rounds) {
    if (r < startRound) continue;
    balance += valueOfChoice(decisionsByRound[r] || "OUT", rollsByRound[r]);
    history.push(balance);
  }
  return history;
}

// Archetypes, from the six Game 1 decisions. Checked Reactor, Timer, Sideliner, Holder.
export function countSwitches(choices) {
  let n = 0;
  for (let i = 1; i < choices.length; i++) if (choices[i] !== choices[i - 1]) n++;
  return n;
}

export function countSwitchesAfterLoss(choices, rolls) {
  let n = 0;
  for (let i = 0; i < choices.length - 1; i++) {
    const lost = choices[i] === "IN" && rolls[i] && rolls[i].direction === "down";
    if (lost && choices[i + 1] === "OUT") n++;
  }
  return n;
}

export const ARCHETYPES = ["Reactor", "Timer", "Sideliner", "Holder"];

export function classifyByRules(choices, rolls) {
  if (choices.length < 3) return null;
  const inCount = choices.filter(c => c === "IN").length;
  if (countSwitchesAfterLoss(choices, rolls) >= 2) return "Reactor";
  if (countSwitches(choices) >= 3) return "Timer";
  if (choices.filter(c => c === "OUT").length >= 4) return "Sideliner";
  if (inCount >= 5) return "Holder";
  return null;
}

// entries: [{ uid, choices, rolls }]. Returns { uid: archetype }.
export function classifyClass(entries) {
  const result = {};
  const counts = { Reactor: 0, Timer: 0, Sideliner: 0, Holder: 0 };
  const unmatched = [];
  for (const e of entries) {
    const a = classifyByRules(e.choices, e.rolls);
    if (a) { result[e.uid] = a; counts[a]++; } else unmatched.push(e.uid);
  }
  for (const uid of unmatched) {
    const least = ARCHETYPES.slice().sort((a, b) => counts[a] - counts[b])[0];
    result[uid] = least;
    counts[least]++;
  }
  return result;
}

// Team sizes: 4s, with 3s for the remainder. Never 5.
export function teamSizes(n) {
  if (n <= 0) return [];
  if (n <= 5) return n === 5 ? [3, 2] : [n];
  const threes = (4 - (n % 4)) % 4;
  const fours = (n - threes * 3) / 4;
  return Array(fours).fill(4).concat(Array(threes).fill(3));
}

// students: [{ uid, preferredName, archetype, cerLevel }]
export function buildTeams(students) {
  const sizes = teamSizes(students.length);
  const teams = sizes.map((size, i) => ({ teamId: `t${i + 1}`, table: `Table ${i + 1}`, size, members: [] }));
  const counts = {};
  for (const s of students) counts[s.archetype] = (counts[s.archetype] || 0) + 1;
  const mostCommon = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  // rarest archetypes placed first so they spread across teams
  const order = students.slice().sort((a, b) =>
    (counts[a.archetype] - counts[b.archetype]) || (b.cerLevel - a.cerLevel));
  const cerSum = t => t.members.reduce((s, m) => s + m.cerLevel, 0);
  for (const s of order) {
    const open = teams.filter(t => t.members.length < t.size);
    const ideal = open.filter(t =>
      !t.members.some(m => m.archetype === s.archetype) &&
      !(t.size === 3 && s.archetype === mostCommon && counts[mostCommon] > teams.length));
    const pool = ideal.length ? ideal : open;
    pool.sort((a, b) => (cerSum(a) / Math.max(1, a.members.length)) - (cerSum(b) / Math.max(1, b.members.length))
      || a.members.length - b.members.length);
    pool[0].members.push({ ...s });
  }
  teams.forEach(t => t.members.forEach((m, i) => { m.seat = i + 1 }));
  return teams;
}

// Peer assignment: shuffle reviewers, reviewer i gets the responses of i+1 and i+2.
// items: [{ uid, responseId, text }]. Returns [{ reviewerUid, items: [{ anonId, responseId, text }] }].
export function assignPeerReviews(items) {
  const order = items.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const n = order.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const picks = [];
    if (n >= 2) picks.push(order[(i + 1) % n]);
    if (n >= 3) picks.push(order[(i + 2) % n]);
    out.push({
      reviewerUid: order[i].uid,
      items: picks.map((p, k) => ({ anonId: k === 0 ? "A" : "B", responseId: p.responseId, text: p.text }))
    });
  }
  return out;
}

export function averageBalance(balances) {
  if (!balances.length) return START_BALANCE;
  return Math.round(balances.reduce((a, b) => a + b, 0) / balances.length);
}

// Team standings: the average balance of each table, highest first.
// teams: [{ teamId, table, members: [{ uid }] }], balanceOf: uid -> number or undefined
export function teamStandings(teams, balanceOf) {
  return teams.map(t => {
    const vals = t.members.map(m => balanceOf(m.uid)).filter(v => typeof v === "number");
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : START_BALANCE;
    return { teamId: t.teamId, table: t.table, average: Math.round(avg * 10) / 10, size: vals.length };
  }).sort((a, b) => b.average - a.average);
}

// Leaderboard rows from live player records. Ties share a rank.
export function rankPlayers(players) {
  const list = players.slice().sort((a, b) => (b.balance ?? START_BALANCE) - (a.balance ?? START_BALANCE)
    || (a.preferredName || "").localeCompare(b.preferredName || ""));
  let rank = 0, prev = null;
  return list.map((p, i) => {
    const bal = p.balance ?? START_BALANCE;
    if (bal !== prev) { rank = i + 1; prev = bal; }
    const h = p.balanceHistory || [];
    const change = h.length >= 2 ? h[h.length - 1] - h[h.length - 2] : null;
    return { ...p, balance: bal, rank, change };
  });
}

// $118 for a whole number, $115.5 otherwise
export function avgMoney(n) { return Number.isInteger(n) ? String(n) : n.toFixed(1); }
