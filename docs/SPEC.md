# Specification

## Contents

1. Phase machine
2. Student view
3. Classroom display
4. Teacher control hub
5. Observer view
6. The reveal sequence
7. Game rules and math
8. Archetype classification and team building
9. Game 2 deliberation and the probe
10. Peer scoring
11. Bias survey
12. Exit ticket
13. Vocabulary
14. Identity: names, emoji, accent colors
15. Resilience
16. Exports

---

## 1. Phase machine

One document, `sessions/{sessionId}`, holds the current phase. Every view subscribes
to it and renders accordingly. Only the teacher hub writes to it.

### Phases, in order

| Phase | Student sees | Display shows |
| --- | --- | --- |
| `lobby` | Sign-in, then preferred name, emoji, accent color | Join instructions and the class code |
| `agenda` | Agenda with the current item marked | Agenda, same content, large |
| `vocab-warmup` | Holding screen with the Wayground link | Warm-up title and the link |
| `learn-to-play` | Rules, then practice rounds | Rules, then practice rounds |
| `game1` | Game loop, rounds 1 to 6 | Game loop |
| `game1-complete` | Final balance, submission check | Final standings if toggled |
| `feedback-1` | Their AI feedback on Game 1 responses | Prompt and timer only |
| `cer-lesson` | Follow-along screen, teacher-driven sub-steps | The lesson content |
| `team-assignment` | Their team and seat | Full seating chart by team |
| `team-huddle` | Huddle instructions and timer | Huddle instructions and timer |
| `game2` | Game loop, rounds 1 to 8 | Game loop |
| `game2-probe` | The probe questions | Prompt and response counter |
| `game2-complete` | Final balance | Final standings if toggled |
| `peer-scoring` | Two anonymous responses to score | Prompt, scoring guide, counter |
| `debrief` | Follow-along screen | Mind traps content |
| `exit-ticket` | The transfer scenario | Prompt and timer |
| `closure` | Objective check | Objective and a closing question |

### Round sub-phases

Within `game1` and `game2`, each round moves through:

`decide` → `locked` → `rolling` → `revealed` → `compute` → `settled`

- `decide`: students pick IN or OUT. On a checkpoint round they also write their CER.
- `locked`: no more changes. Teacher sees the count of decisions in.
- `rolling`: dice tumble on the display. Student screens show a waiting state with no
  dice and no numbers.
- `revealed`: direction and amount are known and written to Firestore.
- `compute`: the impact modal opens on student screens. Students enter their new
  balance.
- `settled`: balances confirmed, chart updates, round closes.

The teacher advances `decide` → `locked` → `rolling` manually. The rest advances
automatically, with a manual override to force `settled` if someone stalls.

Countdowns render from `roundEndsAt` minus a server-time offset measured once at
join, never from the local clock alone, so a machine with a skewed clock shows the
same timer as the rest of the room.

### Overlays

These are flags on the session document, not phases. They can be raised at any time
over any phase.

| Flag | Effect |
| --- | --- |
| `leaderboardVisible` | Display shows the portfolio leaderboard. Default false. |
| `biasSurveyPush` | A push id. Non-null opens the bias survey on all student screens. |
| `spotlight` | A response id. Non-null shows that response on the display. |
| `teamSeatingVisible` | Display shows the seating chart. |

An overlay never interrupts active computation. A bias survey pushed while students
are inside the impact modal queues and opens when the round settles.

---

## 2. Student view

Route `/`. Desktop only.

### Join flow

1. **Sign in.** Google, restricted to the school Workspace domain. If the provider
   fails, fall back to class code plus first name.
2. **Preferred first name.** Pre-filled from the Google account. Editable. This is
   the only name shown anywhere.
3. **Emoji.** One emoji, picked from a curated set of 24. Displayed before their name
   everywhere. A curated set rather than a free picker, because a free picker in a
   classroom is a behavior problem waiting to happen.
4. **Accent color.** One faint color from eight presets. Used for their name, their
   line on the personal chart, and their row on the leaderboard.
5. **Agenda.** Items named and brief, with the standard and objective posted. Item
   one is Vocab Warm Up and links to `https://wayground.com/join`.

### Persistent elements

Present on every student screen after join:

- The objective, one line, always visible.
- Their balance.
- **Agenda button.** Opens a popup showing the full agenda with the current item
  marked and completed items checked. Updates live as phases advance.
- **Vocabulary button.** Opens a popup listing every term by category with its
  definition. Available at all times, including during the exit ticket.
- **Dyslexia font toggle.**

Only one task is ever presented at a time. The agenda and vocabulary popups are
dismissable overlays and do not count as competing tasks.

### Game loop screens

**Decide.** The round number, their current balance, and two large buttons: IN and
OUT. On a checkpoint round, a text area appears below with the prompt. In Game 2
rounds 1 to 4, the screen states that the team decides together and shows the longer
timer.

