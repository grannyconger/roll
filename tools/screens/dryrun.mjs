// Local dry run. Runs the real teacher hub, display, observer, and seven student
// views against the Firebase emulator, with the real firestore.rules, through
// the whole lesson. Clicks what the teacher and students would click.
//
// Needs the emulators running, from the project root:
//   firebase emulators:start --config firebase.emulator.json --only firestore,auth
// Then:
//   cd tools/screens && node dryrun.mjs
//
// The assessor Worker is replaced by a local stand-in that writes feedback to
// the emulator, except for one student whose scoring always fails, to exercise
// the self-assessment fallback. Nothing here touches the real Firebase project.
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(HERE, "out-dryrun");
const PORT = 8767;
const PROJECT = "roll-with-the-market";
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const FB = "https://www.gstatic.com/firebasejs/10.12.2";
const START = Date.now();

// ---------- log ----------
const log = [];
const problems = [];
function note(msg) { const line = `${((Date.now() - START) / 1000).toFixed(0).padStart(4)}s  ${msg}`; log.push(line); console.log(line); }
function problem(msg) { problems.push(msg); note("PROBLEM: " + msg); }
function check(ok, msg) { if (ok) note("ok: " + msg); else problem(msg); return ok; }

// ---------- emulator REST, as the owner, bypassing rules ----------
const OWNER = { Authorization: "Bearer owner", "Content-Type": "application/json" };
function decode(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return Date.parse(v.timestampValue);
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decode);
  if ("mapValue" in v) return fields(v.mapValue.fields || {});
  return null;
}
function fields(f) { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = decode(v); return o; }
function encode(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (typeof v === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) } };
  return { stringValue: String(v) };
}
async function getDoc(p) {
  const res = await fetch(`${FS}/${p}`, { headers: OWNER });
  if (res.status === 404) return null;
  return fields((await res.json()).fields);
}
async function list(p) {
  const res = await fetch(`${FS}/${p}?pageSize=1000`, { headers: OWNER });
  const j = await res.json();
  return (j.documents || []).map(d => ({ id: d.name.split("/").pop(), ...fields(d.fields) }));
}
async function patch(p, data) {
  const mask = Object.keys(data).map(k => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
  await fetch(`${FS}/${p}?${mask}`, { method: "PATCH", headers: OWNER, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)])) }) });
}
async function wipeEmulator() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
}

// ---------- static server, with firebase.js pointed at the emulator ----------
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const EMULATOR_PATCH = `
import { connectAuthEmulator as __connectAuth } from "${FB}/firebase-auth.js";
import { connectFirestoreEmulator as __connectFs } from "${FB}/firebase-firestore.js";
__connectAuth(auth, "http://127.0.0.1:9099", { disableWarnings: true });
__connectFs(db, "127.0.0.1", 8080);
`;
function serve() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    let body = fs.readFileSync(file);
    if (url.pathname === "/src/firebase.js") body = body.toString() + EMULATOR_PATCH;
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  }).listen(PORT);
}

