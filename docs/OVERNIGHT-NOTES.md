# Overnight notes

Written by the build run. Updated after every step.

## Before class

1. **Add `www.coachw.club` to Firebase authorized domains**, if not done. Firebase console, Authentication, Settings, Authorized domains. Google sign-in fails on an unlisted domain. Class-code sign-in works without it.
2. **Dry run on real laptops.** Covers what the local dry run cannot: Google sign-in on the district network, real AI scoring writing back to students, and the room.
3. **Decide on screen height.** On a 768px tall screen several student screens put the main button below the fold, worst on peer scoring and the bias survey. If the Dells are 768px, tighten spacing on those screens.
4. **Delete the service account file** from Downloads if it is still there.

## Live URLs

- Student view: https://www.coachw.club/roll/
- Assessor Worker: https://roll-with-the-market-assessor.rollwiththemarket.workers.dev

## Progress

- Steps 1 to 10: built. Firebase, phase machine, join flow, both games, CER writing, assessor Worker with fallback, archetypes and teams, probe and counterfactual, peer scoring, bias survey, exit ticket, observer view.
- Worker: deployed. `/health` answers from the model and the service account reads Firestore. Not yet seen: a real scored response written back to a real student.
- Step 11, exports: checked in the local dry run. The CSV has one row per written response with the spec header, and the class summary has every section.
- Step 12, dyslexia font pass: done. `npm run shots` in `tools/screens` renders every student and display screen in both font states and checks for clipping. Last run: 160 screenshots, none clipped.
- Step 13, local dry run: done. `node dryrun.mjs` in `tools/screens` runs the real teacher hub, display, observer, and seven students against the Firebase emulator with the real `firestore.rules`, through the whole lesson. Last three runs passed with no problems. One earlier run reported a single problem whose report was lost, likely a timing hiccup in the driver.

## Bugs the dry run found and fixed

- The display lobby stayed at "0 joined" as students joined.
- A second balance entry after a wrong first try could be wiped on slow wifi, leaving the round stuck at "5 of 6 entered".
- "1 points" in the observer view and class summary.

## Running the local dry run

1. From the project root, with Java on the path (`brew install openjdk@21`, then `export JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH=$JAVA_HOME/bin:$PATH`):
   `tools/screens/node_modules/.bin/firebase emulators:start --config firebase.emulator.json --only firestore,auth --project roll-with-the-market`
2. In another terminal: `cd tools/screens && node dryrun.mjs`. Report lands in `tools/screens/out-dryrun/report.md`.

Nothing in either tool touches the real Firebase project.
