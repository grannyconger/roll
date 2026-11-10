// DOM helpers. Strings always become text nodes. No innerHTML anywhere in this app.
import { secondsLeft, formatClock } from "../session.js";
import { applyColorTokens, accentOnLight, accentOnDark } from "./tokens.js";

export function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (k === "value") node.value = v;
      else if (k === "checked") node.checked = !!v;
      else node.setAttribute(k, v === true ? "" : String(v));
    }
  }
  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) appendChildren(node, c);
    else if (c instanceof Node) node.appendChild(c);
    else node.appendChild(document.createTextNode(String(c)));
  }
}

export function mount(container, ...children) {
  container.replaceChildren();
  appendChildren(container, children);
}

// A countdown that updates itself. Pass the session's roundEndsAt.
export function countdown(endsAt, className = "timer") {
  const node = el("span", { class: className, "data-ends": "1" });
  node._endsAt = endsAt;
  node.textContent = formatClock(secondsLeft(endsAt));
  return node;
}

let tickerStarted = false;
export function startTicker() {
  if (tickerStarted) return;
  tickerStarted = true;
  setInterval(() => {
    document.querySelectorAll("[data-ends]").forEach(n => {
      const s = secondsLeft(n._endsAt);
      const text = s == null ? "" : (s === 0 ? "Time" : formatClock(s));
      if (n.textContent !== text) n.textContent = text;
    });
  }, 250);
}

export function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function setDyslexiaFont(on) {
  document.body.classList.toggle("dyslexic", !!on);
}

export function bootPage() {
  applyColorTokens();
  startTicker();
}

// A dismissable overlay. Returns a close function.
export function openOverlay(title, body, { dark = false } = {}) {
  const layer = el("div", { class: "overlay" + (dark ? " overlay-dark" : ""), role: "dialog", "aria-modal": "true", "aria-label": title });
  const close = () => { layer.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = e => { if (e.key === "Escape") close(); };
  const panel = el("div", { class: "overlay-panel" },
    el("div", { class: "overlay-head" },
      el("h2", null, title),
      el("button", { class: "btn btn-quiet", onclick: close }, "Close")),
    body);
  layer.appendChild(panel);
  layer.addEventListener("click", e => { if (e.target === layer) close(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(layer);
  return close;
}

export function moneyNode(n, className = "money") {
  return el("span", { class: className }, "$" + n);
}

export function directionNode(direction, className = "") {
  const up = direction === "up";
  return el("span", { class: `dir ${up ? "dir-up" : "dir-down"} ${className}` },
    el("span", { class: "dir-shape", "aria-hidden": "true" }, up ? "▲" : "▼"),
    up ? " Up, bull" : " Down, bear");
}

export function displayName(player) {
  if (!player) return "";
  return (player.preferredName || "") + (player.lastInitial ? " " + player.lastInitial + "." : "");
}

export function nameNode(player, onDark = false) {
  if (!player) return el("span", null, "");
  const color = onDark ? accentOnDark(player.accentColor) : accentOnLight(player.accentColor);
  return el("span", { class: "who", style: { color } },
    (player.emoji || "") + " " + displayName(player));
}

// The page takes on a student's chosen color. Buttons, picks, and highlights use it.
export function applyAccent(key, onDark = false) {
  const root = document.documentElement.style;
  root.setProperty("--accent", onDark ? accentOnDark(key) : accentOnLight(key));
  root.setProperty("--accentOnDark", accentOnDark(key));
}

// ---------- reward moments ----------
// Short bursts only, at reward moments. Never during reading or writing. Off under reduced motion.
function layer() {
  const l = el("div", { class: "burst-layer", "aria-hidden": "true" });
  document.body.appendChild(l);
  return l;
}

export function burst(anchor, symbols, { count = 14, spread = 170 } = {}) {
  if (reducedMotion()) return;
  const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const l = layer();
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const d = spread * (0.55 + Math.random() * 0.45);
    const bit = el("span", { class: "burst-bit" }, symbols[i % symbols.length]);
    bit.style.left = cx + "px";
    bit.style.top = cy + "px";
    bit.style.setProperty("--dx", Math.cos(a) * d + "px");
    bit.style.setProperty("--dy", Math.sin(a) * d + "px");
    bit.style.setProperty("--rot", Math.round(Math.random() * 360 - 180) + "deg");
    l.appendChild(bit);
  }
  setTimeout(() => l.remove(), 1500);
}

export function rain(symbols, { count = 36, ms = 2600 } = {}) {
  if (reducedMotion()) return;
  const l = layer();
  for (let i = 0; i < count; i++) {
    const bit = el("span", { class: "rain-bit" }, symbols[i % symbols.length]);
    bit.style.left = Math.random() * 100 + "vw";
    bit.style.setProperty("--delay", Math.random() * (ms * 0.45) + "ms");
    bit.style.setProperty("--dur", ms * (0.55 + Math.random() * 0.3) + "ms");
    bit.style.setProperty("--rot", Math.round(Math.random() * 540 - 270) + "deg");
    l.appendChild(bit);
  }
  setTimeout(() => l.remove(), ms + 400);
}

// Counts a money figure from one value to another.
export function countUp(node, from, to, ms = 900) {
  if (reducedMotion() || from === to || from == null) { node.textContent = "$" + to; return; }
  const t0 = performance.now();
  const step = t => {
    const k = Math.min(1, (t - t0) / ms);
    const eased = 1 - Math.pow(1 - k, 3);
    node.textContent = "$" + Math.round(from + (to - from) * eased);
    if (k < 1) requestAnimationFrame(step);
  };
  node.textContent = "$" + from;
  requestAnimationFrame(step);
}

export function downloadText(filename, text, type = "text/csv") {
  const blob = new Blob([text], { type });
  const a = el("a", { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
}
