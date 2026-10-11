// Project demo videos: load just before they scroll into view, play muted while visible, pause when not.
// Videos play at `data-rate` (e.g. 2 for double speed). Reduced-motion users start them manually.
export function initDemoVideos() {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.querySelectorAll<HTMLElement>("[data-demo]").forEach((frame) => {
    const video = frame.querySelector<HTMLVideoElement>("video")!;
    const toggle = frame.querySelector<HTMLButtonElement>("[data-demo-toggle]");
    const rate = Number(video.dataset.rate) || 1;
    let userPaused = reduced;
    let visible = false;

    const applyRate = () => {
      video.defaultPlaybackRate = rate;
      video.playbackRate = rate;
    };
    video.addEventListener("loadedmetadata", applyRate);
    video.addEventListener("play", applyRate);

    const sync = () => {
      const playing = !video.paused;
      frame.dataset.playing = String(playing);
      if (toggle) toggle.setAttribute("aria-label", playing ? "Pause demo video" : "Play demo video");
    };
    video.addEventListener("play", sync);
    video.addEventListener("pause", sync);
    sync();

    const tryPlay = () => {
      if (userPaused || !visible) return;
      video.play().catch(() => {});
    };

    toggle?.addEventListener("click", () => {
      if (video.paused) {
        userPaused = false;
        if (!video.src) video.src = video.dataset.src!;
        video.play().catch(() => {});
      } else {
        userPaused = true;
        video.pause();
      }
    });

    // Start downloading a little before the card arrives.
    new IntersectionObserver(
      ([entry], obs) => {
        if (!entry.isIntersecting) return;
        if (!video.src) video.src = video.dataset.src!;
        obs.disconnect();
      },
      { rootMargin: "300px 0px" },
    ).observe(frame);

    new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) tryPlay();
        else video.pause();
      },
      { threshold: 0.35 },
    ).observe(frame);
  });
}
