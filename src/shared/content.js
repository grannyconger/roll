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
  { id: "loss-aversion", name: "Loss aversion", def: "Losses hurt more than equal wins feel good", example: "Going OUT for the rest of the game after one big drop.", life: "Keeping a game console you never use because selling it for less than you paid feels like losing." },
  { id: "recency", name: "Recency effect", def: "Thinking a streak will keep going", example: "Going IN because the last two rolls were up.", life: "A team wins three games, so you bet they cannot lose the fourth." },
  { id: "expert", name: "Expert opinion", def: "Trusting advice too much", example: "Copying the top player on the leaderboard.", life: "Buying a coin because an influencer with a million followers said it would go up." },
  { id: "overconfidence", name: "Overconfidence", def: "Jumping in and out to time the market", example: "Switching every round to guess the next roll.", life: "Selling a stock on Monday and buying it back Wednesday because you are sure you can see the dip coming." },
  { id: "regret", name: "Regret", def: "Feeling bad you were OUT when the market rose", example: "Going IN next round because you missed a big gain.", life: "Your friend made money on a sneaker resale you skipped, so you buy the next drop without checking it." },
  { id: "risk-taking", name: "Excessive risk-taking", def: "Taking bigger risks to catch up", example: "Going IN on the double round because you are behind.", life: "Down $20 at a card game, you bet everything left on one hand to win it back." },
  { id: "herding", name: "Herding", def: "Following the group against your own read", example: "Your table went IN when you wanted OUT.", life: "Everyone in your group chat is buying the same stock, so you buy it without knowing what the company does." }
];

export const RULES = [
  "Everyone starts at $100.",
  "Each round you choose IN or OUT, before any dice.",
  "IN means the market moves your money. OUT earns exactly $1, guaranteed.",
  "One die sets direction. 4 of its 6 faces mean up.",
  "Three dice set the amount.",
  "You calculate your own new balance. The site checks it."
];

