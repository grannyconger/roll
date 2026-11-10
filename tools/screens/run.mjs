// Screenshot harness. Renders every screen of the student view and the display
// in both font states, against fake data, with no Firebase and no sign-in.
//
//   cd tools/screens && npm install && npm run shots
//   npm run shots -- display        only scenarios whose name or view matches
//
// Output goes to tools/screens/out: one PNG per screen and font, a side by
// side pair per screen, and report.md listing layout problems found.
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baseDocs, addHistory, addClassWork, addSurveys, addResponse, historyFor, path as fp, SID, TEXT } from "./fixture.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(HERE, "out");
const PORT = 8766;
const MOCK = fs.readFileSync(path.join(HERE, "mock-firebase.js"), "utf8");
const filter = process.argv[2] || "";

const VIEWS = {
  student: { page: "index.html", viewport: { width: 1366, height: 768 }, fullPage: true, user: { uid: "u1", email: "maximiliano@greermiddlecollege.org", displayName: "Maximiliano Student", isAnonymous: false } },
  display: { page: "display.html", viewport: { width: 1920, height: 1080 }, fullPage: false, user: { uid: "teacher", email: "bweaver@greermiddlecollege.org", displayName: "Teacher", isAnonymous: false } },
  teacher: { page: "teacher.html", viewport: { width: 1440, height: 900 }, fullPage: false, oneFont: true, user: { uid: "teacher", email: "bweaver@greermiddlecollege.org", displayName: "Teacher", isAnonymous: false } },
  observer: { page: "observer.html", viewport: { width: 1440, height: 900 }, fullPage: true, oneFont: true, user: { uid: "obs", email: "jlowman@greermiddlecollege.org", displayName: "Observer", isAnonymous: false } }
};

const SD = ["student", "display"];
const soon = { __ts: 90 };
const round = (phase, game, r, state, extra = {}) => ({ phase, game, round: r, roundState: state, roundEndsAt: state === "decide" ? soon : null, ...extra });
const clickText = text => async page => { await page.getByRole("button", { name: text, exact: true }).first().click(); };
const clickButtonsNamed = (...names) => async page => { for (const n of names) await page.getByRole("button", { name: n, exact: true }).first().click(); };
const check = (...ids) => async page => { for (const id of ids) await page.locator("#trap-" + id).check(); };