On every other round, a collapsed "Add a reason" control opens the same text area.
That is how a student logs their one chosen response. A student who reaches the
final round of a game without having used it is required to respond on that final
round, so everyone ends the game with four. The screen states this plainly when it
happens.

**Waiting.** After locking in. States that the roll is happening on the board. No
dice, no numbers. This is deliberate: it sends eyes to the front of the room.

**Impact modal.** Opens at `revealed`. Shows, in this order:

1. Their decision for the round, IN or OUT.
2. The reason they typed, verbatim, if this was a checkpoint round.
3. The market result: direction and amount.
4. A field to enter their new balance.

The modal does not show the computed answer. The student computes it.

**Mental math check.** On submit:

- Correct: the modal confirms and closes.
- First wrong answer: a hint appears showing the setup, start balance, direction, and
  amount, laid out as a subtraction or addition. The entry field stays open.
- Second wrong answer: the correct total is shown plainly, the balance is set, the
  modal closes. No commentary on the error.

Every entry is recorded, right or wrong, because mental math accuracy is its own data
stream.

**Settled.** Modal closes. The personal line chart jolts to its new value. If the
leaderboard is toggled on, it is scrollable here.

### Personal chart

A single line showing their balance across rounds, in their accent color. Jolts on
update. Static at all other times.

---

## 3. Classroom display

Route `/display`. Smartboard. No controls, no cursor-dependent affordances.

Follows classroom slide design rules in full: readable from the back of the room,
one idea per screen, solid backgrounds, light for content and dark centered for big
moments.

### Idle state during work time

When students are writing or deciding, the display shows:

- The prompt and, when scaffolds are active, the sentence stem.
- A countdown timer.
- A live response counter, for example "18 of 24 submitted". Counts only. Never names.

### Roll state

Physics dice tumble. One die for direction, then three dice for amount. The shared
market object moves with the result, and every student is watching the same object at
the same moment. This is the one place in the system where spectacle is the point.

### Leaderboard

Off by default. Shown only when the teacher toggles it. Portfolio values with emoji,
preferred name, and accent color, rendered from the compact leaderboard array the
hub publishes on the session document at each settle, so every client follows one
document instead of subscribing to the whole players collection.

### Team seating

When teams are assigned, the display shows the full seating chart grouped by team,
so students can find their seat from across the room.

### Vocabulary

The display has a vocabulary mode the teacher can push, showing all terms. Same
content as the student popup, scaled for the room.

---

## 4. Teacher control hub

Route `/teacher`. Private laptop screen.

Layout is a hybrid: everything lives on one screen with no scrolling, and the single
most relevant action right now is large enough to hit from across the room. Secondary
panels stay visible but compact.

### Primary action area

One large control that changes with the phase. During a round it is Lock Decisions,
then Roll, then Next Round. It always states what it will do.

### Always-visible panels

| Panel | Contents |
| --- | --- |
| Phase | Current phase, previous and next, with a manual jump |
| Responses | Live list of submissions as they arrive, with scores once assessed |
| Distribution | Count at each CER level, updating live |
| Spotlight | AI-nominated strong responses with a one-line rationale, and a push button |
| Flags | Students at Level 1, students who missed mental math twice, students with nothing submitted |
| History | IN and OUT counts per completed round, both games, for live comparisons |
| Toggles | Leaderboard, vocabulary mode, seating chart, bias survey push |
| Assessor health | Green, degraded, or down |

### Controls

- Advance or jump phase
- Lock, roll, force settle
- Toggle leaderboard on the display
- Push bias survey
- Push a spotlight response to the display
- Override any AI score, which replaces what the student sees
- Build teams, after Game 1
- Export

### Randomizer

A non-volunteer picker that draws from students who have not yet been called on this
period, so calling stays balanced without the teacher tracking it mentally.

---

## 5. Observer view

Route `/observer`. Gated to jlowman@greermiddlecollege.org, with the teacher account
also permitted. Read-only. No controls of any kind.

### Shows

- Standard and objective, posted.
- Current phase and elapsed time on the current task.
- Participation rate for the current prompt, as a count and a percentage.
- CER score distribution, live, updating as responses are assessed.
- Game 1 to Game 2 growth, once Game 2 responses exist.
- Mental math accuracy rate.
- Count of students who have received feedback.

### Design intent panel

A small, quiet panel that states what is happening now and why it was designed that
way. Written teacher to teacher. It gives context an observer would otherwise lack,
in the same register as a pre-conference.

It does not reference rubric indicators, does not suggest scores, and does not
evaluate the teacher. One or two sentences per phase. For example, during team
assignment: "Teams were built from Game 1 decision patterns so each group holds four
different strategies. Students will defend their approach to three people who played
it differently."