// ---------- the stand-in assessor ----------
let SID = null;
let SLOW_UID = null;            // this student's scoring always fails
const assessed = new Set();
async function fakeAssess(body) {
  if (!body || body.sessionId !== SID) return { status: 400, json: { error: "bad request" } };
  const r = await getDoc(`sessions/${SID}/responses/${body.responseId}`);
  if (!r) return { status: 404, json: { error: "response not found" } };
  if (r.uid === SLOW_UID) return { status: 502, json: { error: "assessor failed" } };
  await new Promise(res => setTimeout(res, 1200));
  const len = (r.text || "").length;
  const level = len > 160 ? 4 : len > 90 ? 3 : len > 40 ? 2 : 1;
  await patch(`sessions/${SID}/feedback/${body.responseId}`, {
    responseId: body.responseId, uid: r.uid, level,
    why: "Stand-in feedback from the dry run.", suggestedEdit: "Try: name the choice you did not make.",
    spotlightNominee: level >= 3, spotlightReason: level >= 3 ? "Uses a fact from the game." : null, model: "dry-run", assessedAt: new Date()
  });
  if (r.assessmentState === "pending") await patch(`sessions/${SID}/responses/${body.responseId}`, { assessmentState: "done" });
  assessed.add(body.responseId);
  return { status: 200, json: { level } };
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
async function routeAll(route) {
  const req = route.request();
  const u = new URL(req.url());
  if (u.host === `localhost:${PORT}` || u.host === "127.0.0.1:8080" || u.host === "127.0.0.1:9099") return route.continue();
  if (u.host === "www.gstatic.com" || u.host.startsWith("fonts.")) return route.continue();
  if (u.host.endsWith("workers.dev")) {
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (u.pathname === "/time") return route.fulfill({ headers: CORS, contentType: "application/json", body: JSON.stringify({ now: Date.now() }) });
    if (u.pathname === "/health") return route.fulfill({ headers: CORS, contentType: "application/json", body: JSON.stringify({ ok: true, model: "dry-run", latencyMs: 5 }) });
    if (u.pathname === "/assess") {
      let body = null;
      try { body = JSON.parse(req.postData() || "null"); } catch (e) {}
      const out = await fakeAssess(body);
      return route.fulfill({ status: out.status, headers: CORS, contentType: "application/json", body: JSON.stringify(out.json) });
    }
  }
  return route.abort();
}

// ---------- browser helpers ----------
let browser;
const pages = [];
async function openPage(label, file, ctx) {
  ctx = ctx || await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: "reduce", acceptDownloads: true });
  await ctx.route("**/*", routeAll);
  const page = await ctx.newPage();
  watchErrors(page, label);
  await page.goto(`http://localhost:${PORT}/${file}`, { waitUntil: "domcontentloaded" });
  pages.push({ label, page });
  return page;
}
function watchErrors(page, label) {
  page.on("pageerror", e => problem(`${label}: page error: ${String(e.message || e).split("\n")[0]}`));
  page.on("console", m => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    const t = m.text();
    if (/favicon|Failed to load resource: net::ERR_FAILED|ERR_BLOCKED|wayground/i.test(t)) return;
    if (/permission|insufficient|denied|FirebaseError|watch failed/i.test(t)) problem(`${label}: ${t.slice(0, 200)}`);
    else if (m.type() === "error") note(`${label} console: ${t.slice(0, 160)}`);
  });
}
async function signIn(page, user) {
  await page.evaluate(async ({ u, fb }) => {
    const { auth } = await import("/src/firebase.js");
    const { GoogleAuthProvider, signInWithCredential } = await import(fb + "/firebase-auth.js");
    await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: u.sub, email: u.email, email_verified: true, name: u.name })));
  }, { u: user, fb: FB });
}
const text = async page => (await page.locator("body").innerText()).replace(/\s+/g, " ");
async function waitText(page, pattern, label, timeout = 20000) {
  try {
    await page.waitForFunction(p => new RegExp(p).test(document.body.innerText.replace(/\s+/g, " ")), pattern.source, { timeout });
    return true;
  } catch (e) {
    const t = await text(page);
    problem(`${label}: never showed /${pattern.source}/. Showing: ${t.slice(t.indexOf("Dyslexia font") > 0 ? t.indexOf("Dyslexia font") + 14 : 0).slice(0, 400)}`);
    try { await shot(page, "fail-" + label.replace(/[^a-z0-9]+/gi, "-").slice(0, 60)); } catch (x) {}
    return false;
  }
}
async function shot(page, name) { await page.screenshot({ path: path.join(OUT, name + ".png") }); }

// ---------- teacher ----------
let teacher, display, observer;
async function primaryLabel() { return (await teacher.locator(".btn.primary").innerText()).trim(); }
async function primary(pattern) {
  try {
    await teacher.waitForFunction(p => {
      const b = document.querySelector(".btn.primary");
      return b && !b.disabled && new RegExp(p).test(b.textContent.trim());
    }, pattern.source, { timeout: 25000 });
  } catch (e) { problem(`teacher: primary button never read /${pattern.source}/, it reads "${await primaryLabel()}"`); throw e; }
  const label = await primaryLabel();
  note(`teacher clicks: ${label}`);
  await teacher.locator(".btn.primary").click();
  await teacher.waitForFunction(old => { const b = document.querySelector(".btn.primary"); return b && !b.disabled && b.textContent.trim() !== old; }, label, { timeout: 25000 })
    .catch(() => {});
}
async function teacherToggle(namePrefix) {
  await teacher.locator("button.toggle", { hasText: namePrefix }).first().click();
  await teacher.waitForTimeout(500);
}
async function session() { return getDoc(`sessions/${SID}`); }
async function waitSession(fn, label, timeout = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const s = await session(); if (fn(s)) return s; await new Promise(r => setTimeout(r, 300)); }
  problem(`session never reached: ${label}`);
  return session();
}