// Each scenario: a name, the views it applies to, a session patch, and optional data edits and clicks.
const SCENARIOS = [
  { name: "join", views: ["student"], session: { phase: "lobby" }, edit: d => { delete d[fp.doc("players", "u1")]; } },
  { name: "lobby", views: SD, session: { phase: "lobby" } },
  { name: "agenda", views: SD, session: { phase: "agenda" } },
  { name: "vocab-warmup", views: SD, session: { phase: "vocab-warmup" } },
  { name: "rules", views: SD, session: { phase: "learn-to-play", roundState: null, ruleStep: 9 } },
  { name: "practice-decide", views: SD, session: round("learn-to-play", 0, 1, "decide") },
  { name: "g1-r1-checkpoint", views: SD, session: round("game1", 1, 1, "decide") },
  { name: "g1-r2-add-reason", views: ["student"], session: round("game1", 1, 2, "decide"), history: [1, 1], edit: d => { delete d[fp.doc("responses", "u1_1_2")]; }, action: clickText("Add a reason this round") },
  { name: "g1-r6-forced", views: ["student"], session: round("game1", 1, 6, "decide"), history: [1, 5], edit: d => { delete d[fp.doc("responses", "u1_1_2")]; delete d[fp.doc("feedback", "u1_1_2")]; } },
  { name: "g1-r5-double-decide", views: SD, session: round("game1", 1, 5, "decide", { isDoubleRound: true }), history: [1, 4] },
  { name: "g1-locked", views: SD, session: round("game1", 1, 3, "locked"), history: [1, 2], edit: d => { d[fp.doc("decisions", "u1_1_3")] = { uid: "u1", game: 1, round: 3, choice: "OUT", decidedAt: { __ts: -20 } }; } },
  { name: "g1-rolling", views: SD, session: round("game1", 1, 3, "rolling"), history: [1, 2], settle: 4500, edit: d => { d[fp.doc("decisions", "u1_1_3")] = { uid: "u1", game: 1, round: 3, choice: "OUT", decidedAt: { __ts: -20 } }; } },
  { name: "g1-compute", views: SD, session: round("game1", 1, 3, "compute"), history: [1, 3], edit: d => { delete d[fp.doc("mathEntries", "u1_1_3")]; Object.assign(d[fp.doc("players", "u1")], { balance: historyFor(1, 2)[2], balanceHistory: historyFor(1, 2) }); } },
  { name: "g1-compute-hint", views: ["student"], session: round("game1", 1, 3, "compute"), history: [1, 3], edit: d => { d[fp.doc("mathEntries", "u1_1_3")].attempts = [999]; d[fp.doc("mathEntries", "u1_1_3")].correct = false; Object.assign(d[fp.doc("players", "u1")], { balance: historyFor(1, 2)[2], balanceHistory: historyFor(1, 2) }); } },
  { name: "g1-settled", views: SD, session: round("game1", 1, 4, "settled"), history: [1, 4] },
  { name: "g1-settled-leaderboard", views: SD, session: round("game1", 1, 4, "settled", { leaderboardVisible: true }), history: [1, 4] },
  { name: "game1-complete", views: SD, session: { phase: "game1-complete", game: 1, round: 6 }, history: [1, 6] },
  { name: "feedback-1", views: SD, session: { phase: "feedback-1", game: 1, roundEndsAt: { __ts: 240 } }, history: [1, 6] },
  { name: "feedback-1-self-assess", views: ["student"], session: { phase: "feedback-1", game: 1, roundEndsAt: { __ts: 240 } }, history: [1, 6], edit: d => { delete d[fp.doc("feedback", "u1_1_1")]; d[fp.doc("responses", "u1_1_1")].submittedAt = { __ts: -60 }; } },
  ...Array.from({ length: 14 }, (_, i) => i + 1).map(n => ({ name: "cer-step-" + n, views: SD, session: { phase: "cer-lesson", cerSubStep: n, roundEndsAt: [3, 9, 13].includes(n) ? { __ts: 60 } : null }, history: [1, 6] })),
  ...[4, 12].map(n => ({ name: "cer-poll-revealed-" + n, views: SD, session: { phase: "cer-lesson", cerSubStep: n, cerReveal: true }, history: [1, 6],
    edit: d => { d[fp.doc("quizAnswers", `u1_cer_${n - 1}`)] = { uid: "u1", kind: "cer", slot: "cer", qid: "cer" + (n - 1), choice: 1, correct: true, points: 3 }; } })),
  { name: "g1-r1-waiting-quiz", views: ["student"], session: round("game1", 1, 1, "decide"), history: [1, 0],
    edit: d => { d[fp.doc("decisions", "u1_1_1")] = { uid: "u1", game: 1, round: 1, choice: "IN", decidedAt: { __ts: -5 } }; addResponse(d, "u1_1_1", { uid: "u1", game: 1, round: 1, kind: "checkpoint", decision: "IN", text: TEXT.short }, 2); } },
  { name: "g1-r1-quiz-answered", views: ["student"], session: round("game1", 1, 1, "decide"), history: [1, 0],
    edit: d => { d[fp.doc("decisions", "u1_1_1")] = { uid: "u1", game: 1, round: 1, choice: "IN", decidedAt: { __ts: -5 } }; addResponse(d, "u1_1_1", { uid: "u1", game: 1, round: 1, kind: "checkpoint", decision: "IN", text: TEXT.short }, 2); },
    action: async page => { await page.locator(".quiz .option-btn").first().click(); } },
  { name: "g2-r2-settled-teams", views: SD, session: round("game2", 2, 2, "settled", { isTeamRound: true }), history: [2, 2] },
  { name: "g2-r3-team-leaderboard", views: ["display"], session: round("game2", 2, 3, "settled", { leaderboardVisible: true, isTeamRound: true }), history: [2, 3] },
  { name: "team-assignment", views: SD, session: { phase: "team-assignment", teamSeatingVisible: true, roundEndsAt: { __ts: 60 } }, history: [1, 6] },
  { name: "team-huddle", views: SD, session: { phase: "team-huddle", roundEndsAt: { __ts: 170 } }, history: [1, 6] },
  { name: "g2-r1-team-checkpoint", views: SD, session: round("game2", 2, 1, "decide", { isTeamRound: true }), history: [1, 6] },
  { name: "g2-r7-double-checkpoint", views: SD, session: round("game2", 2, 7, "decide", { isDoubleRound: true }), history: [2, 6] },
  { name: "g2-r7-compute-double", views: SD, session: round("game2", 2, 7, "compute"), history: [2, 7], edit: d => { delete d[fp.doc("mathEntries", "u1_2_7")]; Object.assign(d[fp.doc("players", "u1")], { balance: historyFor(2, 6)[6], balanceHistory: historyFor(2, 6) }); } },
  { name: "g2-r7-settled-feedback", views: ["student"], session: round("game2", 2, 7, "settled"), history: [2, 7] },
  { name: "probe-form", views: SD, session: { phase: "game2-probe", game: 2, round: 4 }, history: [2, 4], action: clickButtonsNamed("Yes", "Round 3", "OUT") },
  { name: "probe-counterfactual", views: ["student"], session: { phase: "game2-probe", game: 2, round: 4 }, history: [2, 4], edit: d => { d[fp.doc("probes", "u1")] = { uid: "u1", overruled: true, round: 3, wouldHaveDone: "OUT", why: "I thought it would drop.", counterfactualValue: 1, actualValue: -12, submittedAt: { __ts: -10 } }; } },
  { name: "game2-complete", views: SD, session: { phase: "game2-complete", game: 2, round: 8 }, history: [2, 8] },
  { name: "peer-scoring", views: SD, session: { phase: "peer-scoring", game: 2, roundEndsAt: { __ts: 300 } }, history: [2, 8], edit: d => { d[fp.doc("peerAssignments", "u1")] = { uid: "u1", items: [{ anonId: "A", text: TEXT.spotlight }, { anonId: "B", text: TEXT.short }] }; } },
  { name: "bias-survey", views: SD, session: { phase: "game2-complete", game: 2, round: 8, biasSurveyPushId: "push-1" }, history: [2, 8], action: check("loss-aversion", "regret", "herding", "risk-taking") },
  { name: "debrief", views: SD, session: { phase: "debrief", game: 2 }, history: [2, 8], edit: d => addSurveys(d, "push-1") },
  { name: "exit-ticket", views: SD, session: { phase: "exit-ticket", roundEndsAt: { __ts: 400 } }, history: [2, 8] },
  { name: "exit-submitted", views: ["student"], session: { phase: "exit-ticket", roundEndsAt: { __ts: 400 } }, history: [2, 8], edit: d => addResponse(d, "u1_0_0", { uid: "u1", game: 0, round: 0, kind: "exit", decision: null, text: TEXT.long }, 3) },
  { name: "closure", views: SD, session: { phase: "closure" }, history: [2, 8] },
  { name: "spotlight", views: ["display"], session: { phase: "feedback-1", game: 1, spotlightResponseId: "u5_1_1" }, history: [1, 6], work: 1 },
  { name: "vocab-mode", views: ["display"], session: { phase: "debrief", vocabModeVisible: true } },
  { name: "popup-vocabulary", views: ["student"], session: round("game1", 1, 1, "decide"), action: clickText("Vocabulary") },
  { name: "popup-agenda", views: ["student"], session: round("game1", 1, 1, "decide"), action: clickText("Agenda") },
  { name: "popup-scoring-guide", views: ["student"], session: round("game1", 1, 1, "decide"), action: clickText("Scoring guide") },
  { name: "popup-name-and-color", views: ["student"], session: round("game1", 1, 1, "decide"), action: clickText("Name and color") },
  { name: "hub-g1-decide", views: ["teacher", "observer"], session: round("game1", 1, 3, "decide"), history: [1, 2], work: 1 },
  { name: "hub-g2-complete", views: ["teacher", "observer"], session: { phase: "game2-complete", game: 2, round: 8 }, history: [2, 8], work: 2 }
];

