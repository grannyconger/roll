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
async function fillProfileAndJoin(page, first = "Tester", last = "Person") {
  await page.locator("#pname").fill(first);
  await page.locator("#plast").fill(last);
  await page.locator(".emoji").first().click();
  await page.locator(".swatch").first().click();
  await page.getByRole("button", { name: "Join", exact: true }).click();
}

// teacher creates a session
const teacher = await open("teacher.html");
await shows(teacher, /Sign in with Google/);
await google(teacher, "bweaver@greermiddlecollege.org");
await shows(teacher, /Pick a class session/);
await teacher.getByRole("button", { name: "New 4B session" }).click();
await teacher.waitForURL(/\?s=/);
await shows(teacher, /4B hub/);
const code = (await teacher.locator(".hub-head strong").innerText()).trim();
const toggle = async label => { await teacher.locator("button.toggle", { hasText: label }).first().click(); await teacher.waitForTimeout(600); };

// A. no Google button on the student page, the class code is the way in
const a = await open("index.html");
ok(await shows(a, /Enter the class code/), "student page opens on the class code");
ok(!/Sign in with Google/.test(await bodyText(a)), "student page has no Google sign-in button");
await enterCode(a, code);
ok(await shows(a, /Join the class/), "class code is accepted by default");
await a.locator("#pname").fill("Ana");
await a.locator(".emoji").first().click();
await a.locator(".swatch").first().click();
await a.getByRole("button", { name: "Join", exact: true }).click();
ok(await shows(a, /Enter your last name/), "a last name is required");
await a.locator("#plast").fill("Lopez");
await a.getByRole("button", { name: "Join", exact: true }).click();
ok(await shows(a, /Objective:/), "class code student joins with first and last name");
ok(/Ana L\./.test(await bodyText(a)), "classmates see first name and last initial");

// B. the same name on a second laptop is asked about first
const b = await open("index.html");
await enterCode(b, code);
await shows(b, /Join the class/);
await fillProfileAndJoin(b, "Ana", "Lopez");
ok(await shows(b, /already joined/), "a second Ana L. is warned before joining");
await b.getByRole("button", { name: "Join", exact: true }).click();
ok(await shows(b, /Objective:/), "pressing Join again lets a different Ana L. in");

// C. teacher turns class code sign-in off
await toggle("Class code sign-in");
const c = await open("index.html");
await enterCode(c, code);
ok(await shows(c, /Class code sign-in is off/), "with class code sign-in off, a new student is told at the code step");
await toggle("Class code sign-in");

// D. joining locked
await toggle("Joining locked");
const d = await open("index.html");
await enterCode(d, code);
ok(await shows(d, /Joining is closed/), "with joining locked, a new student is told at the code step");

// E. a student who already joined gets back in after a reload while joining is locked
const a2 = await a.context().newPage();
await a2.goto(`http://localhost:${PORT}/index.html`);
ok(await shows(a2, /Objective:/), "an already-joined student gets back in while joining is locked");

// F. the teacher removes the duplicate
await toggle("Joining locked");
await shows(teacher, /share a name/);
const dupRow = teacher.locator(".student-row").last();
await dupRow.getByRole("button", { name: "Remove" }).click();
await teacher.getByRole("button", { name: "Confirm remove" }).click();
ok(await shows(teacher, /Students \(1\)/), "teacher removes a duplicate student");

await browser.close();
server.close();
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
