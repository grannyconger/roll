# Data model

Firestore. One session document per class period. Section 2B and section 4B are
separate sessions.

All shared state lives here. Nothing important lives only in browser memory, because
a student rejoining after a dead laptop must get everything back.

---

## Collections

### `sessions/{sessionId}`

The single source of truth. Every view subscribes to this document.

```js
{
  sessionId: "2b-x7k2p9",         // section plus a random suffix, never guessable
  section: "2B",
  teacherUid: "...",
  classCode: "MARKET",            // fallback auth
  allowAnonymous: false,          // teacher flips this only if Google auth fails
  joinLocked: false,              // teacher locks the roster once class is running
  createdAt: Timestamp,

  phase: "game1",                 // see SPEC section 1
  game: 1,                        // 0 during practice, 1 or 2 during games
  round: 3,
  roundState: "decide",           // decide | locked | rolling | revealed | compute | settled
  roundEndsAt: Timestamp,         // drives every countdown
  isDoubleRound: false,
  isTeamRound: false,             // true for game 2 rounds 1 to 4

  cerSubStep: null,               // teacher-driven step within cer-lesson

  // overlays
  leaderboardVisible: false,
  vocabModeVisible: false,
  teamSeatingVisible: false,
  spotlightResponseId: null,
  biasSurveyPushId: null,

  assessorHealth: "ok",           // ok | degraded | down
  classAverageBalance: 104,       // recomputed at settle, used for late joiners

  // hub-written at every settle, so the leaderboard costs every client one
  // listener on this document instead of a players-collection subscription
  leaderboard: [
    { uid: "...", preferredName: "Jo", emoji: "🦉", accentColor: "teal", balance: 112 }
  ]
}
```

Only the teacher hub writes to this document.

### `sessions/{sessionId}/players/{uid}`

```js
{
  uid: "...",
  preferredName: "Jo",            // shown everywhere
  emoji: "🦉",
  accentColor: "teal",
  joinedAt: Timestamp,
  joinedLate: false,

  balance: 112,
  balanceHistory: [100, 108, 96, 112],   // index 0 is start

  archetype: null,                // set after game 1
  teamId: null,
  seat: null,

  calledOnCount: 0,               // for the non-volunteer randomizer
  dyslexiaFont: false
}
```

Any signed-in student can read the players collection, so it holds only what every
screen is allowed to show. Real identity lives in `roster`, below.

`balance` and `balanceHistory` are derived data. The hub recomputes them from
decisions and rolls at every settle and overwrites whatever is stored, so a drifted
or hand-edited client value never survives a round.

### `sessions/{sessionId}/roster/{uid}`

Readable by the teacher and the observer only. Written once at join.

```js
{
  uid: "...",
  email: "student@greermiddlecollege.org",
  accountName: "Jordan Smith"     // from Google
}
```

### `sessions/{sessionId}/rolls/{game}_{round}`

Written once, by the teacher hub, at `rolling`.

```js
{
  game: 1,
  round: 3,
  directionDie: 2,
  direction: "down",              // down if 1 or 2, up if 3 to 6
  amountDice: [5, 6, 4],
  amount: 15,
  doubled: false,
  effectiveAmount: 15,            // amount, or amount * 2 on a double round
  rolledAt: Timestamp
}
```

Rolls are the record of truth for the counterfactual calculation.

### `sessions/{sessionId}/decisions/{uid}_{game}_{round}`

```js
{
  uid: "...",
  game: 1,
  round: 3,
  choice: "IN",                   // IN | OUT
  decidedAt: Timestamp,           // always before the roll, structurally
  wasTeamRound: false
}
```

The timestamp ordering is what makes cheating impossible. A decision cannot be
written after `locked`.

### `sessions/{sessionId}/responses/{uid}_{game}_{round}`

CER writing at checkpoint rounds, plus the exit ticket.

```js
{
  uid: "...",
  game: 1,                        // 0 for the exit ticket
  round: 3,                       // 0 for the exit ticket
  kind: "checkpoint",             // checkpoint | chosen | exit
  decision: "IN",
  text: "I stayed IN because...",
  submittedAt: Timestamp,
  assessmentState: "pending",     // pending | done | degraded
  selfLevel: null,                // set by the student on the degraded path
  selfNote: null
}
```

`degraded` means the assessor failed and the student self-assessed.

### `sessions/{sessionId}/feedback/{responseId}`

Written by the Worker. Read by the student who owns it and by the teacher.

