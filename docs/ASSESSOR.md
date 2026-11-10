# The assessor

A Cloudflare Worker that scores student justifications against the 4-level guide and
returns feedback within seconds.

It exists because 24 students writing 9 responses each produces about 216 pieces of
writing in 90 minutes, and no teacher can give specific feedback on all of it in
real time. The teacher gives oral feedback while circulating. The assessor covers the
written channel.

---

## Why a Worker and not the browser

The Anthropic API key cannot live in client code on a static site. Anyone can read it.

A Cloudflare Worker holds the key as a server secret and is the only thing that calls
the API. It is also the more reliable choice on a school network: the call to
Anthropic originates from Cloudflare's servers, not from a classroom machine behind
a content filter. The classroom only needs to reach the Worker's own domain.

---

## Endpoints

Base URL: the Worker's deployed domain. CORS restricted to the GitHub Pages origin.

### `POST /assess`

Scores one response.

**Request**

```json
{
  "sessionId": "2b-2026-11-20",
  "responseId": "uid_1_3",
  "game": 1,
  "round": 3,
  "decision": "IN",
  "text": "I stayed IN because the market went up last round.",
  "isDoubleRound": false,
  "isExitTicket": false
}
```

No names, no emails, no student identifiers that mean anything outside this session.
The `responseId` is an opaque key the Worker writes back against.

**Response**

```json
{
  "level": 2,
  "why": "You gave a reason and named your choice. The last round does not predict the next one, so that is not evidence yet.",
  "suggestedEdit": "Try: I stayed IN because the market goes up on 4 of 6 faces.",
  "spotlightNominee": false,
  "spotlightReason": null,
  "model": "..."
}
```

The Worker writes this to `sessions/{sessionId}/feedback/{responseId}` using admin
credentials, then returns it. The client does not write feedback.

Implementation note: the firebase-admin SDK does not run on Cloudflare Workers. Use
the Firestore REST API with a service account. Sign a JWT with WebCrypto RS256,
exchange it for an OAuth token, cache the token for its lifetime, and PATCH the
feedback document. This is a known pattern and about fifty lines. Do not fight the
SDK.

Calls are idempotent per `responseId`. Re-assessing an already assessed response
overwrites the same document with the same shape, so retries are always safe.

### `GET /health`

Returns `{ "ok": true, "model": "...", "latencyMs": 412 }` after a live round trip
with a tiny fixed prompt. The teacher hub calls this before class and shows the
result as the assessor health light.

Run this during setup, before first period. It is the single most useful 10 seconds
of the morning.

---

## The scoring guide

This is the rubric students see and the assessor scores against. It must be identical
in both places.

| Level | Descriptor |
| --- | --- |
| 4 | Claim, evidence, and reasoning, plus the choice they did not make and why they passed on it |
| 3 | Claim, specific evidence from the game, and reasoning that connects them |
| 2 | A reason is given, but no fact from the game |
| 1 | Only a choice or a feeling |

### What counts as evidence

- The odds. Up on 4 of 6 faces, down on 2 of 6.
- The three-dice total averaging 10.5, or the expected value of about plus $3.50 a
  round for IN against a certain plus $1 for OUT.
- Their own balance, or their position relative to the class.
- A specific prior round and what happened in it, used correctly.
- What a classmate or the teacher said, named as such.
- The double round changing the size of the swing.

### What does not count

- Feelings with no fact attached. Lucky, scared, felt right.
- A streak used as a prediction. This is the recency effect and it is the single
  most common error. Name it as such in the feedback, because the lesson teaches it.
- Restating the rules without applying them.

---

## The scoring prompt

Rules the prompt must enforce:

1. **Score the justification, never the decision.** IN and OUT are both fully
   defensible. A Level 4 is available to a student who went OUT every round. Never
   imply the pick was wrong. If the model starts rewarding the choice instead of the
   reasoning, the whole lesson teaches balance-chasing.
2. **Two sentences of feedback.** Name something specific that is present, then the
   one missing move.
3. **The suggested edit is a sentence they could type,** not advice like "add more
   detail."
4. **Reading level around 8th grade.** Short sentences. Only vocabulary the lesson
   has taught.
5. **No em-dashes and no semicolons.**
6. **No praise words.** No "great", "excellent", "nice work". Specific is enough.
7. **A Level 4 gets a harder question, not a compliment.**
8. **Never reference the student's balance, rank, or whether they are winning.**