---

## 6. The reveal sequence

This choreography runs across three screens and is the signature moment of the
lesson. Build it carefully.

1. Teacher clicks **Roll** on the hub.
2. Session moves to `rolling`.
3. **Display:** one die tumbles and settles. Direction is announced large, bull or
   bear, with the word and not only a color.
4. **Display:** three dice tumble and settle. The total is announced. On a double
   round the display shows the base total and the doubled amount side by side, and
   the mental math hint uses the doubled amount.
5. **Display:** the shared market object moves, up or down, by the amount. Every
   student watches the same object.
6. Session moves to `revealed`.
7. **Student:** the impact modal opens with their decision, their words, and the
   market result.
8. **Student:** they compute and enter their new balance.
9. Session moves to `settled` once all entries are in or the teacher forces it.
10. **Student:** modal closes, personal chart jolts.
11. **Display:** leaderboard, only if toggled.

Student screens never show the dice or the numbers before step 7.

---

## 7. Game rules and math

- Every student starts at $100.
- Each round, a student is IN or OUT.
- **One die** sets direction. 1 or 2 is bear, the market goes down. 3, 4, 5, or 6 is
  bull, the market goes up.
- **Three dice** are summed. That total is the dollar amount the market moves.
- **IN:** balance moves by the full amount, in the direction rolled.
- **OUT:** balance gains exactly $1, regardless of direction or amount.
- **Double rounds:** the amount is doubled for students who are IN. OUT still gains
  $1.
- **No decision when the round locks:** the student is OUT for that round, recorded
  with a `defaulted` flag. A bathroom trip or a dead battery never stalls the class.

### Round counts

| | Rounds | Checkpoints | Strategy share | Double round |
| --- | --- | --- | --- | --- |
| Practice | 3 | none | no | no |
| Game 1 | 6 | 1, 3, 5, plus one of their choice | after round 3 | round 5 |
| Game 2 | 8 | 1, 4, 7, plus one of their choice | after round 4 probe | round 7 |

Practice rounds involve no writing and never affect standing. Practice balance is
ephemeral and every balance resets to $100 when Game 1 starts. Practice math entries
are stored under game 0 so the teacher gets an early read on who struggles with the
arithmetic, and game 0 is excluded from exports and analytics. Practice exists so
students learn the loop by doing it rather than hearing it.

### Expected value, for the assessor and the lesson

Direction is up on four of six faces. Three dice average 10.5. So being IN averages
about plus $3.50 a round, against a certain plus $1 for OUT. On a double round, IN
averages about plus $7. A student who reaches this reasoning is writing Level 4
evidence.

---

## 8. Archetype classification and team building

Runs once, after Game 1, triggered from the teacher hub.

### Archetypes

Derived from the 6 decision records of Game 1.

| Archetype | Rule |
| --- | --- |
| **Holder** | IN on 5 or 6 rounds |
| **Sideliner** | OUT on 4 or more rounds |
| **Timer** | 3 or more switches between IN and OUT |
| **Reactor** | Switched immediately after a loss on 2 or more occasions |

Rules are checked in the order Reactor, Timer, Sideliner, Holder, because Reactor is
the most behaviorally specific and the most useful in the debrief. A student matching
nothing is assigned the archetype least represented in the class, and so is a late
joiner with fewer than three recorded decisions.

### Team builder

- Teams of 4. Use teams of 3 for the remainder. Never 5 or more.
- Each team holds one of each archetype where possible.
- For a team of 3, drop whichever archetype is most common in that class period, so
  rare profiles stay spread across teams.
- Within that constraint, spread CER level evenly. No team is all Level 1.
- Output: team id, member list, and a table assignment.

Pushed to the display as a seating chart and to each student screen as their team and
seat.

---

## 9. Game 2 deliberation and the probe

### Rounds 1 to 4

The team deliberates and commits to one call together. Every member is instructed to
enter the team's choice.

**The system does not verify compliance.** It does not compare team members'
decisions, does not flag disagreement, and does not enforce anything. It only extends
the decide timer for these rounds.

### The probe, after round 4

Every student answers:

1. Was there a call in rounds 1 to 4 you did not get to make because your team ruled
   you out? Yes or no.
2. If yes: which round.
3. What would you have done instead.
4. Why.

### The counterfactual

Once a student names a round and an alternative, compute what that choice would have
been worth using the roll that actually happened, and show it:

> You would have gone OUT in round 3. That was plus $1. Your team's call was minus $12.

Or the reverse, when the team was right. Both directions are instructive. State the
number plainly with no commentary.

### Rounds 5 to 8

Individual decisions, normal timing. Round 7 doubles.

---

## 10. Peer scoring

After Game 2. Each student scores two anonymous classmate responses against the
4-level guide.

