# Overnight notes

Written by the overnight build run. Updated after every step.

## Do this first in the morning

1. **Add `www.coachw.club` to Firebase authorized domains.** Firebase console, Authentication, Settings, Authorized domains. GitHub Pages for this account serves from the custom domain `www.coachw.club`, not `grannyconger.github.io`. Google sign-in fails on an unlisted domain. Class-code sign-in works without it.

## Live URLs

- Student view: https://www.coachw.club/roll-with-the-market/
- Status: in progress

## Progress

- Step 1: done before the run. Pushed at 2:13am. GitHub Pages enabled from main at root, HTTPS enforced.
- Steps 2 to 6: done. Phase machine, join flow, game loop, Game 1 with CER, teacher hub, display, assessor Worker.
- Steps 7 to 9 and the bias survey: built inside the step 3 to 6 commits. Archetypes and teams in `src/game.js`, Game 2 probe, counterfactual, peer scoring, and survey in the student view and hub.
- Step 10: observer view built at `observer.html`. Read-only, aggregates only, no student names. Shows objective and standard, current phase with time on task, design intent, participation on the open prompt, CER distribution by game, Game 1 to Game 2 growth, feedback reach, and mental math accuracy. Without a `?s=` link it lists today's sessions. Not yet checked in a browser while signed in as the observer. Use the Observer link on the teacher hub.

## Next

- Step 11, exports: already present in `src/teacher/exports.js`. Needs a check against a real session.
- Step 12: dyslexia font pass on every screen, both font states.
- Step 13: dry run.