// ---------- students ----------
const STUDENTS = [
  { name: "Holder", plan: "IN" },
  { name: "Sideliner", plan: "OUT", slow: true },
  { name: "Timer", plan: "ALT" },
  { name: "Reactor", plan: "REACT" },
  { name: "Random", plan: "RANDOM", mathSlip: true },
  { name: "Absent", plan: "IN", absent: ["1_2", "2_6"], mathMissTwice: "1_3" },
  { name: "Lateanon", plan: "RANDOM", late: true }
];
STUDENTS.forEach((s, i) => { s.i = i; s.email = `dryrun.${s.name.toLowerCase()}@greermiddlecollege.org`; s.sub = "dry-" + s.name.toLowerCase(); });
const active = () => STUDENTS.filter(s => s.page);

async function joinStudent(s, viaClassCode) {
  s.ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: "reduce" });
  s.page = await openPage("student " + s.name, "index.html", s.ctx);
  await waitText(s.page, /Enter the class code/, s.name);
  const code = (await session()).classCode;
  await s.page.locator("#code").fill(code);
  await s.page.getByRole("button", { name: "Join", exact: true }).click();
  await waitText(s.page, /Join the class/, s.name);
  await s.page.locator("#pname").fill(s.name);
  await s.page.locator("#plast").fill("Dryrun");
  await s.page.locator(".emoji").nth(s.i).click();
  await s.page.locator(".swatch").nth(s.i % 8).click();
  await s.page.getByRole("button", { name: "Join", exact: true }).click();
  await waitText(s.page, /Objective:/, s.name);
  s.uid = await s.page.evaluate(async () => (await import("/src/firebase.js")).auth.currentUser.uid);
  note(`${s.name} joined as ${s.uid.slice(0, 8)}`);
}

const lastResult = {};        // uid -> value of last round, for the reactor
function choiceFor(s, game, round) {
  const prevLoss = (lastResult[s.uid] || 0) < 0;
  switch (s.plan) {
    case "IN": return "IN";
    case "OUT": return "OUT";
    case "ALT": return round % 2 ? "IN" : "OUT";
    case "REACT": { const prev = s.lastChoice || "IN"; return prevLoss ? (prev === "IN" ? "OUT" : "IN") : prev; }
    default: return Math.random() < 0.6 ? "IN" : "OUT";
  }
}

async function studentDecides(s, game, round) {
  const p = s.page;
  if ((s.absent || []).includes(`${game}_${round}`)) { note(`${s.name} does not decide in G${game} R${round}`); return; }
  if (!await waitText(p, /Pick IN or OUT/, `${s.name} G${game} R${round}`)) return;
  const choice = choiceFor(s, game, round);
  s.lastChoice = choice;
  await p.getByRole("button", { name: choice, exact: true }).click();
  if (s.name === "Holder" && game === 1 && round === 2) await p.getByRole("button", { name: "Add a reason this round" }).click();
  const box = p.locator("textarea");
  if (await box.count()) {
    const long = "I picked " + choice + " because four of the six faces on the direction die are bull, so up is more likely. Three dice average about 10.5, so IN averages about plus $3.50 against a certain $1 for OUT.";
    const mid = "I picked " + choice + " because the market went up two of the last three rounds and I want to keep my gains.";
    await box.first().fill(s.i % 2 ? mid : long);
    s.wrote = (s.wrote || 0) + 1;
  }
  await p.getByRole("button", { name: "Lock in" }).click();
  await waitText(p, /Locked in\. Wait for the roll/, `${s.name} lock in G${game} R${round}`);
  // after a written response, answer the Sparkle Points challenge
  if (game > 0 && await p.locator(".quiz .option-btn").count()) {
    for (let q = 0; q < 3; q++) {
      const opt = p.locator(".quiz .option-btn").first();
      if (!await opt.count()) break;
      await opt.click();
      await p.locator(".quiz-result").waitFor({ timeout: 4000 }).catch(() => problem(`${s.name} quiz answer showed no result`));
      await p.locator(".quiz .btn").click();
    }
    if (!/That is all three for now/.test(await text(p))) problem(`${s.name} quiz did not finish after three answers in G${game} R${round}`);
    else s.quizzed = (s.quizzed || 0) + 3;
  }
}