function fixtureFor(sc, dys) {
  const docs = baseDocs({ dys });
  if (sc.history) addHistory(docs, sc.history[0], sc.history[1]);
  if (sc.work) { addClassWork(docs, 1); if (sc.work === 2) addClassWork(docs, 2); }
  Object.assign(docs[fp.session], sc.session);
  if (sc.edit) sc.edit(docs);
  return docs;
}

// ---------- static server for the repo ----------
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
function serve() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  }).listen(PORT);
}

// ---------- in-page layout audit ----------
function audit(view) {
  const issues = [];
  const vw = innerWidth;
  const se = document.scrollingElement;
  const describe = el => {
    const cls = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).join(".") : "";
    const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50);
    return `${el.tagName.toLowerCase()}${cls} "${text}"`;
  };
  if (se.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${se.scrollWidth - vw}px`);
  const screen = document.querySelector("#app > main");
  if (view === "display" && screen) {
    if (screen.scrollHeight > screen.clientHeight + 1) issues.push(`screen content cut off at the bottom by ${screen.scrollHeight - screen.clientHeight}px`);
    if (screen.scrollWidth > screen.clientWidth + 1) issues.push(`screen content cut off at the side by ${screen.scrollWidth - screen.clientWidth}px`);
  }
  const flagged = [];
  for (const el of document.querySelectorAll("#app *, .overlay *")) {
    if (["TEXTAREA", "INPUT", "svg", "polyline", "circle", "SELECT"].includes(el.tagName)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "inline" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    const spills = el.scrollWidth > el.clientWidth + 2 && !["auto", "scroll"].includes(cs.overflowX);
    const pastEdge = r.right > vw + 1 || r.left < -1;
    if (spills || pastEdge) flagged.push({ el, why: spills ? `content wider than its box by ${el.scrollWidth - el.clientWidth}px` : "runs past the edge of the window" });
  }
  // report the innermost element only
  for (const f of flagged) if (!flagged.some(o => o !== f && f.el.contains(o.el))) issues.push(`${describe(f.el)} ${f.why}`);
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const dysOn = document.body.classList.contains("dyslexic");
  const dysLoaded = [...document.fonts].some(f => f.family.replace(/['"]/g, "") === "OpenDyslexic" && f.status === "loaded");
  const bodyFont = getComputedStyle(document.body).fontFamily;
  const buttons = [...document.querySelectorAll("#app .btn-big")];
  const lastBtn = buttons[buttons.length - 1];
  const actionBelowFold = lastBtn ? Math.round(lastBtn.getBoundingClientRect().bottom - innerHeight) : null;
  return { issues: issues.slice(0, 8), rootPx, dysOn, dysLoaded, bodyFont, pageHeight: se.scrollHeight, viewHeight: innerHeight, actionBelowFold };
}

// ---------- run ----------
async function shoot(browser, viewName, sc, dys) {
  const v = VIEWS[viewName];
  const ctx = await browser.newContext({ viewport: v.viewport, reducedMotion: process.env.RWM_MOTION ? "no-preference" : "reduce", deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.route("**/*", route => {
    const u = new URL(route.request().url());
    if (u.host === `localhost:${PORT}`) {
      if (u.pathname.endsWith("/src/firebase.js")) return route.fulfill({ contentType: "text/javascript", body: MOCK });
      return route.continue();
    }
    if (u.host.endsWith("workers.dev")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ now: Date.now(), ok: true, status: "ok" }) });
    if (["fonts.googleapis.com", "fonts.gstatic.com", "fonts.cdnfonts.com"].includes(u.host)) return route.continue();
    return route.abort();
  });
  const fixture = { docs: fixtureFor(sc, dys), user: v.user, dys };
  // the laptop's remembered font choice, used before a student has joined
  await page.addInitScript(f => { window.__RWM_FIXTURE = f; try { localStorage.clear(); if (f.dys) localStorage.setItem("rwm-dyslexia", "1"); } catch (e) {} }, fixture);
  const url = `http://localhost:${PORT}/${v.page}?s=${SID}`;
  try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }); }
  catch (e) { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }); }
  await page.waitForFunction(() => { const a = document.getElementById("app"); return a && !a.textContent.includes("Loading"); }, null, { timeout: 8000 }).catch(() => errors.push("page never left Loading"));
  await fontsReady(page);
  await page.waitForTimeout(400);
  if (sc.action && viewName === "student") { try { await sc.action(page); } catch (e) { errors.push("click failed: " + e.message.split("\n")[0]); } }
  await page.waitForTimeout(Number(process.env.RWM_SETTLE) || sc.settle || 500);
  await fontsReady(page);
  await page.waitForTimeout(150);
  const result = await page.evaluate(audit, viewName);
  const file = path.join(OUT, `${viewName}-${sc.name}-${dys ? "dyslexia" : "standard"}.png`);
  await page.screenshot({ path: file, fullPage: v.fullPage && !sc.name.startsWith("popup-") });
  await ctx.close();
  return { ...result, errors, file };
}

