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

export function nameNode(player, onDark = false) {
  if (!player) return el("span", null, "");
  const color = onDark ? accentOnDark(player.accentColor) : accentOnLight(player.accentColor);
  return el("span", { class: "who", style: { color } },
    (player.emoji || "") + " " + (player.preferredName || ""));
}

export function downloadText(filename, text, type = "text/csv") {
  const blob = new Blob([text], { type });
  const a = el("a", { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
}
