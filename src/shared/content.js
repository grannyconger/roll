// All lesson copy lives here. Direct and utilitarian. No em-dashes, no semicolons.

export const OBJECTIVE = "I can justify a conclusion using a claim, evidence, and reasoning.";
export const STANDARD = "SC Personal Finance 5141, Standard A: The student will analyze how human behaviors impact financial decisions.";
export const WAYGROUND_URL = "https://wayground.com/join";

// The agenda. Each item lists the phases it covers, so the current item can be marked.
export const AGENDA = [
  { label: "Vocab Warm Up", phases: ["lobby", "agenda", "vocab-warmup"], link: WAYGROUND_URL },
  { label: "Learn to Play", phases: ["learn-to-play"] },
  { label: "Game 1", phases: ["game1", "game1-complete"] },
  { label: "Feedback", phases: ["feedback-1"] },
  { label: "Claim, Evidence, Reasoning", phases: ["cer-lesson"] },
  { label: "Strategy Teams", phases: ["team-assignment", "team-huddle"] },
  { label: "Game 2", phases: ["game2", "game2-probe", "game2-complete"] },
  { label: "Peer Scoring", phases: ["peer-scoring"] },
  { label: "Mind Traps", phases: ["debrief"] },
  { label: "Exit Ticket", phases: ["exit-ticket"] },
  { label: "Closure", phases: ["closure"] }
];

export const EMOJIS = [
  "🦉", "🐢", "🦊", "🐙", "🐝", "🦋", "🐳", "🐧",
  "🌵", "🌻", "🍄", "🌙", "⭐", "⚡", "❄️", "🌈",
  "🍋", "🍉", "🥨", "🎲", "🔷", "🔶", "🎈", "🪁"
];

export const SCORING_GUIDE = [
  { level: 4, text: "Claim, evidence, and reasoning, plus the choice you did not make and why you passed on it" },
  { level: 3, text: "Claim, specific evidence from the game, and reasoning that connects them" },
  { level: 2, text: "A reason is given, but no fact from the game" },
  { level: 1, text: "Only a choice or a feeling" }
];

export const MARKET_TERMS = [
  ["Invest", "Put money into something now, hoping it grows later"],
  ["Stock market", "Where people buy and sell small pieces of companies"],
  ["Portfolio", "Everything you own in the market"],
  ["Bull market", "Prices are rising"],
  ["Bear market", "Prices are falling"],
  ["Buy", "Put money into the market"],
  ["Sell", "Take money out of the market"],
  ["Hold", "Keep your money where it is"],
  ["Risk", "The chance you lose some or all of your money"],
  ["Expected value", "The average result if you repeat a choice many times"]
];

export const REASONING_TERMS = [
  ["Justify", "Give good reasons for your choice"],
  ["Claim", "Your decision in one sentence"],
  ["Evidence", "A fact from the game that supports your claim"],
  ["Reasoning", "Explains why your evidence supports your claim"]
];

export const MIND_TRAPS = [
  { id: "loss-aversion", name: "Loss aversion", def: "Losses hurt more than equal wins feel good", example: "Going OUT for the rest of the game after one big drop." },
  { id: "recency", name: "Recency effect", def: "Thinking a streak will keep going", example: "Going IN because the last two rolls were up." },
  { id: "expert", name: "Expert opinion", def: "Trusting advice too much", example: "Copying the top player on the leaderboard." },
  { id: "overconfidence", name: "Overconfidence", def: "Jumping in and out to time the market", example: "Switching every round to guess the next roll." },
  { id: "regret", name: "Regret", def: "Feeling bad you were OUT when the market rose", example: "Going IN next round because you missed a big gain." },
  { id: "risk-taking", name: "Excessive risk-taking", def: "Taking bigger risks to catch up", example: "Going IN on the double round because you are behind." },
  { id: "herding", name: "Herding", def: "Following the group against your own read", example: "Your table went IN when you wanted OUT." }
];