// Font files come from a CDN. Never wait on them forever.
async function fontsReady(page) {
  await Promise.race([page.evaluate(() => document.fonts.ready.then(() => true)), new Promise(r => setTimeout(r, 8000))]);
}

async function pairSheet(browser, viewName, name, a, b) {
  const ctx = await browser.newContext({ viewport: { width: 1800, height: 600 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const img = f => "data:image/png;base64," + fs.readFileSync(f).toString("base64");
  await page.setContent(`<body style="margin:0;background:#888;font:16px sans-serif">
    <div style="display:flex;gap:12px;padding:12px;align-items:flex-start">
      <div style="flex:1"><div style="color:#fff;margin-bottom:6px">Standard font</div><img style="width:100%;display:block" src="${img(a)}"></div>
      <div style="flex:1"><div style="color:#fff;margin-bottom:6px">Dyslexia font</div><img style="width:100%;display:block" src="${img(b)}"></div>
    </div></body>`);
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(OUT, "pairs", `${viewName}-${name}.png`), fullPage: true });
  await ctx.close();
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "pairs"), { recursive: true });
  const server = serve();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const rows = [];
  try {
    for (const sc of SCENARIOS) {
      for (const viewName of sc.views) {
        if (filter && !sc.name.includes(filter) && viewName !== filter) continue;
        const fonts = VIEWS[viewName].oneFont ? [false] : [false, true];
        const shots = [];
        for (const dys of fonts) {
          const r = await shoot(browser, viewName, sc, dys);
          shots.push(r);
          rows.push({ view: viewName, name: sc.name, font: dys ? "dyslexia" : "standard", ...r });
          process.stdout.write(`${viewName} ${sc.name} ${dys ? "dyslexia" : "standard"}: ${r.issues.length + r.errors.length ? "CHECK" : "ok"}\n`);
        }
        if (shots.length === 2) await pairSheet(browser, viewName, sc.name, shots[0].file, shots[1].file);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(rows, null, 2));
  fs.writeFileSync(path.join(OUT, "report.md"), report(rows));
  const bad = rows.filter(r => r.issues.length || r.errors.length || (r.font === "dyslexia" && !r.dysLoaded));
  console.log(`\n${rows.length} screenshots, ${bad.length} need a look. See tools/screens/out/report.md`);
}

function report(rows) {
  const lines = ["# Screen report", "", `${rows.length} screenshots. Generated ${new Date().toLocaleString()}.`, ""];
  for (const r of rows) {
    const notes = [];
    if (r.font === "dyslexia" && !r.dysOn) notes.push("dyslexia class not applied");
    if (r.font === "dyslexia" && !r.dysLoaded) notes.push("OpenDyslexic did not load, screenshot shows the fallback font");
    if (r.view === "display" && r.rootPx < 48) notes.push(`type scaled down to ${r.rootPx}px root to fit`);
    if (r.view === "student" && r.actionBelowFold > 0) notes.push(`main button is ${r.actionBelowFold}px below the bottom of a 768px screen`);
    notes.push(...r.issues, ...r.errors.map(e => "error: " + e));
    if (!notes.length) continue;
    lines.push(`## ${r.view}, ${r.name}, ${r.font} font`, "", ...notes.map(n => "- " + n), "");
  }
  return lines.join("\n");
}

main().catch(e => { console.error(e); process.exit(1); });
