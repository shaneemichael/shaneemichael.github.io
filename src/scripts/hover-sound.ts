// Crisp UI hover tick synthesized with Web Audio (no asset to load).
// Shape: ~35ms burst centred near 3.4kHz that peaks within 1ms, a fast ~2.7ms decay, then a faint longer tail.
const CENTER_HZ = 3400;
const BODY_DECAY_S = 0.0027;
const TAIL_DECAY_S = 0.012;
const PEAK = 0.13;
const TAIL_LEVEL = 0.1;
const SCHEDULE_AHEAD_S = 0.01;

let ctx: AudioContext | null = null;
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

// Seeded noise so every click is identical.
function noiseFor(ac: BaseAudioContext) {
  let buf = noiseBuffers.get(ac);
  if (buf) return buf;
  buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * 0.05), ac.sampleRate);
  const data = buf.getChannelData(0);
  let seed = 0x2f6b4f;
  for (let i = 0; i < data.length; i++) {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    data[i] = (((r ^ (r >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  }
  noiseBuffers.set(ac, buf);
  return buf;
}

function envelope(ac: BaseAudioContext, t: number, level: number, decay: number) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + 0.001);
  g.gain.setTargetAtTime(0, t + 0.001, decay);
  g.connect(ac.destination);
  return g;
}

export function scheduleTick(ac: BaseAudioContext, t: number) {
  const body = envelope(ac, t, PEAK, BODY_DECAY_S);
  const tail = envelope(ac, t, PEAK * TAIL_LEVEL, TAIL_DECAY_S);

  const band = ac.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = CENTER_HZ;
  band.Q.value = 2;
  const noiseGain = ac.createGain();
  noiseGain.gain.value = 2.2;
  band.connect(noiseGain);
  noiseGain.connect(body);
  noiseGain.connect(tail);

  const src = ac.createBufferSource();
  src.buffer = noiseFor(ac);
  src.connect(band);
  src.start(t);

  const ring = ac.createOscillator();
  const ringGain = ac.createGain();
  ring.frequency.value = CENTER_HZ;
  ringGain.gain.value = 0.5;
  ring.connect(ringGain).connect(body);
  ring.start(t);
  ring.stop(t + 0.05);

  // Tear the chain down once it has played, so ticks don't pile up live nodes over a long session.
  ring.onended = () => {
    for (const node of [src, band, noiseGain, ring, ringGain, body, tail]) node.disconnect();
  };
}

function unlock() {
  ctx ??= new AudioContext();
  // Covers "suspended" and Safari's "interrupted" (e.g. after switching tabs or audio devices).
  if (ctx.state !== "running") ctx.resume().catch(() => {});
}

let lastTick = 0;
function playTick() {
  // Browsers only allow audio after a user gesture, so hovers before the first click/key stay silent.
  if (!ctx || ctx.state !== "running") return;
  const now = performance.now();
  if (now - lastTick < 40) return;
  lastTick = now;
  // Schedule slightly ahead: "now" has already passed by the time the audio thread runs,
  // which would skip the 1ms attack and cause inconsistent, poppy ticks.
  scheduleTick(ctx, ctx.currentTime + SCHEDULE_AHEAD_S);
}

const isControl = (el: EventTarget | null) =>
  el instanceof Element ? el.closest("a[href], button") : null;

if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", unlock, { passive: true });
  document.addEventListener("keydown", unlock);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && ctx && ctx.state !== "running") ctx.resume().catch(() => {});
  });

  document.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse") return;
    const control = isControl(e.target);
    if (control && !control.contains(e.relatedTarget as Node | null)) playTick();
  });

  document.addEventListener("focusin", (e) => {
    const control = isControl(e.target);
    if (control?.matches(":focus-visible")) playTick();
  });
}