```js
{
  responseId: "...",
  uid: "...",
  level: 3,                       // 1 to 4, from the AI
  teacherLevel: null,             // override, wins when set
  why: "Clear claim and real evidence...",
  suggestedEdit: "Try naming the choice you did not make.",
  spotlightNominee: true,
  spotlightReason: "Uses the 4 of 6 odds and weighs going OUT.",
  model: "...",
  assessedAt: Timestamp
}
```

The student sees `teacherLevel` when it exists, otherwise `level`.

### `sessions/{sessionId}/mathEntries/{uid}_{game}_{round}`

```js
{
  uid: "...",
  game: 1,
  round: 3,
  expected: 96,
  attempts: [108, 96],            // every entry, in order
  correct: true,
  usedHint: true,
  revealed: false,                // true if shown after two misses
  settledAt: Timestamp
}
```

Mental math accuracy is its own data stream and is reported separately from
reasoning quality.

Practice rounds store their entries under `game: 0` so the teacher gets an early
read on who struggles with the arithmetic. Game 0 entries are excluded from exports
and analytics.

### `sessions/{sessionId}/teams/{teamId}`

```js
{
  teamId: "t3",
  table: "Table 3",
  members: [
    { uid: "...", preferredName: "Jo", archetype: "Reactor", cerLevel: 2, seat: 1 },
    ...
  ],
  size: 4,
  createdAt: Timestamp
}
```

### `sessions/{sessionId}/probes/{uid}`

The post-round-4 probe in Game 2.

```js
{
  uid: "...",
  overruled: true,
  round: 3,
  wouldHaveDone: "OUT",
  why: "I thought we were due for a drop...",
  counterfactualValue: 1,         // what their call was worth
  actualValue: -12,               // what the team's call was worth
  submittedAt: Timestamp
}
```

### `sessions/{sessionId}/peerAssignments/{uid}`

Written by the teacher hub when peer scoring starts. This is the only way a student
ever sees another student's writing, and the text is copied in rather than linked, so
no student can query the responses collection.

```js
{
  uid: "...",
  items: [
    { anonId: "A", text: "I went OUT because..." },
    { anonId: "B", text: "I stayed IN because..." }
  ]
}
```

No author identity, anywhere in this document.

### `sessions/{sessionId}/peerReviews/{uid}_{anonId}`

```js
{
  reviewerUid: "...",
  anonId: "A",
  sourceResponseId: "...",        // teacher side only, never sent to the client
  level: 2,
  note: "There is a reason but no fact from the game.",
  submittedAt: Timestamp
}
```

### `sessions/{sessionId}/biasSurveys/{uid}_{pushId}`

```js
{
  uid: "...",
  pushId: "push-1",
  selected: ["loss-aversion", "herding"],
  strongest: "herding",
  sentence: "My team went IN and I wanted OUT...",
  submittedAt: Timestamp
}
```

---

## Security rules

