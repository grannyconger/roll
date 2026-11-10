# Roll with the Market: live classroom system

## What this is

A real-time web app that runs a single 90-minute high school Personal Finance lesson.
Students play a dice-driven investing game twice, write short justifications for their
decisions, and receive AI-scored feedback on those justifications within seconds.

The lesson is observed against the SCTS 4.0 teaching rubric. Several features exist
specifically to generate observable evidence for that rubric. Where a feature looks
redundant, it is probably carrying rubric weight. Do not remove features without
checking `docs/RUBRIC-MAP.md` first.

**Teacher:** bweaver@greermiddlecollege.org
**Observer:** jlowman@greermiddlecollege.org
**Class size:** about 24 students, two sections (2B and 4B)

## Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Hosting | GitHub Pages | Static only. No server-side rendering. |
| Realtime + data | Firebase Firestore | Single source of truth for all shared state |
| Auth | Firebase anonymous auth plus class code | Students join with the class code only. Google sign-in stays in the code for the teacher, the display, and the observer, and for students at `?google=1` |
| AI assessor | Cloudflare Worker | Holds the Anthropic API key as a server secret |

The API key must never appear in client code, in the repo, or in any committed file.
The Worker is the only thing that talks to the Anthropic API.

## The four views

| Route | Who | Device |
| --- | --- | --- |
| `/` | Students | Desktop, 24 at once |
| `/display` | Whole class | Smartboard, extended from the teacher's laptop, no controls visible |
| `/teacher` | Teacher | Teacher laptop, private, drives everything |
| `/observer` | Evaluator | Evaluator laptop, read-only, email-gated to one address |

The display and the teacher hub run on the same physical machine across two screens.
They are separate routes, not one page in two modes.

## Hard rules

### Copy voice

Instructions are direct and utilitarian. No motivational language anywhere in the UI.
The teacher motivates in person. The interface tells students what to do and gets out
of the way.

Write: "Pick IN or OUT." and "Enter your new balance."
Never write: "You've got this!", "Great job!", "Let's dive in!", "Ready to crush it?"

This rule does not apply to AI feedback on student writing, which is covered in
`docs/ASSESSOR.md` and is deliberately scaffolded for students who have never been
taught this skill.

### Punctuation

No em-dashes and no semicolons, anywhere in UI copy, docs, or comments. Use a comma,
a hyphen, or a period.

### Visual design

The classroom display is a projected surface and follows classroom slide design rules
fully. Student screens scale type down for personal viewing distance but follow every
other rule.

Applies everywhere:

- Solid background colors only. No gradients, ever.
- High contrast. Body text at 7:1 where possible, never below 4.5:1.
- Color never carries meaning alone. Pair it with a word, a label, or a shape.
  Prefer teal and amber over red and green.
- One idea per screen.
- Generous open space. Minimal elements.
- Headings state information. They never hype, summarize, or signpost.
- No periods at the end of a title.

Applies to the classroom display specifically:

- Readable from the back of the room. Titles around 96px, body around 48px minimum.
- Light background with dark text for content. Dark background with light text for
  big moments, and on those screens the text is centered both horizontally and
  vertically.

Never use any of these, on any view:

tags and pills, excessive italics, tight letter spacing, over-detailed UI chrome,
decorative dividers or accent bars or side rails, tinted or faded color boxes,
containers with borders used as decoration, over-detailed diagrams, verbose or
redundant text, file-path style labels, numbered section headings, small eyebrow
labels above titles, dithering, ASCII art, rounded-square cards, excessive mono
fonts, ALL CAPS labels, gradient backgrounds, periods in titles, shaded score
badges, number bubbles, middots as separators.

Mono numerals for money figures are a functional exception and are allowed.

### Motion

Whimsy runs through the whole experience at moments: joining, locking in, the dice
roll, the market move, the balance change, a right answer, feedback arriving, a new
screen arriving. Each is a short burst that ends on its own. There is no ambient
motion during reading or writing time, which is an accessibility requirement and not a
taste preference. Nothing loops while a student is typing.

All motion respects `prefers-reduced-motion`.

### Sound

Student screens are silent. The classroom display plays one synthesized drumroll under
the direction die, and the hub can turn it off. The teacher uses a physical chime.

### Student text is data

