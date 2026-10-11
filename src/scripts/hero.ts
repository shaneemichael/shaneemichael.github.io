import {
  BufferAttribute,
  BufferGeometry,
  Color,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";
import { animate } from "motion";

const FONT = '700 100px "Space Grotesk"';
const CAMERA_Z = 8;
const FOV = 40;

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const vertexShader = /* glsl */ `
  attribute vec3 aText;
  attribute vec3 aSphere;
  attribute vec4 aRand;
  uniform float uMix;
  uniform vec2 uCenter;
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  varying float vMix;
  varying float vShade;
  varying float vTone;

  vec2 rot(vec2 p, float a) {
    float c = cos(a), s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  void main() {
    float delay = aRand.x * 0.35;
    float t = clamp((uMix - delay) / 0.65, 0.0, 1.0);
    float e = t * t * (3.0 - 2.0 * t);
    float arc = sin(e * 3.14159265);

    vec3 sph = aSphere;
    sph.xz = rot(sph.xz, uTime * 0.35);
    sph.yz = rot(sph.yz, 0.35);
    sph.xy += uCenter;

    vec3 text = aText;
    text.z += sin(uTime * 0.9 + aRand.z * 6.2831) * 0.03;
    text.x += sin(uTime * 0.6 + aRand.y * 6.2831) * 0.012;

    vec3 p = mix(text, sph, e);
    p.xy = uCenter + rot(p.xy - uCenter, arc * (aRand.y - 0.5) * 2.5);
    p.z += arc * (aRand.z - 0.5) * 2.4;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (0.55 + aRand.w * 0.9) * (${CAMERA_Z.toFixed(1)} / -mv.z);

    vMix = e;
    vShade = 0.55 + 0.45 * smoothstep(-1.5, 1.5, p.z);
    vTone = aRand.y;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uInk;
  uniform vec3 uAccent;
  varying float vMix;
  varying float vShade;
  varying float vTone;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.2, d);
    float t = clamp(vTone * 0.14 + vMix * vTone * 0.7, 0.0, 1.0);
    gl_FragColor = vec4(mix(uInk, uAccent, t), alpha * (0.5 + 0.5 * vShade));
  }
`;

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function sampleText(lines: string[], centered: boolean) {
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = FONT;
  const widest = Math.max(...lines.map((l) => probe.measureText(l).width));
  const targetW = 1400;
  const fontSize = (targetW * 0.99 * 100) / widest;
  const lineH = fontSize * 1.08;
  const W = targetW;
  const H = Math.ceil(lineH * lines.length + fontSize * 0.3);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.font = FONT.replace("100px", `${fontSize}px`);
  ctx.textAlign = centered ? "center" : "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  lines.forEach((line, i) => {
    ctx.fillText(line, centered ? W / 2 : W * 0.005, fontSize * 0.15 + lineH * (i + 0.5));
  });

  const step = 3;
  const data = ctx.getImageData(0, 0, W, H).data;
  const pts: number[] = [];
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      if (data[(y * W + x) * 4 + 3] > 128) pts.push(x, y);
    }
  }
  return { pts, W, H, step };
}

