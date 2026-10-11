// Black-and-white → colour watercolour reveal on first load.
// A fixed veil greys and darkens everything behind it (backdrop-filter). Brush strokes painted into a small
// canvas become the veil's mask and erase it; the low-res mask is upscaled, which softens edges like a wash
// bleed. A brush graphic rides the leading edge of each stroke, zigzagging down the page.
const SEEN_KEY = "brush-intro-seen";
const DURATION_MS = 2100;
const HOLD_GREY_MS = 400;
const MASK_W = 320;
const STROKES = 4;
const STAMPS_PER_STROKE = 70;

type Stamp = { x: number; y: number; r: number; a: number };
type Stroke = { stamps: Stamp[]; at: (u: number) => { x: number; y: number }; leftToRight: boolean };

function rand(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildStrokes(w: number, h: number): Stroke[] {
  const rnd = rand(0x51a7e);
  const band = h / STROKES;
  const radius = band * 0.85;
  const strokes: Stroke[] = [];
  for (let s = 0; s < STROKES; s++) {
    const leftToRight = s % 2 === 0;
    const y0 = band * (s + 0.5);
    const tilt = (rnd() - 0.5) * band * 0.9;
    const wobble = band * (0.15 + rnd() * 0.2);
    const phase = rnd() * Math.PI * 2;
    const at = (u: number) => ({
      x: (leftToRight ? u : 1 - u) * (w + radius * 2) - radius,
      y: y0 + tilt * (u - 0.5) + Math.sin(u * Math.PI * 2 + phase) * wobble,
    });
    const stamps: Stamp[] = [];
    for (let i = 0; i < STAMPS_PER_STROKE; i++) {
      const u = i / (STAMPS_PER_STROKE - 1);
      const c = at(u);
      // Brush loads heavy, thins out, with jitter for a hand-painted edge.
      const pressure = 0.75 + 0.35 * Math.sin(u * Math.PI);
      stamps.push({
        x: c.x + (rnd() - 0.5) * radius * 0.25,
        y: c.y + (rnd() - 0.5) * radius * 0.35,
        r: radius * pressure * (0.8 + rnd() * 0.35),
        a: 0.45 + rnd() * 0.45,
      });
    }
    strokes.push({ stamps, at, leftToRight });
  }
  return strokes;
}

function finish(veil: HTMLElement, brush: HTMLElement | null, fast: boolean) {
  const ms = fast ? 200 : 450;
  veil.style.transition = `opacity ${ms}ms ease`;
  veil.style.opacity = "0";
  if (brush) {
    brush.style.transition = `opacity ${ms}ms ease`;
    brush.style.opacity = "0";
  }
  window.setTimeout(() => {
    document.documentElement.classList.remove("brush-intro");
    veil.style.cssText = "";
    if (brush) brush.style.cssText = "";
  }, ms + 30);
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {}
}

export function runBrushIntro() {
  const root = document.documentElement;
  const veil = document.querySelector<HTMLElement>("[data-brush-veil]");
  if (!veil || !root.classList.contains("brush-intro")) return;
  // This script now owns the reveal; drop the head fail-safe and keep our own.
  clearTimeout((window as unknown as { __brushFailsafe?: number }).__brushFailsafe);
  window.setTimeout(() => root.classList.remove("brush-intro"), DURATION_MS + HOLD_GREY_MS + 4000);

  // Frames pause in a background tab, so wait until the page is actually visible.
  if (document.hidden) {
    const onVisible = () => {
      if (document.hidden) return;
      document.removeEventListener("visibilitychange", onVisible);
      window.setTimeout(() => play(veil), HOLD_GREY_MS);
    };
    document.addEventListener("visibilitychange", onVisible);
    return;
  }
  window.setTimeout(() => play(veil), HOLD_GREY_MS);
}

function play(veil: HTMLElement) {
  const brush = document.querySelector<HTMLElement>("[data-brush-tool]");
  const w = MASK_W;
  const h = Math.max(1, Math.round((MASK_W * innerHeight) / innerWidth));
  const toPx = innerWidth / w;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "destination-out";

  const strokes = buildStrokes(w, h);
  const drawn = new Array(STROKES).fill(0);
  const setMask = () => {
    const url = `url(${canvas.toDataURL()})`;
    veil.style.maskImage = url;
    veil.style.webkitMaskImage = url;
  };
  setMask();

  let done = false;
  const skip = () => {
    if (done) return;
    done = true;
    finish(veil, brush, true);
  };
  const opts = { once: true, passive: true } as const;
  addEventListener("wheel", skip, opts);
  addEventListener("touchstart", skip, opts);
  addEventListener("pointerdown", skip, opts);
  addEventListener("keydown", skip, { once: true });

  // One brush, one stroke at a time: each stroke gets an equal slice of the timeline.
  const easeStroke = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const start = performance.now();

  function moveBrush(stroke: Stroke, u: number) {
    if (!brush) return;
    const c = stroke.at(u);
    const ahead = stroke.at(Math.min(u + 0.02, 1));
    const slope = Math.atan2(ahead.y - c.y, Math.abs(ahead.x - c.x) || 1) * (180 / Math.PI);
    const x = c.x * toPx;
    const y = c.y * toPx;
    const lean = stroke.leftToRight ? -28 : 28;
    const flip = stroke.leftToRight ? 1 : -1;
    brush.style.opacity = "1";
    brush.style.transform = `translate(${x}px, ${y}px) scaleX(${flip}) rotate(${lean * flip + slope * 0.6}deg)`;
  }

  function frame(now: number) {
    if (done) return;
    const p = Math.min((now - start) / DURATION_MS, 1);
    const slot = Math.min(Math.floor(p * STROKES), STROKES - 1);
    for (let s = 0; s < STROKES; s++) {
      const local = s < slot ? 1 : s > slot ? 0 : easeStroke(p * STROKES - slot);
      const target = Math.floor(local * STAMPS_PER_STROKE);
      for (let i = drawn[s]; i < target; i++) {
        const st = strokes[s].stamps[i];
        const g = ctx.createRadialGradient(st.x, st.y, st.r * 0.15, st.x, st.y, st.r);
        g.addColorStop(0, `rgba(0,0,0,${st.a})`);
        g.addColorStop(0.7, `rgba(0,0,0,${st.a * 0.6})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
      drawn[s] = Math.max(drawn[s], target);
      if (s === slot) moveBrush(strokes[s], local);
    }
    setMask();
    if (p < 1) {
      requestAnimationFrame(frame);
    } else {
      done = true;
      finish(veil, brush, false);
    }
  }
  requestAnimationFrame(frame);
}
