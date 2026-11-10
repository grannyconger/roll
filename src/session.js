// Phase machine and shared state subscriptions.
import { db, doc, onSnapshot, collection, query, where } from "./firebase.js";
import { ASSESSOR_URL } from "./shared/config.js";

export const PHASES = [
  "lobby", "agenda", "vocab-warmup", "learn-to-play",
  "game1", "game1-complete", "feedback-1", "cer-lesson",
  "team-assignment", "team-huddle", "game2", "game2-probe", "game2-complete",
  "peer-scoring", "debrief", "exit-ticket", "closure"
];

export const PHASE_LABELS = {
  "lobby": "Lobby", "agenda": "Agenda", "vocab-warmup": "Vocab warm up",
  "learn-to-play": "Learn to play", "game1": "Game 1", "game1-complete": "Game 1 complete",
  "feedback-1": "Feedback", "cer-lesson": "CER lesson", "team-assignment": "Team assignment",
  "team-huddle": "Team huddle", "game2": "Game 2", "game2-probe": "Probe",
  "game2-complete": "Game 2 complete", "peer-scoring": "Peer scoring", "debrief": "Mind traps",
  "exit-ticket": "Exit ticket", "closure": "Closure"
};

export function phaseHasRounds(session) {
  return !!session && ["learn-to-play", "game1", "game2"].includes(session.phase) && !!session.roundState;
}

export function sessionIdFromUrl() {
  return new URLSearchParams(location.search).get("s");
}

export function sessionRef(sessionId) {
  return doc(db, "sessions", sessionId);
}

export function sub(sessionId, name) {
  return collection(db, "sessions", sessionId, name);
}

export function subDoc(sessionId, name, id) {
  return doc(db, "sessions", sessionId, name, id);
}

export function watchSession(sessionId, onChange, onError) {
  return onSnapshot(sessionRef(sessionId), snap => onChange(snap.exists() ? { id: snap.id, ...snap.data() } : null), onError);
}

export function watchCollection(sessionId, name, onChange, filters = []) {
  const ref = filters.length ? query(sub(sessionId, name), ...filters.map(f => where(...f))) : sub(sessionId, name);
  return onSnapshot(ref, snap => {
    const docs = []
    snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
    onChange(docs);
  }, err => console.warn("watch failed", name, err.code));
}

// Server clock offset, measured once against the Worker's /time endpoint.
// Countdowns use serverNow(), never the local clock alone.
let clockOffsetMs = 0;
export async function measureClockOffset() {
  try {
    const t0 = Date.now();
    const res = await fetch(ASSESSOR_URL + "/time", { cache: "no-store" });
    const t1 = Date.now();
    const { now } = await res.json();
    clockOffsetMs = now - (t0 + t1) / 2;
  } catch (e) {
    clockOffsetMs = 0;
  }
  return clockOffsetMs;
}

export function serverNow() {
  return Date.now() + clockOffsetMs;
}

export function millisOf(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts === "number") return ts;
  return null;
}

export function secondsLeft(endsAt) {
  const end = millisOf(endsAt);
  if (!end) return null;
  return Math.max(0, Math.ceil((end - serverNow()) / 1000));
}

export function formatClock(seconds) {
  if (seconds == null) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
