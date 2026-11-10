// Assessor Worker. The only thing that talks to the Anthropic API.
// Holds ANTHROPIC_API_KEY and FIREBASE_SERVICE_ACCOUNT as secrets. Never logs student text.
import Anthropic from "@anthropic-ai/sdk";
import { SCORING_SYSTEM, SCORING_SCHEMA, scoringUserMessage } from "./prompts.js";

const PRIMARY_MODEL = "claude-haiku-5-5";
const SECONDARY_MODEL = "claude-sonnet-5-5";
const RATE_LIMIT_PER_SESSION = 900;      // per 10 minutes, per isolate. A class makes about 216 per period.
const RATE_WINDOW_MS = 10 * 60 * 1000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : (allowed[0] || ""),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (origin && !allowed.includes(origin)) return json({ error: "origin not allowed" }, 403, cors);

    const url = new URL(request.url);
    try {
      if (url.pathname === "/time" && request.method === "GET") return json({ now: Date.now() }, 200, cors);
      if (url.pathname === "/health" && request.method === "GET") return json(await health(env), 200, cors);
      if (url.pathname === "/assess" && request.method === "POST") return await assess(request, env, cors);
      return json({ error: "not found" }, 404, cors);
    } catch (err) {
      console.log(JSON.stringify({ event: "error", path: url.pathname, message: String(err && err.message || err) }));
      return json({ error: "assessor failed" }, 502, cors);
    }
  }
};

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

// ---------- rate limit, per session id, per isolate ----------
const rateBuckets = new Map();
function overRateLimit(sessionId) {
  const now = Date.now();
  const b = rateBuckets.get(sessionId) || { start: now, n: 0 };
  if (now - b.start > RATE_WINDOW_MS) { b.start = now; b.n = 0; }
  b.n++;
  rateBuckets.set(sessionId, b);
  return b.n > RATE_LIMIT_PER_SESSION;
}

// ---------- Claude ----------
function client(env, timeout, maxRetries) {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout, maxRetries });
}

// Thinking is turned off for latency. Haiku 5.5 accepts disabled at effort high or below.
// Sonnet 5.5 turns thinking off with between_tools instead.
function requestFor(model, userText) {
  return {
    model,
    max_tokens: 600,
    system: SCORING_SYSTEM,
    messages: [{ role: "user", content: userText }],
    thinking: model === PRIMARY_MODEL ? { type: "disabled" } : { type: "between_tools" },
    output_config: { effort: "low", format: { type: "json_schema", schema: SCORING_SCHEMA } }
  };
}

function readScore(message) {
  if (message.stop_reason === "refusal") throw new Error("refusal");
  const block = message.content.find(b => b.type === "text");
  if (!block) throw new Error("no text block");
  const raw = JSON.parse(block.text);
  const level = Number(raw.level);
  if (![1, 2, 3, 4].includes(level)) throw new Error("bad level");
  const clean = s => (typeof s === "string" ? s : "")
    .replace(/\s*[—–]\s*/g, ", ").replace(/;/g, ".").trim();
  const nominee = !!raw.spotlightNominee && level >= 3;
  return {
    level,
    why: clean(raw.why),
    suggestedEdit: clean(raw.suggestedEdit) || null,
    spotlightNominee: nominee,
    spotlightReason: nominee ? (clean(raw.spotlightReason) || null) : null
  };
}

// The fallback ladder: primary with retries, then the secondary model once.
async function score(env, userText) {
  try {
    const msg = await client(env, 9000, 2).messages.create(requestFor(PRIMARY_MODEL, userText));
    return { ...readScore(msg), model: PRIMARY_MODEL };
  } catch (e) {
    const msg = await client(env, 9000, 0).messages.create(requestFor(SECONDARY_MODEL, userText));
    return { ...readScore(msg), model: SECONDARY_MODEL };
  }
}