Any string a student typed is rendered with text nodes, never injected as HTML, on
every view. This covers names, responses, peer notes, probe answers, and survey
sentences. One `innerHTML` with student text on the display is a projected XSS with
an audience of 24.

### Accessibility

These students include neurodivergent and ADHD learners, and the design targets them
by default rather than as an accommodation layer.

- One task visible at a time. Never show a student two things they could be doing.
  The Sparkle Points challenge appears only after the student's task is submitted.
- Time remaining is always explicit when a task is timed.
- A dyslexia-friendly font toggle is available on the student view and the display.
  **Every layout must be verified in both font states.** OpenDyslexic has wider
  glyphs and will break naive fixed-width layouts. Test every screen, both states,
  before calling any screen done.
- No flashing, no autoplay, no motion during reading or writing tasks.

### Platform

The student view runs in full screen. Leaving it covers the page until the student
clicks back in.

Desktop only. Do not write responsive breakpoints for phones or tablets. Students are
on Dell Latitudes. The display is a smartboard.

## Build philosophy

**Prototype first.** The first goal is a working system that can run a class end to
end. Visual polish comes in later sessions. Prefer plain, readable code over
abstraction. Do not add a build step, a framework, or a state library unless the
system genuinely needs one.

Do not write tests for this. It runs once, observed, with the teacher present.
Time is better spent on a dry run than on a test suite.

Keep functions small and named for what they do in the lesson, not in the abstract.
`startGame2DeliberationRound` beats `handlePhaseTransition`.

## Repo layout

```
/
  index.html          student view
  display.html        classroom display
  teacher.html        teacher control hub
  observer.html       observer view
  /src
    firebase.js       init, auth, firestore handles
    session.js        phase machine, shared state subscriptions
    game.js           dice, market math, balance rules
    student/          student view modules
    display/          display view modules
    teacher/          teacher hub modules
    observer/         observer view modules
    shared/           vocab data, archetypes, design tokens
  /worker
    index.js          Cloudflare Worker, assessor endpoints
    prompts.js        scoring, classification, spotlight prompts
  /docs               the files listed below
  firestore.rules
```

## Documents

Read these before building the matching area.

| File | Covers |
| --- | --- |
| `docs/SPEC.md` | Every view, the phase machine, the reveal sequence, all features |
| `docs/DATA-MODEL.md` | Firestore collections, field shapes, security rules |
| `docs/ASSESSOR.md` | Worker contract, prompts, JSON schemas, failure handling |
| `docs/LESSON-PLAN.md` | The lesson itself, for the Planning domain of the rubric |
| `docs/FACILITATION.md` | Minute by minute, what the teacher says and does |
| `docs/RUBRIC-MAP.md` | Every rubric indicator mapped to the evidence that carries it |

## Build order

Build in this order. Each step should leave the system runnable.

1. Firebase project, auth, Firestore rules deployed
2. Session phase machine and shared state subscriptions
3. Join flow: sign-in, preferred name, emoji, accent color, agenda
4. Game loop for one round across all three classroom views, including mental math
5. Game 1 complete, with CER checkpoints writing to Firestore
6. Worker assessor, scoring, feedback delivery, fallback ladder
7. Archetype classification and team builder
8. Game 2, deliberation rounds, the probe, the counterfactual
9. Peer scoring, bias survey, exit ticket
10. Observer view
11. Exports
12. Dyslexia font pass and full layout verification
13. Dry run

## Things that will break the lesson

These are the known failure points. Handle them deliberately.

- **A Chromebook dies mid-game.** Signing back in must restore full state: balance,
  history, every response.
- **A student arrives at minute 30.** They join at the class average balance and play
  from the current round.
- **The assessor is slow or down.** After 20 seconds with no feedback, the student
  screen switches to self-assessment against the scoring guide. The lesson continues.
  This is a designed path, not an error state.
- **A student stalls on mental math.** Two attempts, then the answer is revealed and
  the round moves on. Nobody blocks the class.
- **A student never decides before the lock.** They are OUT for the round, recorded
  with a defaulted flag. The class never waits.
- **A client drifts or tampers.** Balances are recomputed by the hub from decisions
  and rolls at every settle, so stored balances heal themselves each round.
- **Google sign-in is blocked by the district.** The class-code fallback must work
  without any auth provider at all.
