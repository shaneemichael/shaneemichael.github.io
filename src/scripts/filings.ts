// Magnetic filings background: a grid of short strokes that turn to face the cursor nearby.
// One fixed canvas; the grid scrolls with the page, and drawing stops once every filing has settled.
const SPACING = 34;
const LENGTH = 9;
const REACH = 260;
const REST_ANGLE = -Math.PI / 4;
const STIFFNESS = 0.07;
const DAMPING = 0.78;

type Filing = { angle: number; vel: number; heat: number };

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shortestDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function initFilings(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const interactive = finePointer && !reduced;

  const rest = hexToRgb(token("--border"));
  const hot = hexToRgb(token("--accent-text"));

  let cols = 0;
  let rows = 0;
  let filings: Filing[] = [];
  let width = 0;
  let height = 0;
  const pointer = { x: -9999, y: -9999, active: false };
  let running = false;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    width = innerWidth;
    height = innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(width / SPACING) + 1;
    rows = Math.ceil(height / SPACING) + 2;
    filings = Array.from({ length: cols * rows }, () => ({ angle: REST_ANGLE, vel: 0, heat: 0 }));
    draw(false);
  }

  // Returns true while anything is still moving.
  function draw(step: boolean) {
    const offsetY = -(scrollY % SPACING);
    ctx!.clearRect(0, 0, width, height);
    ctx!.lineWidth = 1.25;
    ctx!.lineCap = "round";
    let moving = false;

    for (let r = 0; r < rows; r++) {
      const y = offsetY + r * SPACING + SPACING / 2;
      for (let c = 0; c < cols; c++) {
        const x = c * SPACING + SPACING / 2;
        const f = filings[r * cols + c];

        if (step) {
          let target = REST_ANGLE;
          let heatTarget = 0;
          if (pointer.active) {
            const dx = pointer.x - x;
            const dy = pointer.y - y;
            const dist = Math.hypot(dx, dy);
            if (dist < REACH) {
              const pull = 1 - dist / REACH;
              const facing = Math.atan2(dy, dx);
              target = REST_ANGLE + shortestDelta(REST_ANGLE, facing) * pull * pull * (3 - 2 * pull);
              heatTarget = pull * pull;
            }
          }
          f.vel = (f.vel + shortestDelta(f.angle, target) * STIFFNESS) * DAMPING;
          f.angle += f.vel;
          f.heat += (heatTarget - f.heat) * 0.12;
          if (Math.abs(f.vel) > 0.0005 || Math.abs(heatTarget - f.heat) > 0.004 || Math.abs(shortestDelta(f.angle, target)) > 0.002) {
            moving = true;
          }
        }

        const h = f.heat;
        const len = LENGTH * (1 + h * 0.45);
        const cx = Math.cos(f.angle) * len * 0.5;
        const cy = Math.sin(f.angle) * len * 0.5;
        const R = Math.round(rest[0] + (hot[0] - rest[0]) * h);
        const G = Math.round(rest[1] + (hot[1] - rest[1]) * h);
        const B = Math.round(rest[2] + (hot[2] - rest[2]) * h);
        ctx!.strokeStyle = `rgba(${R},${G},${B},${0.55 + h * 0.45})`;
        ctx!.beginPath();
        ctx!.moveTo(x - cx, y - cy);
        ctx!.lineTo(x + cx, y + cy);
        ctx!.stroke();
      }
    }
    return moving;
  }

  function loop() {
    if (draw(true)) {
      requestAnimationFrame(loop);
    } else {
      running = false;
    }
  }

  function wake() {
    if (running || !interactive) return;
    running = true;
    requestAnimationFrame(loop);
  }

  resize();
  let resizeTimer = 0;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 120);
  });

  // Grid scrolls with the page; redraw on scroll even when idle.
  addEventListener(
    "scroll",
    () => {
      if (running) return;
      if (interactive) wake();
      else requestAnimationFrame(() => draw(false));
    },
    { passive: true },
  );

  if (!interactive) return;

  addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
      wake();
    },
    { passive: true },
  );
  document.documentElement.addEventListener("pointerleave", () => {
    pointer.active = false;
    wake();
  });
  addEventListener("blur", () => {
    pointer.active = false;
    wake();
  });
}
