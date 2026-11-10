// The drumroll under the direction die. Synthesized in the browser, no audio file.
// Display only. Student screens stay silent. Off with the hub's display sound toggle.
let ctx = null;

export function unlockSound() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  } catch (e) { ctx = null; }
}

export function soundReady() { return !!ctx && ctx.state === "running"; }

let noiseBuf = null;
function noise() {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

// One snare stroke: a burst of filtered noise plus a short body tone.
function stroke(at, gain) {
  const src = ctx.createBufferSource();
  src.buffer = noise();
  const band = ctx.createBiquadFilter();
  band.type = "bandpass"; band.frequency.value = 1900; band.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.09);
  src.connect(band).connect(g).connect(ctx.destination);
  src.start(at, Math.random() * 0.1, 0.1);

  const body = ctx.createOscillator();
  body.type = "triangle"; body.frequency.setValueAtTime(190, at);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(gain * 0.35, at);
  bg.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
  body.connect(bg).connect(ctx.destination);
  body.start(at); body.stop(at + 0.06);
}

// A roll that speeds up and swells across the given time.
export function startDrumroll(ms) {
  if (!soundReady()) return;
  const t0 = ctx.currentTime + 0.02;
  const dur = ms / 1000;
  let t = 0;
  while (t < dur) {
    const k = t / dur;
    stroke(t0 + t, 0.12 + 0.38 * k + (Math.random() * 0.05));
    t += 0.062 - 0.024 * k;
  }
}

// The landing: a hard snare hit over a low boom.
export function drumHit() {
  if (!soundReady()) return;
  const at = ctx.currentTime + 0.01;
  stroke(at, 0.9);
  const boom = ctx.createOscillator();
  boom.type = "sine";
  boom.frequency.setValueAtTime(120, at);
  boom.frequency.exponentialRampToValueAtTime(45, at + 0.45);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.7, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.6);
  boom.connect(g).connect(ctx.destination);
  boom.start(at); boom.stop(at + 0.65);
}
