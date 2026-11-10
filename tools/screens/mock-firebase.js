// Stand-in for src/firebase.js. Used only by the screenshot harness.
// The harness serves this file in place of the real one, so no page ever
// reaches Firebase. Data comes from window.__RWM_FIXTURE, set before load.
const W = window;
const fx = W.__RWM_FIXTURE || { docs: {}, user: null };

export class Timestamp {
  constructor(ms) { this.ms = ms; }
  toMillis() { return this.ms; }
  toDate() { return new Date(this.ms); }
  static now() { return new Timestamp(Date.now()); }
  static fromMillis(ms) { return new Timestamp(ms); }
  static fromDate(d) { return new Timestamp(d.getTime()); }
}

// Fixture timestamps are written as { __ts: secondsFromNow }.
function revive(v) {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === "object") {
    if ("__ts" in v) return new Timestamp(Date.now() + v.__ts * 1000);
    const o = {};
    for (const k of Object.keys(v)) o[k] = revive(v[k]);
    return o;
  }
  return v;
}

const store = new Map(Object.entries(fx.docs).map(([p, d]) => [p, revive(d)]));
const listeners = new Set();

export const app = {};
export const db = { kind: "db" };
export const auth = { currentUser: fx.user };

export function doc(_db, ...parts) { return { type: "doc", path: parts.join("/"), id: parts[parts.length - 1] }; }
export function collection(_db, ...parts) { return { type: "col", path: parts.join("/"), filters: [] }; }
export function where(field, op, value) { return { field, op, value }; }
export function orderBy() { return null; }
export function limit() { return null; }
export function query(ref, ...clauses) { return { ...ref, filters: ref.filters.concat(clauses.filter(c => c && c.op)) }; }

function matches(d, f) {
  const v = d[f.field];
  if (f.op === "==") return v === f.value;
  if (f.op === "!=") return v !== f.value;
  if (f.op === "in") return f.value.includes(v);
  return true;
}

function docSnap(path) {
  const d = store.get(path);
  return { id: path.split("/").pop(), ref: { path }, exists: () => d !== undefined, data: () => (d === undefined ? undefined : { ...d }) };
}

function colSnap(ref) {
  const docs = [];
  for (const [p, d] of store) {
    const parent = p.split("/").slice(0, -1).join("/");
    if (parent === ref.path && ref.filters.every(f => matches(d, f))) docs.push(docSnap(p));
  }
  return { docs, size: docs.length, empty: !docs.length, forEach: fn => docs.forEach(fn) };
}

const snapFor = ref => (ref.type === "doc" ? docSnap(ref.path) : colSnap(ref));

export function onSnapshot(ref, next) {
  const l = { ref, next };
  listeners.add(l);
  queueMicrotask(() => { if (listeners.has(l)) next(snapFor(ref)); });
  return () => listeners.delete(l);
}

function notify() {
  for (const l of [...listeners]) {
    try { l.next(snapFor(l.ref)); } catch (e) { console.error("listener failed", e); }
  }
}

export async function getDoc(ref) { return docSnap(ref.path); }
export async function getDocs(ref) { return colSnap(ref); }
export async function setDoc(ref, data, opts) {
  store.set(ref.path, opts && opts.merge ? { ...(store.get(ref.path) || {}), ...data } : { ...data });
  notify();
}
export async function updateDoc(ref, data) {
  if (!store.has(ref.path)) throw new Error("not-found");
  store.set(ref.path, { ...store.get(ref.path), ...data });
  notify();
}
export async function deleteDoc(ref) { store.delete(ref.path); notify(); }
export function serverTimestamp() { return Timestamp.now(); }
export function writeBatch() {
  const ops = [];
  return {
    set: (r, d, o) => ops.push(() => setDoc(r, d, o)),
    update: (r, d) => ops.push(() => updateDoc(r, d)),
    delete: r => ops.push(() => deleteDoc(r)),
    commit: async () => { for (const op of ops) await op(); }
  };
}

export const TEACHER_EMAIL = "bweaver@greermiddlecollege.org";
export const OBSERVER_EMAIL = "jlowman@greermiddlecollege.org";
export const SCHOOL_DOMAIN = "greermiddlecollege.org";

export async function signInWithSchoolGoogle() { return { user: fx.user }; }
export async function signInWithClassCode() { return { user: fx.user }; }
export function watchAuth(callback) { setTimeout(() => callback(fx.user), 0); return () => {}; }
export async function signOutNow() {}
export function isTeacherUser(user) { return !!user; }
export function isObserverUser(user) { return !!user; }

// The driver uses this to change data after load.
W.__rwm = {
  set(path, data) { store.set(path, revive(data)); notify(); },
  patch(path, data) { store.set(path, { ...(store.get(path) || {}), ...revive(data) }); notify(); },
  get(path) { return store.get(path); }
};