export const RULES = [
  "Everyone starts at $100.",
  "Each round you choose IN or OUT, before any dice.",
  "IN means the market moves your money. OUT earns exactly $1, guaranteed.",
  "One die sets direction. 4 of its 6 faces mean up.",
  "Three dice set the amount.",
  "You calculate your own new balance. The site checks it."
];

export const CHECKPOINT_PROMPT = "Why did you pick IN or OUT? Type your reason.";
export const GAME2_STEM = "I chose ___ because ___ . This supports my choice because ___ .";

export const EXIT_PROMPT = "A friend sells all their shares after prices drop 10 percent. Should your friend keep or sell? Give your claim, your evidence, and your reasoning.";

export const CLOSURE_QUESTIONS = [
  "Can you justify a conclusion with a claim, evidence, and reasoning?",
  "Name one thing you did differently in the second game than the first."
];

export const PROBE_TEXT = {
  q1: "Was there a call in rounds 1 to 4 you did not get to make because your team ruled you out?",
  q2: "Which round?",
  q3: "What would you have done instead?",
  q4: "Why?"
};

// Teacher-driven sub-steps of the CER mini-lesson. Shown on the display and on student screens.
export const CER_STEPS = [
  {
    title: "Claim, evidence, reasoning",
    lines: ["Claim is the verdict.", "Evidence is the exhibits.", "Reasoning connects them."]
  },
  {
    title: "Find what is missing",
    lines: ["I went IN because I felt lucky."]
  },
  {
    title: "Three parts",
    lines: [
      "Claim: I went IN.",
      "Evidence: the die lands up on 4 of 6 faces.",
      "Reasoning: up is more likely than down, so IN is likely to grow my money."
    ]
  },
  {
    title: "IN averages about $3.50 a round",
    lines: ["Up on 4 of 6 faces.", "Three dice average 10.5.", "IN averages about +$3.50. OUT is a certain +$1."]
  },
  {
    title: "Name the choice you did not make",
    lines: ["I passed on OUT because $1 is certain but small, and one loss will not sink me."]
  },
  {
    title: "Scoring guide",
    lines: []
  }
];

// The observer's design intent panel. Teacher to teacher. One or two sentences per phase.
export const DESIGN_INTENT = {
  "lobby": "Students set a preferred name, emoji, and color before anything else, so every screen addresses them the way they choose to be addressed.",
  "agenda": "The agenda and objective stay one click away all period. Students always know where they are in the lesson.",
  "vocab-warmup": "The two words that drive the game, bull and bear, are front-loaded before any decision depends on them.",
  "learn-to-play": "Students learn the loop by doing it. Practice rounds carry no writing and no standing, and the math entries give an early read on arithmetic.",
  "game1": "Game 1 runs with no scaffolds on purpose. It is the baseline for the growth claim, so the writing is uncoached.",
  "game1-complete": "Every student has written four justifications before any instruction on how to write one.",
  "feedback-1": "Each student reads specific feedback on their own Game 1 writing. The teacher goes first to students flagged at Level 1.",
  "cer-lesson": "The mini-lesson comes after students have felt the need for it. Real student responses, one IN and one OUT, show that either choice can earn the top level.",
  "team-assignment": "Teams were built from Game 1 decision patterns so each group holds four different strategies. Students defend their approach to three people who played it differently.",
  "team-huddle": "Each student gets about 45 seconds to defend their Game 1 approach to people who played it differently.",
  "game2": "Game 2 adds a sentence stem. Rounds 1 to 4 are team decisions with no enforcement, which sets up the herding discussion.",
  "game2-probe": "Students privately report whether their table overruled them, then see what their own call would have been worth against the real roll.",
  "game2-complete": "Every student now has four Game 2 justifications to compare against Game 1.",
  "peer-scoring": "Students score two anonymous classmates against the same guide the AI used, naming what is missing or what works.",
  "debrief": "The debrief works from the class's own survey data rather than a list. Herding gets the most time.",
  "exit-ticket": "A transfer scenario outside the game, with no stem and no scaffold. This is the measure that matters most for growth.",
  "closure": "Students check themselves against the objective that has been posted all period."
};