function valueOf(choice, roll) { return choice !== "IN" ? 1 : (roll.direction === "up" ? roll.effectiveAmount : -roll.effectiveAmount); }

async function studentComputes(s, game, round, roll) {
  const p = s.page;
  const d = await getDoc(`sessions/${SID}/decisions/${s.uid}_${game}_${round}`);
  if (!d || d.defaulted) return;
  const player = await getDoc(`sessions/${SID}/players/${s.uid}`);
  const expected = player.balance + valueOf(d.choice, roll);
  lastResult[s.uid] = valueOf(d.choice, roll);
  if (!await waitText(p, /Enter your new balance/, `${s.name} impact modal G${game} R${round}`)) return;
  const input = p.locator("input[type=number]");
  const missTwice = s.mathMissTwice === `${game}_${round}`;
  const slip = missTwice || (s.mathSlip && round % 3 === 0);
  if (slip) {
    await input.fill(String(expected + 10));
    await p.getByRole("button", { name: "Check" }).click();
    await waitText(p, /Check the setup/, `${s.name} hint after a wrong balance`);
  }
  if (missTwice) {
    await p.locator("input[type=number]").fill(String(expected - 10));
    await p.getByRole("button", { name: "Check" }).click();
    await waitText(p, new RegExp(`Your new balance is \\$${expected}|Round over`), `${s.name} reveal after two misses`);
  } else {
    await p.locator("input[type=number]").fill(String(expected));
    await p.getByRole("button", { name: "Check" }).click();
    // the last student in may see the round settle before the confirmation shows
    await waitText(p, new RegExp(`Correct\\. Your new balance is \\$${expected}|Round over`), `${s.name} correct balance G${game} R${round}`);
  }
  let m = null;
  for (let i = 0; i < 20 && !(m && (m.correct || m.revealed)); i++) {
    m = await getDoc(`sessions/${SID}/mathEntries/${s.uid}_${game}_${round}`);
    if (!(m && (m.correct || m.revealed))) await new Promise(r => setTimeout(r, 200));
  }
  if (!(m && (m.correct || m.revealed))) problem(`${s.name} balance entry not saved G${game} R${round}`);
  // the round may settle and close the modal before Continue is clicked
  await p.getByRole("button", { name: "Continue" }).click({ timeout: 1500 }).catch(() => {});
}

// Independent balance check: rebuild every balance from decisions and rolls.
async function verifyBalances(game, round, label) {
  const [players, decisions, rolls] = await Promise.all([list(`sessions/${SID}/players`), list(`sessions/${SID}/decisions`), list(`sessions/${SID}/rolls`)]);
  let bad = 0;
  for (const p of players) {
    const late = p.lateStart && p.lateStart.game === game ? p.lateStart : null;
    let bal = late ? late.balance : 100;
    for (let r = late ? late.round : 1; r <= round; r++) {
      const roll = rolls.find(x => x.game === game && x.round === r);
      if (!roll) continue;
      const d = decisions.find(x => x.uid === p.uid && x.game === game && x.round === r);
      bal += valueOf(d ? d.choice : "OUT", roll);
    }
    if (bal !== p.balance) { bad++; problem(`${label}: ${p.preferredName} stored $${p.balance}, rebuilt $${bal}`); }
  }
  if (!bad) note(`ok: ${label}, all ${players.length} balances match a rebuild from decisions and rolls`);
}

async function playRound(game, round, { first } = {}) {
  note(`--- Game ${game}, round ${round}`);
  await waitSession(s => s.game === game && s.round === round && s.roundState === "decide", `G${game} R${round} decide`);
  if (round === 1 && game === 1) await shot(display, "display-g1-r1-decide");
  await Promise.all(active().map(s => studentDecides(s, game, round)));
  const dispCount = await text(display);
  check(/of \d+ decided/.test(dispCount), `display shows a decided counter in G${game} R${round}`);
  await primary(/^Lock decisions/);
  const defaulted = (await list(`sessions/${SID}/decisions`)).filter(d => d.game === game && d.round === round && d.defaulted);
  const expectedDefaults = active().filter(s => (s.absent || []).includes(`${game}_${round}`)).length;
  check(defaulted.length === expectedDefaults, `G${game} R${round}: ${defaulted.length} defaulted OUT, expected ${expectedDefaults}`);
  await primary(/^Roll the dice/);
  await waitText(display, /(Up, bull|Down, bear)/, `display roll G${game} R${round}`);
  for (const s of active()) {
    const t = await text(s.page);
    if (/Up, bull|Down, bear|doubled/.test(t)) problem(`${s.name} saw the result before the reveal`);
  }
  if (game === 1 && round === 5) await shot(display, "display-g1-r5-roll");
  await primary(/^Rolling\. Reveal now/);
  const roll = await getDoc(`sessions/${SID}/rolls/${game}_${round}`);
  check(roll.doubled === (game === 1 ? round === 5 : game === 2 ? round === 7 : false), `G${game} R${round} doubled flag is ${roll.doubled}`);
  await Promise.all(active().map(s => studentComputes(s, game, round, roll)));
  await waitSession(s => s.roundState === "settled", `G${game} R${round} settled by itself once every balance was in`);
  await verifyBalances(game, round, `G${game} R${round}`);
}