async function health(env) {
  const t0 = Date.now();
  try {
    const msg = await client(env, 10000, 0).messages.create({
      model: PRIMARY_MODEL, max_tokens: 20, thinking: { type: "disabled" }, output_config: { effort: "low" },
      messages: [{ role: "user", content: "Reply with the word ok." }]
    });
    const ok = msg.content.some(b => b.type === "text");
    return { ok, model: PRIMARY_MODEL, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, model: PRIMARY_MODEL, latencyMs: Date.now() - t0, error: String(e && e.status || e.message || e) };
  }
}

// ---------- /assess ----------
async function assess(request, env, cors) {
  const t0 = Date.now();
  const body = await request.json().catch(() => null);
  if (!body || typeof body.sessionId !== "string" || typeof body.responseId !== "string") return json({ error: "bad request" }, 400, cors);
  const { sessionId, responseId } = body;
  if (!/^[a-z0-9-]{4,40}$/.test(sessionId) || !/^[A-Za-z0-9_-]{4,80}$/.test(responseId)) return json({ error: "bad ids" }, 400, cors);
  if (overRateLimit(sessionId)) return json({ error: "rate limited" }, 429, cors);

  // Read the response from Firestore, so the score always matches the stored text and owner.
  const fs = await firestore(env);
  const stored = await fs.get(`sessions/${sessionId}/responses/${responseId}`);
  if (!stored) return json({ error: "response not found" }, 404, cors);
  const r = fromFields(stored.fields || {});
  if (!r.text || !["checkpoint", "chosen", "exit"].includes(r.kind)) return json({ error: "not assessable" }, 400, cors);

  const isExit = r.kind === "exit";
  const userText = scoringUserMessage({
    game: r.game, round: r.round, decision: r.decision || "", isDoubleRound: !!body.isDoubleRound, isExitTicket: isExit, text: r.text
  });
  const result = await score(env, userText);

  // teacherLevel is left out of the mask, so a teacher override survives a re-assessment
  await fs.patch(`sessions/${sessionId}/feedback/${responseId}`, {
    responseId, uid: r.uid, level: result.level, why: result.why, suggestedEdit: result.suggestedEdit,
    spotlightNominee: result.spotlightNominee, spotlightReason: result.spotlightReason, model: result.model,
    assessedAt: { __timestamp: new Date().toISOString() }
  });
  if (r.assessmentState === "pending") {
    await fs.patch(`sessions/${sessionId}/responses/${responseId}`, { assessmentState: "done" });
  }
  const latencyMs = Date.now() - t0;
  console.log(JSON.stringify({ event: "assessed", responseId, level: result.level, model: result.model, latencyMs }));
  return json({ ...result, latencyMs }, 200, cors);
}

// ---------- Firestore REST with a service account ----------
let cachedToken = null;   // { token, exp }

async function firestore(env) {
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const token = await accessToken(sa);
  const base = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents/`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  return {
    async get(path) {
      const res = await fetch(base + path, { headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("firestore get " + res.status);
      return res.json();
    },
    async patch(path, data) {
      const mask = Object.keys(data).map(k => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
      const res = await fetch(`${base}${path}?${mask}`, { method: "PATCH", headers, body: JSON.stringify({ fields: toFields(data) }) });
      if (!res.ok) throw new Error("firestore patch " + res.status);
      return res.json();
    }
  };
}

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 120 > now) return cachedToken.token;
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600
  };
  const enc = obj => b64url(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = `${enc(header)}.${enc(claims)}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const jwt = `${unsigned}.${b64url(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`
  });
  if (!res.ok) throw new Error("token exchange " + res.status);
  const j = await res.json();
  cachedToken = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return cachedToken.token;
}

function pemToDer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "object" && v.__timestamp) return { timestampValue: v.__timestamp };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v) };
}

function toFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = toValue(v);
  return out;
}

function fromFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if ("stringValue" in v) out[k] = v.stringValue;
    else if ("integerValue" in v) out[k] = Number(v.integerValue);
    else if ("booleanValue" in v) out[k] = v.booleanValue;
    else if ("doubleValue" in v) out[k] = v.doubleValue;
    else out[k] = null;
  }
  return out;
}
