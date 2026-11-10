// Join flow check against the Firebase emulator with the real rules.
// Covers every way a join can be refused, and that the student sees why.
//   cd tools/screens && node jointest.mjs   (emulators must be running)
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 8768;
const PROJECT = "roll-with-the-market";
const FB = "https://www.gstatic.com/firebasejs/10.12.2";
let failures = 0;
const ok = (cond, msg) => { console.log((cond ? "ok    " : "FAIL  ") + msg); if (!cond) failures++; };

const PATCH = `
import { connectAuthEmulator as __a } from "${FB}/firebase-auth.js";
import { connectFirestoreEmulator as __f } from "${FB}/firebase-firestore.js";
__a(auth, "http://127.0.0.1:9099", { disableWarnings: true });
__f(db, "127.0.0.1", 8080);
`;
const server = http.createServer((req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  const file = path.join(ROOT, decodeURIComponent(p));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(file);
  if (p === "/src/firebase.js") body = body.toString() + PATCH;
  res.writeHead(200, { "Content-Type": { ".html": "text/html", ".css": "text/css" }[path.extname(file)] || "text/javascript", "Cache-Control": "no-store" });
  res.end(body);
}).listen(PORT);

await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });

const browser = await chromium.launch({ channel: "chrome" });
async function open(file) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await ctx.route("**/*", r => {
    const u = new URL(r.request().url());
    if ([`localhost:${PORT}`, "127.0.0.1:8080", "127.0.0.1:9099", "www.gstatic.com"].includes(u.host) || u.host.startsWith("fonts.")) return r.continue();
    if (u.host.endsWith("workers.dev")) return r.fulfill({ headers: { "Access-Control-Allow-Origin": "*" }, contentType: "application/json", body: JSON.stringify({ now: Date.now() }) });
    return r.abort();
  });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/${file}`);
  return page;
}
async function google(page, email) {
  await page.evaluate(async ({ email, fb }) => {
    const { auth } = await import("/src/firebase.js");
    const { GoogleAuthProvider, signInWithCredential } = await import(fb + "/firebase-auth.js");
    await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name: "Test Student" })));
  }, { email, fb: FB });
}
const bodyText = page => page.locator("body").innerText();
async function shows(page, re, ms = 8000) {
  try { await page.waitForFunction(s => new RegExp(s).test(document.body.innerText), re.source, { timeout: ms }); return true; } catch (e) { return false; }
}
async function enterCode(page, code) {
  await shows(page, /Enter the class code/);
  await page.locator("#code").fill(code);
  await page.getByRole("button", { name: "Join", exact: true }).click();
}
async function fillProfileAndJoin(page) {
  await page.locator("#pname").fill("Tester");
  await page.locator(".emoji").first().click();
  await page.locator(".swatch").first().click();
  await page.getByRole("button", { name: "Join", exact: true }).click();
}

// teacher creates a session
const teacher = await open("teacher.html");
await shows(teacher, /Sign in with Google/);
await google(teacher, "bweaver@greermiddlecollege.org");
await shows(teacher, /Pick a class session/);
await teacher.getByRole("button", { name: "New 2B session" }).click();
await teacher.waitForURL(/\?s=/);
await shows(teacher, /2B hub/);
const code = (await teacher.locator(".hub-head strong").innerText()).trim();
const toggle = async label => { await teacher.locator("button.toggle", { hasText: label }).first().click(); await teacher.waitForTimeout(600); };

// A. class code with class code sign-in off
const a = await open("index.html");
await shows(a, /Sign in with Google/);
await a.getByRole("button", { name: "Sign in with the class code instead" }).click();
await enterCode(a, code);
ok(await shows(a, /Class code sign-in is off/), "class code student with sign-in off is told at the code step");

// B. a Google account outside the school domain
const c = await open("index.html");
await shows(c, /Sign in with Google/);
await google(c, "someone@gmail.com");
await enterCode(c, code);
await shows(c, /Join the class/);
await fillProfileAndJoin(c);
ok(await shows(c, /is not a school account/), "a non-school Google account sees why the join failed");
ok(!/Objective:/.test(await bodyText(c)), "the non-school account did not get in");

// C. teacher turns it on, the class code student tries again
await toggle("Class code sign-in");
await enterCode(a, code);
ok(await shows(a, /Join the class/), "after the teacher turns it on, the code is accepted");
await fillProfileAndJoin(a);
ok(await shows(a, /Objective:/), "class code student joins");

// D. a school Google account
const d = await open("index.html");
await shows(d, /Sign in with Google/);
await google(d, "student.one@greermiddlecollege.org");
await enterCode(d, code);
await shows(d, /Join the class/);
await fillProfileAndJoin(d);
ok(await shows(d, /Objective:/), "school Google account joins");

// E. joining locked
await toggle("Joining locked");
const e = await open("index.html");
await shows(e, /Sign in with Google/);
await google(e, "student.two@greermiddlecollege.org");
await enterCode(e, code);
ok(await shows(e, /Joining is closed/), "with joining locked, a new student is told at the code step");

// F. a student who already joined can still get back in while joining is locked
const d2 = await d.context().newPage();
await d2.goto(`http://localhost:${PORT}/index.html`);
ok(await shows(d2, /Objective:/), "an already-joined student gets back in while joining is locked");

await browser.close();
server.close();
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