### Voice, by phase

**Game 1** is scaffolded. These students have never been taught CER. Feedback names
the part that is present in plain words before naming what is missing, so the student
learns the structure from the feedback itself.

> Level 1: "You made a clear claim. A feeling cannot be checked, so swap it for a
> fact from the game. Try: I stayed IN because 4 of 6 faces mean up."

**Game 2 and the exit ticket** tighten. The format is known by then, so the feedback
gets shorter and more direct.

> Level 2: "Claim and reason are there. The evidence is not from the game yet. Name
> the odds or a round that actually happened."

**Every level gets a path upward.**

> Level 3: "Clear claim, real evidence, reasoning connects them. For a 4, name the
> choice you did not make and why you passed on it."
>
> Level 4: "You weighed both sides with real odds. Would your reasoning change in the
> doubled round, and why?"

### Spotlight nomination

Returned in the same call, no second request.

A response is nominated when it is Level 3 or 4 **and** shows something worth the
class seeing: a clear use of the odds, a weighed alternative, a named bias, or a
plainly stated tradeoff.

`spotlightReason` is one line, written for the teacher, explaining why this one.

The teacher hub holds nominees in a tray and tries to always offer **one strong IN
and one strong OUT**, so the class sees with their own eyes that either choice earns
a 4. Nothing reaches the display without the teacher pushing it.

---

## Archetype classification is local, not AI

The four archetypes are deterministic functions of six decisions. They do not need a
model, and running them locally is faster, free, and cannot fail mid-class.

```js
function classify(decisions) {           // decisions: ["IN","OUT","IN",...]
  const inCount = decisions.filter(d => d === "IN").length;
  const switches = countSwitches(decisions);
  const reactions = countSwitchesAfterLoss(decisions, rolls);

  if (reactions >= 2) return "Reactor";
  if (switches >= 3)  return "Timer";
  if (inCount <= 2)   return "Sideliner";
  if (inCount >= 5)   return "Holder";
  return leastRepresentedInClass();
}
```

Checked in that order, because Reactor is the most behaviorally specific and the most
useful in the debrief.

Team building is also local: one of each archetype per team, CER level spread evenly,
teams of 4 with 3s for the remainder. CER levels come from feedback already written.

Do not add an API call here. It buys nothing and adds a failure point at the single
busiest transition in the lesson.

---

## The fallback ladder

Every step is designed so the lesson continues. None of these is an error screen.

1. **Retry.** Transient failure retries twice with backoff.
2. **Model fallback.** If the primary model fails or rate-limits, retry once on the
   secondary.
3. **Queue.** The student client calls `/assess` on submit. A response still
   `pending` after 15 seconds is retried by the teacher hub, which watches the
   pending set and re-calls the Worker. Late feedback is fine. Missing feedback is
   not.
4. **Degrade at 20 seconds.** The student screen switches to self-assessment: the
   4-level guide appears and the student scores their own response and names what is
   missing. The response is marked `degraded`.
5. **Teacher override.** Manual score entry from the hub always works, with no
   network dependency beyond Firestore.
6. **Peer scoring is independent.** It never touches the Worker.

The self-assessment path is pedagogically sound on its own. If the assessor is down
for the whole period, the lesson still works and students still get criterion-
referenced feedback, just from themselves and from each other.

### Health light

The teacher hub shows green, degraded, or down, derived from the latency and failure
rate of the last 10 real scoring calls. `/health` itself is for the pre-class check,
not for polling, so the hub never burns API calls on heartbeats. Students never see
it.

---

## Cost

About 216 calls per period, roughly 500 tokens in and 120 out each. Two sections a
day. On a small fast model this is cents per class. Model choice should favor latency
over capability: the scoring task is simple and well specified, and a response that
arrives in 3 seconds teaches better than a slightly better one that arrives in 15.

---

## Security

- The key is a Worker secret. Never in the repo, never in client code, never logged.
- CORS allows only the GitHub Pages origin, plus localhost during development. The
  allowed origins live in Worker config, not in code.
- Rate limit per session id, sized well above a real class and well below abuse.
- No student names, emails, or account identifiers are ever sent to the API.
- The Worker writes to Firestore with admin credentials and never exposes them.
- Log the response id, the level, and the latency. Never log the student text.