// One worked example per rule, shown under the newest rule.
export const RULE_EXAMPLES = [
  "Same start for everyone. The only difference by the end is your choices.",
  "Like buying a stock today before you know tomorrow's price.",
  "IN and the market goes up $11: $100 becomes $111. OUT: $100 becomes $101 no matter what.",
  "Rolls of 3, 4, 5, or 6 mean up, bull. Rolls of 1 or 2 mean down, bear.",
  "Dice of 4, 2, and 5 move the market $11.",
  "You are IN at $104 and the market drops $9. $104 minus $9 is $95."
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
// kind: frame (lines), example (labeled parts), talk (turn and talk with a timer),
// poll (every student answers on their screen, the teacher reveals), guide (scoring guide).
export const CER_STEPS = [
  {
    kind: "frame", title: "Claim, evidence, reasoning",
    lines: ["Claim is the verdict.", "Evidence is the exhibits.", "Reasoning is the closing argument that connects them."]
  },
  {
    kind: "example", title: "You already do this",
    scenario: "Asking to stay out until 11 on Friday.",
    parts: [
      ["Claim", "I should be allowed to stay out until 11."],
      ["Evidence", "I have been home on time every weekend this month."],
      ["Reasoning", "That record shows I can handle a later curfew."]
    ]
  },
  {
    kind: "talk", title: "Turn and talk", seconds: 60,
    prompt: "Tell your partner about the last time you talked someone into a yes. What was your claim? What was your evidence?"
  },
  {
    kind: "poll", title: "Find what is missing",
    scenario: "I went IN because I felt lucky.",
    ask: "What is missing?",
    options: ["The claim", "Evidence and reasoning", "Nothing. It is complete."],
    answer: 1,
    why: "\"I went IN\" is the claim. Feeling lucky is not a fact from the game, and nothing explains why it matters."
  },
  {
    kind: "poll", title: "Find what is missing",
    scenario: "Take the grocery store job. It pays $13 an hour and the other job pays $11.",
    ask: "What is missing?",
    options: ["The claim", "The evidence", "The reasoning"],
    answer: 2,
    why: "Nothing says why $2 more matters. Reasoning: at 15 hours a week that is $30 more, enough to cover my phone bill."
  },
  {
    kind: "example", title: "A game example",
    scenario: "Round 3 of Game 1.",
    parts: [
      ["Claim", "I went IN."],
      ["Evidence", "The direction die lands up on 4 of its 6 faces."],
      ["Reasoning", "Up is more likely than down, so IN is likely to grow my money."]
    ]
  },
  {
    kind: "poll", title: "Which part is this?",
    scenario: "\"Three dice average 10.5.\"",
    ask: "Is this a claim, evidence, or reasoning?",
    options: ["Claim", "Evidence", "Reasoning"],
    answer: 1,
    why: "It is a fact about the game that anyone can check. Facts you can check are evidence."
  },
  {
    kind: "frame", title: "IN averages about $3.50 a round",
    lines: ["Up on 4 of 6 faces.", "Three dice average 10.5.", "IN averages about +$3.50. OUT is a certain +$1."]
  },
  {
    kind: "talk", title: "Turn and talk", seconds: 60,
    prompt: "Your friend says OUT is smarter because it is safe. Use the $3.50 fact to agree or disagree. Then switch."
  },
  {
    kind: "example", title: "A real money decision",
    scenario: "Your aunt gives you $200 for your birthday.",
    parts: [
      ["Claim", "Put it in an index fund, not a savings account."],
      ["Evidence", "Savings accounts pay about 4 percent a year. The stock market has averaged about 10 percent a year over long periods."],
      ["Reasoning", "I will not need this money for years, so I can ride out bad years for the higher average."],
      ["The choice I did not make", "I passed on savings because it is safer but grows slower, and I am not spending this soon."]
    ]
  },
  {
    kind: "frame", title: "Name the choice you did not make",
    lines: ["This is the Level 4 move.", "I passed on OUT because $1 is certain but small, and one loss will not sink me."]
  },
  {
    kind: "poll", title: "Score it",
    scenario: "I went OUT because the market seems risky right now.",
    ask: "What level is this?",
    options: ["Level 1", "Level 2", "Level 3", "Level 4"],
    answer: 1,
    why: "It gives a reason, but no fact from the game. That is Level 2."
  },
  {
    kind: "talk", title: "Fix it together", seconds: 90,
    prompt: "With your partner, turn this into a Level 3: \"I went OUT because the market is scary.\" Add one fact from the game and say why it matters."
  },
  { kind: "guide", title: "Scoring guide", lines: [] }
];

// Sparkle Points. CER analysis questions students answer while they wait for the class.
// Up to three after each written response in Game 1, peer scoring, and the exit ticket. Correct is +3, wrong is -1.
export const SPARKLE_RIGHT = 3;
export const SPARKLE_WRONG = -1;
export const QUIZ_PER_WAIT = 3;
const MISSING = ["The claim", "The evidence", "The reasoning", "Nothing. It has all three."];
const LEVELS = ["Level 1", "Level 2", "Level 3", "Level 4"];
export const QUIZ = [
  { id: "q01", scenario: "I should get the $180 sneakers because they are cool.", ask: "What is missing?", options: MISSING, answer: 1, why: "\"They are cool\" is an opinion. There is no fact, like how long they last or what they cost per wear." },
  { id: "q02", scenario: "I went OUT. The last two rolls were down.", ask: "What is missing?", options: MISSING, answer: 2, why: "There is a claim and a fact, but nothing says why two down rolls should change the next one." },
  { id: "q03", scenario: "Because the bus is late 3 days a week, the bus is not reliable enough to count on.", ask: "What is missing?", options: MISSING, answer: 0, why: "It never says what to do. A claim would be: I should get a ride to school instead." },
  { id: "q04", scenario: "I picked IN because 4 of 6 faces are up, so the market rises more often than it falls.", ask: "What level is this?", options: LEVELS, answer: 2, why: "Claim, a fact from the game, and reasoning that connects them. That is Level 3." },
  { id: "q05", scenario: "IN. I just felt like it.", ask: "What level is this?", options: LEVELS, answer: 0, why: "Only a choice and a feeling. That is Level 1." },
  { id: "q06", scenario: "I chose OUT because I wanted to be careful.", ask: "What level is this?", options: LEVELS, answer: 1, why: "A reason is given, but there is no fact from the game. That is Level 2." },
  { id: "q07", scenario: "I went IN because IN averages about $3.50 a round and OUT is only $1. I passed on OUT because $1 is safe but too small to catch up.", ask: "What level is this?", options: LEVELS, answer: 3, why: "It names the choice it did not make and why. That is the Level 4 move." },
  { id: "q08", scenario: "\"I should buy the store brand cereal. It costs $2 less a box. Over a year that is about $100 I can save.\"", ask: "Which sentence is the evidence?", options: ["I should buy the store brand cereal.", "It costs $2 less a box.", "Over a year that is about $100 I can save."], answer: 1, why: "\"It costs $2 less a box\" is a fact you can check on the shelf." },
  { id: "q09", scenario: "\"Practice is worth it. Our team lost the last two games by one point. One more made shot would have won both.\"", ask: "Which sentence is the reasoning?", options: ["Practice is worth it.", "Our team lost the last two games by one point.", "One more made shot would have won both."], answer: 2, why: "It connects the fact to the claim. It explains why the close losses mean practice matters." },
  { id: "q10", scenario: "\"I should keep my phone another year. It still runs every app I use.\"", ask: "Which sentence is the claim?", options: ["I should keep my phone another year.", "It still runs every app I use.", "There is no claim."], answer: 0, why: "The claim is the decision. Keep the phone another year." },
  { id: "q11", scenario: "Claim: Stay IN on the double round. Evidence: Up is still 4 of 6.", ask: "Which reasoning fits best?", options: ["Because I feel lucky today.", "The odds do not change on a double round, so up is still more likely, and the win is twice as big.", "Because everyone else is going IN."], answer: 1, why: "It uses the evidence and explains why it supports the claim. The others are a feeling and herding." },
  { id: "q12", scenario: "Claim: Do not buy the $60 game on release day. Evidence: Last year's game dropped to $30 within two months.", ask: "Which reasoning fits best?", options: ["Games are boring.", "If this one follows the same pattern, waiting two months saves $30.", "My friend said so."], answer: 1, why: "It connects last year's price drop to this year's choice." },
  { id: "q13", scenario: "\"You should open a savings account. My cousin did.\"", ask: "What is wrong with the evidence?", options: ["Nothing. It is strong evidence.", "One person's choice is not a fact about why it is a good idea.", "There is no claim."], answer: 1, why: "What one cousin did does not show it is smart. A fact like the interest rate would." },
  { id: "q14", scenario: "Maya went IN every round. Jordan switched every round to guess the next roll.", ask: "Who is showing overconfidence?", options: ["Maya", "Jordan", "Both"], answer: 1, why: "Jumping in and out to time the market is overconfidence." },
  { id: "q15", scenario: "I went IN because the top player on the leaderboard went IN.", ask: "Which mind trap is this?", options: ["Expert opinion", "Loss aversion", "Regret"], answer: 0, why: "Trusting someone else's call too much is the expert opinion trap." },
  { id: "q16", scenario: "After losing $16, Sam went OUT for every round left.", ask: "Which mind trap is this?", options: ["Herding", "Loss aversion", "Recency effect"], answer: 1, why: "One loss hurt so much Sam stopped playing. That is loss aversion." },
  { id: "q17", scenario: "\"I should work fewer shifts during finals. My grades dropped last semester when I worked 20 hours a week.\"", ask: "What is missing?", options: MISSING, answer: 2, why: "It needs to say why the grade drop matters, like: fewer hours means more study time when grades count most." },
  { id: "q18", scenario: "\"Get the cheaper phone plan. It is $25 a month instead of $45, and I only use 3 GB of data. That saves $240 a year for data I would not use.\"", ask: "What is missing?", options: MISSING, answer: 3, why: "Claim, two facts, and reasoning that connects them. It is complete." },
  { id: "q19", scenario: "I chose OUT because the game is random.", ask: "Why is this weak?", options: ["It has no claim.", "Random does not mean even. Up is still 4 of 6.", "It is too long."], answer: 1, why: "The game is random, but the die favors up. The reason ignores the evidence." },
  { id: "q20", scenario: "\"Bring lunch instead of buying it. Buying costs about $9 a day. Bringing it costs about $3.\"", ask: "What would make this stronger?", options: ["Add an emoji.", "Add reasoning: $6 a day is about $30 a week toward my car fund.", "Make the claim louder."], answer: 1, why: "Reasoning tells the reader why the $6 difference matters." },
  { id: "q21", scenario: "The market went up four rounds in a row, so Ava went IN because it has to keep going.", ask: "Which mind trap is this?", options: ["Recency effect", "Herding", "Excessive risk-taking"], answer: 0, why: "Thinking a streak will keep going is the recency effect. Each roll is new." },
  { id: "q22", scenario: "\"I went OUT because $1 is certain.\"", ask: "What level is this?", options: LEVELS, answer: 2, why: "\"$1 is certain\" is a fact from the game, and it connects to the choice. That is Level 3. Naming the choice not made would be Level 4." },
  { id: "q23", scenario: "Your table went IN but you wanted OUT, so you went IN.", ask: "Which mind trap is this?", options: ["Regret", "Herding", "Overconfidence"], answer: 1, why: "Going with the group against your own read is herding." },
  { id: "q24", scenario: "\"Take the bus pass. It costs $40 a month. Gas for my car costs $90 a month.\"", ask: "Which sentence is evidence?", options: ["Take the bus pass.", "It costs $40 a month.", "There is no evidence."], answer: 1, why: "The cost of the pass is a fact you can check." },
  { id: "q25", scenario: "Down $20, Leo went IN on the double round to catch up.", ask: "Which mind trap is this?", options: ["Excessive risk-taking", "Loss aversion", "Expert opinion"], answer: 0, why: "Taking a bigger risk to make up a loss is excessive risk-taking." },
  { id: "q26", scenario: "\"Start a Roth IRA now. Money invested at 16 has about 50 years to grow.\"", ask: "What is missing?", options: MISSING, answer: 2, why: "It needs to say why 50 years matters, like: growth stacks on growth, so starting early can double what you end with." },
  { id: "q27", scenario: "\"I should not lend my friend $50 again.\"", ask: "What is missing?", options: ["Only the claim is there. Evidence and reasoning are missing.", "Only the evidence is missing.", "Nothing is missing."], answer: 0, why: "It is only a decision. Evidence would be: they have not paid back the last $50." },
  { id: "q28", scenario: "I went IN because three dice average 10.5, so a win is usually about $10. A loss can be $18, but up happens twice as often as down.", ask: "What level is this?", options: LEVELS, answer: 2, why: "Strong evidence and reasoning. It does not name the choice it passed on, so it is Level 3." },
  { id: "q29", scenario: "\"Buy the used car with 40,000 miles instead of the new one. It costs $9,000 less.\"", ask: "Which reasoning fits best?", options: ["New cars smell nice.", "The $9,000 I save can cover insurance for three years, and the car still has many years left.", "My parents had a used car."], answer: 1, why: "It explains why the price difference matters for this choice." },
  { id: "q30", scenario: "Kai missed a $15 gain while OUT, so next round Kai went IN without thinking about it.", ask: "Which mind trap is this?", options: ["Regret", "Recency effect", "Expert opinion"], answer: 0, why: "Acting to avoid feeling left out again is regret." },
  { id: "q31", scenario: "\"Sign up for the free tutoring. My math grade is a 68 and the tutoring is free on Tuesdays.\"", ask: "What is missing?", options: MISSING, answer: 2, why: "Two facts, but no link. Reasoning: a 68 is close to failing, and free help costs me only time." },
  { id: "q32", scenario: "Claim: Go OUT this round. Evidence: I am ahead by $30 with one round left.", ask: "Which reasoning fits best?", options: ["Because OUT is always better.", "One down roll on IN could cost up to $18, and a certain $1 protects my lead to the end.", "Because I am bored."], answer: 1, why: "It explains why protecting a lead matters on the last round. That is a real tradeoff." },
  { id: "q33", scenario: "\"Cancel two of my three streaming apps. I only watched one of them this month. Each costs about $12.\"", ask: "What is missing?", options: MISSING, answer: 2, why: "It needs the link: canceling two saves about $24 a month on shows I am not watching." },
  { id: "q34", scenario: "Which one is a claim?", ask: "Pick the claim.", options: ["The die has 6 faces.", "I should go IN next round.", "Three dice can add up to 18."], answer: 1, why: "A claim is a decision or position. The other two are facts." },
  { id: "q35", scenario: "Which one is evidence from the game?", ask: "Pick the evidence.", options: ["I have a good feeling.", "OUT earns exactly $1 every round.", "IN is fun."], answer: 1, why: "\"OUT earns exactly $1\" is a rule of the game anyone can check." },
  { id: "q36", scenario: "\"Wait to buy concert tickets. Last time prices dropped $40 the week of the show.\"", ask: "What would make this Level 4?", options: ["Add: I passed on buying now because the drop is likely, even if seats might sell out.", "Add: concerts are fun.", "Nothing. It is already Level 4."], answer: 0, why: "Naming the choice you did not make, and why, is the Level 4 move." }
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
  "cer-lesson": "The mini-lesson comes after students have felt the need for it. Real-life examples come before game ones, three turn and talks put every student's voice in the room, and four polls check every student's understanding live. Real student responses, one IN and one OUT, show that either choice can earn the top level.",
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