Responses are distributed by writing a `peerAssignments/{uid}` document containing
the anonymized text copied in. A student can read only their own assignment document.
No student can query another student's responses.

Assignment is a shuffle with offsets. Order the reviewers randomly, give reviewer i
the responses of reviewers i+1 and i+2, wrapping at the end. Nobody can receive
their own, and every submitted response is reviewed exactly twice.

Each review records a level, 1 to 4, and one sentence naming what is missing or what
works.

Peer scores are never shown to the author as a grade. They feed the teacher's data
and the debrief.

---

## 11. Bias survey

Pushable by the teacher at any time, over any phase.

Shows seven mind traps, each with a brief definition and an example from this game.
Students multi-select any they have felt, then write one sentence about the strongest
one.

| Trap | Definition |
| --- | --- |
| Loss aversion | Losses hurt more than equal wins feel good |
| Recency effect | Thinking a streak will keep going |
| Expert opinion | Trusting advice too much |
| Overconfidence | Jumping in and out to time the market |
| Regret | Feeling bad you were OUT when the market rose |
| Excessive risk-taking | Taking bigger risks to catch up |
| Herding | Following the group against your own read |

Herding is not in the NGPF list. It is here because Game 2 rounds 1 to 4 manufacture
it, and students will have felt it directly.

Results store per push, so the survey can be pushed more than once and the responses
compared.

---

## 12. Exit ticket

No scaffolds, no sentence stem, no keyword field. The vocabulary popup stays
available.

> A friend sells all their shares after prices drop 10 percent. Should your friend
> keep or sell? Give your claim, your evidence, and your reasoning.

Assessed like any other response. This is the transfer measure, and it is the one
that matters most for the growth claim.

---

## 13. Vocabulary

Available from a popup on the student view and a pushable mode on the display, at any
time.

### Market terms

| Term | Definition |
| --- | --- |
| Invest | Put money into something now, hoping it grows later |
| Stock market | Where people buy and sell small pieces of companies |
| Portfolio | Everything you own in the market |
| Bull market | Prices are rising |
| Bear market | Prices are falling |
| Buy | Put money into the market |
| Sell | Take money out of the market |
| Hold | Keep your money where it is |
| Risk | The chance you lose some or all of your money |
| Expected value | The average result if you repeat a choice many times |

### Reasoning terms

| Term | Definition |
| --- | --- |
| Justify | Give good reasons for your choice |
| Claim | Your decision in one sentence |
| Evidence | A fact from the game that supports your claim |
| Reasoning | Explains why your evidence supports your claim |

### Mind traps

The seven from the bias survey table above.

---

## 14. Identity: names, emoji, accent colors

**Preferred name.** Pre-filled from Google, editable at join, editable later from the
student view. The only name rendered anywhere, including the leaderboard, the seating
chart, and the teacher hub. The teacher hub also shows the account name underneath,
so the teacher can always match a handle to a student.

**Emoji.** One, from a curated set of 24. Neutral and school-appropriate: objects,
animals, weather, food, shapes. No faces with expressions that read as mockery, no
gestures. Rendered before the name everywhere.

**Accent colors.** Eight presets, all faint, all passing contrast against both the
light and dark surfaces they appear on. Used for the name, the personal chart line,
and the leaderboard row.

Slate, Teal, Amber, Rose, Violet, Sage, Sky, Sand.

Exact hex values are defined once in `src/shared/tokens.js` and used everywhere. Do
not hardcode a color anywhere else.

---

## 15. Resilience

**Rejoin.** Signing in again restores balance, decision history, every response, and
the current phase. State lives in Firestore and never in browser memory alone.

**Balance integrity.** Balances are derived data. The hub recomputes every balance
from decisions and rolls at each settle and overwrites what is stored, so a drifted
or tampered client value never survives a round.

**Late joiner.** A student joining after a game has started enters at the current
class average balance, rounded to the dollar, and plays from the current round. The
hub shows that they joined late.

**Assessor failure.** Covered in `docs/ASSESSOR.md`. After 20 seconds, the student
screen switches to self-assessment against the scoring guide. The lesson continues.

**Mental math stall.** Two attempts, then reveal and move on.

**Auth failure.** Class code plus first name over anonymous auth. The teacher flips
`allowAnonymous` on the hub to open it, and the roster lock still applies.

---

## 16. Exports

Two, both from the teacher hub.

**Full CSV.** One row per response. Columns: preferred name, account email, game,
round, decision, response text, AI level, teacher override level, peer levels, mental
math correct, archetype, team, probe answer, counterfactual value.

**Class summary one-pager.** Printable. Percent at Level 3 or higher by game,
growth between games, mental math accuracy, bias survey distribution, and the count
of students meeting the goal of Level 3 or higher on at least 3 of 4 responses.