// ---------- the lesson ----------
async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  await wipeEmulator();
  const server = serve();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    await lesson();
  } catch (e) {
    problem("run stopped: " + String(e.message || e).split("\n")[0]);
  } finally {
    for (const { label, page } of pages) { try { await shot(page, "final-" + label.replace(/\s+/g, "-")); } catch (e) {} }
    await browser.close();
    server.close();
    const report = ["# Dry run", "", `Ran ${((Date.now() - START) / 60000).toFixed(1)} minutes. ${problems.length} problems.`, "", "## Problems", "", ...(problems.length ? problems.map(p => "- " + p) : ["None."]), "", "## Log", "", "```", ...log, "```"].join("\n");
    fs.writeFileSync(path.join(OUT, "report.md"), report);
    console.log(`\n${problems.length} problems. Report: tools/screens/out-dryrun/report.md`);
  }
}

async function lesson() {
  // teacher signs in and creates a session
  const tctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", acceptDownloads: true });
  teacher = await openPage("teacher", "teacher.html", tctx);
  await waitText(teacher, /Sign in with Google/, "teacher");
  await signIn(teacher, { sub: "dry-teacher", email: "bweaver@greermiddlecollege.org", name: "B Weaver" });
  await waitText(teacher, /Pick a class session/, "teacher picker");
  await teacher.getByRole("button", { name: "New 2B session" }).click();
  await teacher.waitForURL(/\?s=/);
  SID = new URL(teacher.url()).searchParams.get("s");
  note(`session ${SID} created`);
  await waitText(teacher, /2B hub/, "teacher hub");

  display = await openPage("display", `display.html?s=${SID}`, tctx);
  await waitText(display, /joined/, "display lobby");

  const octx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  observer = await openPage("observer", `observer.html?s=${SID}`, octx);
  await waitText(observer, /Sign in with Google/, "observer");
  await signIn(observer, { sub: "dry-observer", email: "jlowman@greermiddlecollege.org", name: "J Lowman" });
  await waitText(observer, /Objective:/, "observer view");

  // a stranger with a school account is not the observer
  const xctx = await browser.newContext();
  const stranger = await openPage("stranger on observer", `observer.html?s=${SID}`, xctx);
  await signIn(stranger, { sub: "dry-stranger", email: "someone@greermiddlecollege.org", name: "Someone" });
  check(await waitText(stranger, /observer account only/, "stranger on observer"), "observer view turns away a non-observer account");
  await xctx.close();

  // six students join with school accounts
  for (const s of STUDENTS.filter(x => !x.late)) await joinStudent(s, false);
  SLOW_UID = STUDENTS.find(s => s.slow).uid;
  check(await waitText(display, /6 joined/, "display lobby"), "display lobby counts 6 joined");

  await primary(/^Show the agenda/);
  await waitText(STUDENTS[0].page, /Read the agenda/, "student agenda");
  await primary(/^Start the vocab warm up/);
  await waitText(STUDENTS[0].page, /Open Wayground/, "student warm up");
  await primary(/^Start Learn to Play/);
  while (/^Show rule/.test(await primaryLabel())) await primary(/^Show rule/);
  await primary(/^Start practice round 1/);
  for (let r = 1; r <= 3; r++) {
    await playRound(0, r);
    if (r < 3) await primary(/^Start practice round/);
  }
  const practiceMath = (await list(`sessions/${SID}/mathEntries`)).filter(m => m.game === 0);
  check(practiceMath.length > 0, `practice math stored under game 0 (${practiceMath.length} entries)`);

  await primary(/^Start Game 1/);
  const afterReset = await list(`sessions/${SID}/players`);
  check(afterReset.every(p => p.balance === 100), "every balance reset to $100 for Game 1");

  for (let r = 1; r <= 6; r++) {
    if (r === 3) {
      // a late joiner arrives through the class code
      await joinStudent(STUDENTS.find(s => s.late), true);
      let late = null;
      for (let i = 0; i < 25 && !late; i++) { late = await getDoc(`sessions/${SID}/players/${STUDENTS[6].uid}`); if (!late) await new Promise(r => setTimeout(r, 200)); }
      if (!late) { problem("late joiner's player record never reached the server, the join write was refused"); throw new Error("late join failed"); }
      const s = await session();
      check(late.joinedLate === true && late.balance === Math.round(s.classAverageBalance), `late joiner starts at the class average, $${late.balance}`);
    }
    if (r === 4) {
      // a laptop dies and the student signs back in
      const s = STUDENTS[2];
      const before = await getDoc(`sessions/${SID}/players/${s.uid}`);
      await s.page.close();
      s.page = await s.ctx.newPage();
      watchErrors(s.page, "student Timer, rejoined");
      await s.page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
      await waitText(s.page, /Objective:/, "rejoin restores the session");
      check((await text(s.page)).includes(`$${before.balance}`), `rejoined student sees their balance, $${before.balance}`);
      pages.push({ label: "student Timer rejoined", page: s.page });
    }
    await playRound(1, r);
    if (r < 6) await primary(/^Start round/);
  }
  const g1Written = (await list(`sessions/${SID}/responses`)).filter(r => r.game === 1);
  for (const s of STUDENTS.filter(x => !x.late)) {
    const n = g1Written.filter(r => r.uid === s.uid).length;
    const expected = 4;
    check(n === expected, `${s.name} has ${n} Game 1 responses, expected ${expected}`);
  }
  await shot(observer, "observer-game1");
  check(/of 7/.test(await text(observer)) || /7 students/.test(await text(observer)), "observer counts all 7 students");

  await primary(/^End Game 1/);
  await waitText(STUDENTS[0].page, /Game 1 is over/, "student game over");
  await primary(/^Show Game 1 feedback/);
  await waitText(STUDENTS[0].page, /Level \d/, "student sees AI feedback");
  const slow = STUDENTS.find(s => s.slow);
  if (await waitText(slow.page, /Score your own response/, "slow student self-assessment after 20 seconds", 40000)) {
    await slow.page.locator(".fb").filter({ hasText: "Score your own response" }).first().locator(".level-btn").nth(2).click();
    await slow.page.getByRole("button", { name: "Save my score" }).first().click();
    await waitText(slow.page, /Your score: Level 2/, "self-assessment saved");
  }
  const health = (await session()).assessorHealth;
  note(`assessor light during feedback: ${health}`);
  await shot(teacher, "teacher-feedback");

  await primary(/^Start the CER lesson/);
  let polls = 0;
  for (let i = 0; i < 40 && /^Next:|^Reveal/.test(await primaryLabel()); i++) {
    if (/Everyone answers/.test(await text(STUDENTS[0].page)) && /^Reveal/.test(await primaryLabel())) {
      polls++;
      await Promise.all(active().map(async s => {
        const b = s.page.locator(".option-btn").nth(s.i % 2);
        await b.click({ timeout: 5000 }).catch(() => problem(`${s.name} could not answer CER poll ${polls}`));
        await waitText(s.page, /Answer locked/, `${s.name} poll answer locked`);
      }));
      await waitText(display, new RegExp(`${active().length} of ${active().length} answered`), "display counts every poll answer");
      await primary(/^Reveal the answer/);
      await waitText(STUDENTS[0].page, /Correct\. \+3|Not this time/, "student sees the poll result");
    } else await primary(/^Next:|^Reveal/);
  }
  check(polls === 4, `CER lesson ran ${polls} polls, expected 4`);
  const cerAnswers = (await list(`sessions/${SID}/quizAnswers`)).filter(a => a.kind === "cer");
  check(cerAnswers.length === polls * active().length, `${cerAnswers.length} CER poll answers stored`);
  await primary(/^Build strategy teams/);
  const teams = await list(`sessions/${SID}/teams`);
  const sizes = teams.map(t => t.members.length).sort();
  check(JSON.stringify(sizes) === "[3,4]", `7 students made teams of ${sizes.join(" and ")}`);
  const players = await list(`sessions/${SID}/players`);
  check(players.every(p => p.archetype && p.teamId && p.seat), "every student has an archetype, a team, and a seat");
  note("archetypes: " + players.map(p => `${p.preferredName} ${p.archetype}`).join(", "));
  await waitText(STUDENTS[0].page, /Table \d, seat \d/, "student sees their table");
  await waitText(display, /Find your table/, "display seating chart");
  await shot(display, "display-seating");

  // the teacher drags one student to the other table
  const tbefore = await list(`sessions/${SID}/teams`);
  const big = tbefore.find(t => t.members.length === 4), small = tbefore.find(t => t.members.length === 3);
  const mover = big.members[0];
  const src = teacher.locator(".team-box", { hasText: big.table }).locator(".drag-name").first();
  await src.dragTo(teacher.locator(`.team-box[data-team="${small.teamId}"]`));
  let moved = null;
  for (let i = 0; i < 25; i++) { moved = await getDoc(`sessions/${SID}/players/${mover.uid}`); if (moved.teamId === small.teamId) break; await new Promise(r => setTimeout(r, 200)); }
  check(moved.teamId === small.teamId && moved.seat === 4, `drag and drop moved a student to ${small.table}, seat ${moved.seat}`);
  const tafter = await list(`sessions/${SID}/teams`);
  check(tafter.find(t => t.teamId === big.teamId).members.length === 3, "the table they left has 3 members");
  // and back again
  await teacher.locator(".team-box", { hasText: small.table }).locator(".drag-name").last().dragTo(teacher.locator(`.team-box[data-team="${big.teamId}"]`));
  await new Promise(r => setTimeout(r, 1200));
  await primary(/^Start the huddle/);
  await primary(/^Start Game 2/);
  for (let r = 1; r <= 8; r++) {
    await playRound(2, r);
    if (r <= 4) {
      const s2 = await session();
      check((s2.teamBoard || []).length === 2, `team standings written after G2 R${r}`);
      check(await waitText(display, /Table standings, average portfolio/, `display team board G2 R${r}`), `display shows team standings after G2 R${r}`);
    }
    if (r === 4) {
      await primary(/^Open the probe/);
      await Promise.all(active().map(async s => {
        const p = s.page;
        await waitText(p, /Answer honestly/, `${s.name} probe`);
        if (s.i % 2 === 0) {
          await p.getByRole("button", { name: "Yes", exact: true }).click();
          await p.getByRole("button", { name: "Round 2", exact: true }).click();
          await p.getByRole("button", { name: "OUT", exact: true }).click();
          await p.locator("#probe-why").fill("I thought it would drop after two ups.");
          await p.getByRole("button", { name: "Submit" }).click();
          await waitText(p, /You would have gone OUT in round 2\. That was \+\$1\./, `${s.name} counterfactual`);
        } else {
          await p.getByRole("button", { name: "No", exact: true }).click();
          await p.getByRole("button", { name: "Submit" }).click();
          await waitText(p, /Answer recorded/, `${s.name} probe recorded`);
        }
      }));
      check((await list(`sessions/${SID}/probes`)).length === 7, "all 7 probe answers stored");
      await primary(/^Start round 5/);
    } else if (r < 8) await primary(/^Start round/);
  }
  await primary(/^End Game 2/);

  await primary(/^Start peer scoring/);
  const map = (await getDoc(`sessions/${SID}/feedback/peer-map`)).map;
  const responses = await list(`sessions/${SID}/responses`);
  let own = 0;
  for (const [key, rid] of Object.entries(map)) { const reviewer = key.split("_")[0]; const author = responses.find(r => r.id === rid); if (author && author.uid === reviewer) own++; }
  check(own === 0, `no student was given their own response to score (${Object.keys(map).length} assignments)`);
  await Promise.all(active().map(async s => {
    for (const id of ["A", "B"]) {
      if (!await waitText(s.page, /Score this response/, `${s.name} peer score ${id}`)) return;
      await s.page.locator(".level-btn").nth(1).click();
      await s.page.locator(`#peer-${id}`).fill("There is a fact from the game but no reason it matters.");
      await s.page.getByRole("button", { name: "Submit score" }).click();
      await s.page.waitForTimeout(400);
    }
    await waitText(s.page, /Both scores submitted/, `${s.name} peer scoring done`);
  }));
  // a student tries to read the responses collection directly and must be refused
  const leak = await STUDENTS[0].page.evaluate(async () => {
    const f = await import("/src/firebase.js");
    const sid = localStorage.getItem("rwm-session");
    try { const snap = await f.getDocs(f.collection(f.db, "sessions", sid, "responses")); return "read " + snap.size; }
    catch (e) { return e.code || String(e); }
  });
  check(/permission-denied/.test(leak), `a student reading every response is refused (${leak})`);

  await primary(/^Push the bias survey/);
  await Promise.all(active().map(async s => {
    const p = s.page;
    if (!await waitText(p, /Check any trap you felt today/, `${s.name} survey`)) return;
    await p.locator("#trap-herding").check();
    await p.locator("#trap-loss-aversion").check();
    await p.getByRole("button", { name: "Herding", exact: true }).click();
    await p.locator("#survey-sentence").fill("My table went IN when I wanted OUT.");
    await p.getByRole("button", { name: "Submit" }).click();
    await p.waitForTimeout(500);
  }));
  check((await list(`sessions/${SID}/biasSurveys`)).length === 7, "all 7 survey answers stored");
  await primary(/^Start the mind traps debrief/);
  await waitText(display, /felt it/, "display debrief shows survey counts");
  await primary(/^Start the exit ticket/);
  await Promise.all(active().map(async s => {
    if (!await waitText(s.page, /A friend sells all their shares/, `${s.name} exit ticket`)) return;
    await s.page.locator("#exit-text").fill("Keep. One 10 percent drop is one bad round, and over many rounds the market goes up more often than down, so selling locks in the loss.");
    await s.page.getByRole("button", { name: "Submit" }).click();
    await waitText(s.page, /Exit ticket submitted/, `${s.name} exit submitted`);
  }));
  await primary(/^Start closure/);
  await Promise.all(active().map(async s => {
    if (!await waitText(s.page, /Can you justify/, `${s.name} closure`)) return;
    await s.page.locator("#closure-a").fill("Yes. Claim, a fact from the game, and why it matters.");
    await s.page.getByRole("button", { name: "Submit" }).click();
    await waitText(s.page, /Answers submitted/, `${s.name} closure submitted`);
  }));
  await shot(observer, "observer-end");
  const qa = await list(`sessions/${SID}/quizAnswers`);
  check(qa.filter(a => a.kind === "quiz").length > 20, `${qa.filter(a => a.kind === "quiz").length} Sparkle Points quiz answers stored`);
  // the leaderboard shows every student
  await teacherToggle("Leaderboard");
  await new Promise(r => setTimeout(r, 800));
  const boardRows = await display.locator(".board-row").count();
  check(boardRows === 7, `display leaderboard shows all ${boardRows} of 7 students`);
  await shot(display, "display-leaderboard");
  await teacherToggle("Leaderboard");
  const obsText = await text(observer);
  check(/Game 1 to Game 2/.test(obsText), "observer shows Game 1 to Game 2 growth");

  // exports
  await new Promise(r => setTimeout(r, 2500));
  const [dl] = await Promise.all([teacher.waitForEvent("download"), teacher.getByRole("button", { name: "Full CSV" }).click()]);
  const csvPath = path.join(OUT, "export.csv");
  await dl.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, "utf8").trim().split(/\r\n/);
  const written = (await list(`sessions/${SID}/responses`)).filter(r => ["checkpoint", "chosen", "exit"].includes(r.kind)).length;
  check(csv.length - 1 === written, `CSV has ${csv.length - 1} rows for ${written} written responses`);
  check(csv[0].startsWith("preferred name,account email,game,round"), "CSV header matches the spec");
  const emptyEmails = csv.slice(1).filter(l => l.split(",")[1] === "").length;
  note(`CSV rows without an account email: ${emptyEmails} (the class-code student has none)`);
  const [summary] = await Promise.all([teacher.context().waitForEvent("page"), teacher.getByRole("button", { name: "Class summary" }).click()]);
  await summary.waitForLoadState();
  const sumText = (await summary.locator("body").innerText()).replace(/\s+/g, " ");
  fs.writeFileSync(path.join(OUT, "summary.txt"), sumText);
  check(/Level 3 or higher/.test(sumText) && /Mental math/.test(sumText) && /Bias survey/.test(sumText), "class summary has every section");
  note("summary: " + sumText.slice(0, 400));
}

main();