export async function initHero(root: HTMLElement) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !webglAvailable()) return false;

  const canvas = root.querySelector<HTMLCanvasElement>("[data-hero-canvas]")!;
  const holdBtn = root.querySelector<HTMLButtonElement>("[data-hero-hold]");

  await document.fonts.load(FONT);
  await document.fonts.ready;

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "high-performance" });
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 50);
  camera.position.z = CAMERA_Z;

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uInk: { value: new Color(token("--ink")) },
      uMix: { value: 0 },
      uCenter: { value: [0, 0] },
      uTime: { value: 0 },
      uSize: { value: 2.3 },
      uPixelRatio: { value: 1 },
      uAccent: { value: new Color(token("--accent")) },
    },
  });

  let points: Points | null = null;
  let viewW = 1;
  let viewH = 1;
  let zone = { xOffset: 0, yOffset: 0, halfW: 0, halfH: 0, radius: 0 };

  function build() {
    const w = root.clientWidth;
    const h = root.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    material.uniforms.uPixelRatio.value = dpr;

    viewH = 2 * Math.tan((FOV * Math.PI) / 360) * CAMERA_Z;
    viewW = viewH * camera.aspect;

    // The name is laid out by CSS: particles fill the [data-hero-slot] box, left-aligned.
    const rootRect = root.getBoundingClientRect();
    const slotEl = root.querySelector<HTMLElement>("[data-hero-slot]")!;
    const slot = slotEl.getBoundingClientRect();
    // The layout decides alignment: the stacked (small-screen) hero centres the name.
    const centered = getComputedStyle(slotEl).textAlign === "center";
    const slotLeft = slot.left - rootRect.left;
    const slotTop = slot.top - rootRect.top;

    const lines = slot.width < 340 ? ["Shane", "Michael", "Tanata", "Tendy"] : ["Shane Michael", "Tanata Tendy"];
    const { pts, W, H, step } = sampleText(lines, centered);

    let namePxW = slot.width;
    if ((namePxW * H) / W > slot.height) namePxW = (slot.height * W) / H;
    const namePxH = (namePxW * H) / W;

    const pxToWorld = viewW / w;
    const scale = (namePxW * pxToWorld) / W;
    const xOffset = ((slotLeft + (centered ? slot.width : namePxW) / 2) / w - 0.5) * viewW;
    const yOffset = -((slotTop + slot.height / 2) / h - 0.5) * viewH;
    const radius = Math.min(slot.height * 0.55, slot.width * 0.45) * pxToWorld;

    const count = Math.round(Math.min(Math.max(namePxW * namePxH * 0.13, 9000), 40000));
    const candidates = pts.length / 2;

    const aText = new Float32Array(count * 3);
    const aSphere = new Float32Array(count * 3);
    const aRand = new Float32Array(count * 4);
    material.uniforms.uCenter.value = [xOffset, yOffset];
    zone = {
      xOffset,
      yOffset,
      halfW: (namePxW / 2) * pxToWorld + 0.2,
      halfH: (namePxH / 2) * pxToWorld + 0.2,
      radius: radius + 0.2,
    };

    for (let i = 0; i < count; i++) {
      const j = Math.floor(Math.random() * candidates) * 2;
      const px = pts[j] + (Math.random() - 0.5) * step;
      const py = pts[j + 1] + (Math.random() - 0.5) * step;
      aText[i * 3] = (px - W / 2) * scale + xOffset;
      aText[i * 3 + 1] = -(py - H / 2) * scale + yOffset;
      aText[i * 3 + 2] = 0;

      const y = 1 - (2 * (i + 0.5)) / count;
      const r = Math.sqrt(1 - y * y);
      const theta = i * 2.399963229728653;
      const shell = radius * (0.94 + Math.random() * 0.12);
      aSphere[i * 3] = Math.cos(theta) * r * shell;
      aSphere[i * 3 + 1] = y * shell;
      aSphere[i * 3 + 2] = Math.sin(theta) * r * shell;

      aRand[i * 4] = Math.random();
      aRand[i * 4 + 1] = Math.random();
      aRand[i * 4 + 2] = Math.random();
      aRand[i * 4 + 3] = Math.random();
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(aText.slice(), 3));
    geometry.setAttribute("aText", new BufferAttribute(aText, 3));
    geometry.setAttribute("aSphere", new BufferAttribute(aSphere, 3));
    geometry.setAttribute("aRand", new BufferAttribute(aRand, 4));

    if (points) {
      points.geometry.dispose();
      scene.remove(points);
    }
    points = new Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);
  }

  build();

  const state = { mix: 0 };
  let spring: { stop: () => void } | null = null;
  function setTarget(target: 0 | 1) {
    spring?.stop();
    spring = animate(state.mix, target, {
      type: "spring",
      stiffness: target ? 38 : 70,
      damping: target ? 12 : 9,
      onUpdate: (v: number) => {
        state.mix = v;
        material.uniforms.uMix.value = v;
      },
    });
  }

  const pointer = { tx: 0, ty: 0 };
  const INTENT_MS = 140;
  let intentTimer = 0;
  let holding = false;

  const hold = () => {
    if (holding) return;
    holding = true;
    root.dataset.holding = "true";
    holdBtn?.setAttribute("aria-pressed", "true");
    setTarget(1);
  };
  const release = () => {
    clearTimeout(intentTimer);
    intentTimer = 0;
    if (!holding) return;
    holding = false;
    root.dataset.holding = "false";
    holdBtn?.setAttribute("aria-pressed", "false");
    setTarget(0);
  };

  function overName(x: number, y: number) {
    const dx = x - zone.xOffset;
    const dy = y - zone.yOffset;
    const inText = Math.abs(dx) < zone.halfW && Math.abs(dy) < zone.halfH;
    const inGlobe = holding && dx * dx + dy * dy < zone.radius * zone.radius;
    return inText || inGlobe;
  }

  function onMove(e: PointerEvent) {
    if (e.pointerType !== "mouse") return;
    const rect = root.getBoundingClientRect();
    pointer.tx = ((e.clientX - rect.left) / rect.width - 0.5) * viewW;
    pointer.ty = -((e.clientY - rect.top) / rect.height - 0.5) * viewH;

    if (overName(pointer.tx, pointer.ty)) {
      if (!holding && !intentTimer) intentTimer = window.setTimeout(hold, INTENT_MS);
    } else {
      release();
    }
  }

  const stage = root.querySelector<HTMLElement>("[data-hero-stage]")!;
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerleave", () => {
    release();
  });
  stage.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    holding ? release() : hold();
  });
  addEventListener("blur", release);

  const toggleKey = (e: KeyboardEvent) => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    holding ? release() : hold();
  };
  holdBtn?.addEventListener("keydown", toggleKey);
  holdBtn?.addEventListener("click", (e) => {
    if (e.detail === 0) return;
    holding ? release() : hold();
  });

  let resizeTimer = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(build, 150);
  }).observe(root);

  let visible = true;
  new IntersectionObserver(([entry]) => (visible = entry.isIntersecting)).observe(root);

  let last = performance.now();
  let time = 0;
  function frame(now: number) {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) {
      last = now;
      return;
    }
    const dt = Math.min((now - last) / 1000, 0.04);
    last = now;
    time += dt;

    material.uniforms.uTime.value = time;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return true;
}