Three roles: teacher, observer, student. Identified by email, not by a claim, because
this is a one-classroom deployment and custom claims are not worth the setup.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isTeacher() {
      return request.auth != null
        && request.auth.token.email == 'bweaver@greermiddlecollege.org';
    }

    function isObserver() {
      return request.auth != null
        && request.auth.token.email == 'jlowman@greermiddlecollege.org';
    }

    function isMine(uid) {
      return request.auth != null && request.auth.uid == uid;
    }

    match /sessions/{sessionId} {
      function sess() {
        return get(/databases/$(database)/documents/sessions/$(sessionId)).data;
      }

      allow read: if request.auth != null;
      allow write: if isTeacher();

      match /players/{uid} {
        allow read: if request.auth != null;
        // joining is gated: the roster locks once class is running, and
        // anonymous users are accepted only while the fallback is enabled
        allow create: if isTeacher() || (isMine(uid)
          && sess().joinLocked == false
          && (sess().allowAnonymous == true
              || ('email' in request.auth.token
                  && request.auth.token.email.matches('.*@greermiddlecollege[.]org'))));
        // students edit identity and settings, never their own money:
        // balance and balanceHistory are derived data the hub recomputes
        allow update: if isTeacher() || (isMine(uid)
          && request.resource.data.diff(resource.data).affectedKeys()
             .hasOnly(['preferredName', 'emoji', 'accentColor', 'dyslexiaFont']));
        allow delete: if isTeacher();
      }

      match /roster/{uid} {
        allow read: if isTeacher() || isObserver();
        allow create: if isMine(uid) || isTeacher();
        allow update, delete: if isTeacher();
      }

      match /rolls/{rollId} {
        allow read: if request.auth != null;
        allow write: if isTeacher();
      }

      match /decisions/{docId} {
        allow read: if isTeacher() || isObserver()
          || (request.auth != null && resource.data.uid == request.auth.uid);
        // writable only while the round is open, only for the current round,
        // and only under a doc id that matches the author and the round, so a
        // decision can never be backdated, pre-placed for a future round, or
        // written under someone else's key
        allow create: if isTeacher() || (isMine(request.resource.data.uid)
          && sess().roundState == 'decide'
          && request.resource.data.game == sess().game
          && request.resource.data.round == sess().round
          && request.resource.data.choice in ['IN', 'OUT']
          && docId.split('_')[0] == request.auth.uid
          && int(docId.split('_')[1]) == sess().game
          && int(docId.split('_')[2]) == sess().round);
        allow update, delete: if isTeacher();
      }

      match /responses/{docId} {
        allow read: if isTeacher() || isObserver()
          || (request.auth != null && resource.data.uid == request.auth.uid);
        allow create: if isMine(request.resource.data.uid);
        // the degraded path: a student records a self-assessment on their own
        // response and can touch nothing else, the text included
        allow update: if isTeacher() || (isMine(resource.data.uid)
          && request.resource.data.diff(resource.data).affectedKeys()
             .hasOnly(['assessmentState', 'selfLevel', 'selfNote']));
      }

      match /feedback/{docId} {
        // students read only their own feedback
        allow read: if isTeacher() || isObserver()
          || (request.auth != null && resource.data.uid == request.auth.uid);
        allow write: if isTeacher();   // the Worker writes with admin credentials
      }

      match /mathEntries/{docId} {
        allow read: if isTeacher() || isObserver()
          || (request.auth != null && resource.data.uid == request.auth.uid);
        allow create, update: if isMine(request.resource.data.uid) || isTeacher();
      }

      match /teams/{teamId} {
        allow read: if request.auth != null;
        allow write: if isTeacher();
      }

      match /probes/{uid} {
        allow read: if isTeacher() || isObserver() || isMine(uid);
        allow create, update: if isMine(uid);
      }

      match /peerAssignments/{uid} {
        // the only path by which a student sees another student's text
        allow read: if isMine(uid) || isTeacher();
        allow write: if isTeacher();
      }

      match /peerReviews/{docId} {
        allow read: if isTeacher() || isObserver();
        allow create: if isMine(request.resource.data.reviewerUid);
      }

      match /biasSurveys/{docId} {
        allow read: if isTeacher() || isObserver();
        allow create, update: if isMine(request.resource.data.uid);
      }
    }
  }
}
```

### Notes on the rules

- **Observers read, never write.** Every observer permission is read-only. There is
  no path by which the observer view can change anything.
- **Students never read another student's writing** except through their own
  `peerAssignments` document, where the text is anonymized and copied.
- **A decision cannot be backdated, pre-placed, or misfiled.** The create rule
  checks that the session is in `decide` state, that the decision names the current
  game and round, and that the document id matches the author and the round. A
  decision written after the roll, written for a future round, or written under
  someone else's key is rejected by the database, not by the client.
- **Balances are derived.** The hub recomputes every balance from decisions and
  rolls at each settle and overwrites the stored values, so no client write to a
  balance survives a round.
- **No decision at the lock means OUT.** The hub records it with a `defaulted` flag
  during recompute, so an absent student never stalls a round.
- **Real names live in `roster`,** which students cannot read. The player document
  holds only what every screen may show.
- **Session ids are unguessable,** and anonymous auth stays off unless the teacher
  turns it on, so an outsider holding the public Firebase config has nothing to
  read and no way to join.
- **All meaningful timestamps are server timestamps.** Client clocks are
  display-only.
- **The Worker writes feedback with admin credentials,** bypassing rules. It never
  runs in a browser.
- **Class-code fallback** uses anonymous auth. Those users have a uid but no school
  email, so they pass `isMine` and fail `isTeacher` and `isObserver`, which is
  correct.

---

## Indexes

Only two composite indexes are needed:

- `responses` on `game` ascending, `submittedAt` ascending, for the teacher hub feed.
- `responses` on `assessmentState` ascending, `submittedAt` ascending, for the
  assessor retry queue.

---

## Reset between sections

2B and 4B are separate session documents. Nothing is shared, nothing is cleared, and
both remain readable after the day for export. Create 4B's session before 2B starts,
so no setup happens between periods.
