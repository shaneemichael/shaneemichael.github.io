import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

if (!reduced) {
  const lenis = new Lenis({ lerp: 0.1 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const target = document.querySelector(a.getAttribute("href")!);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target as HTMLElement, { offset: -64 });
    });
  });

  gsap.set("[data-reveal]", { opacity: 0, y: 32 });
  ScrollTrigger.batch("[data-reveal]", {
    start: "top 88%",
    once: true,
    onEnter: (els) =>
      gsap.to(els, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", stagger: 0.08 }),
  });
}

const bar = document.querySelector<HTMLElement>("[data-progress]");
const barBrush = document.querySelector<HTMLElement>("[data-progress-brush]");
if (bar) {
  // The bar scales, so the brush is a sibling that slides to the bar's tip using the same progress value.
  const render = (p: number) => {
    bar.style.transform = `scaleX(${p})`;
    if (barBrush) {
      barBrush.style.transform = `translateX(${p * bar.clientWidth}px) rotate(45deg)`;
      barBrush.style.opacity = p > 0.003 ? "1" : "0";
    }
  };
  const current = () => scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);
  ScrollTrigger.create({ start: 0, end: "max", onUpdate: (self) => render(self.progress) });
  addEventListener("resize", () => render(current()));
  render(current());
}

const nav = document.querySelector<HTMLElement>("[data-nav]");
if (nav) {
  const update = () => nav.setAttribute("data-floating", String(scrollY > 24));
  addEventListener("scroll", update, { passive: true });
  update();
}

// Expanding content (e.g. "Read more") changes page height; keep scroll-linked effects in sync.
let refreshTimer = 0;
new ResizeObserver(() => {
  clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 150);
}).observe(document.body);
