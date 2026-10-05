import { useEffect, useRef } from "react";

import { parallaxShift, prefersReducedMotion, readingProgress } from "@/lib/motion";

/**
 * A thin line along the top of the screen that fills as the article is read.
 *
 * It reads the position of the element marked `data-reading-article` and
 * writes the line's `scaleX` straight to the DOM on each animation frame, so
 * scrolling never re-renders React. Decorative (hidden from assistive tech).
 * It fills from the inline start, so it runs the right way in Arabic. It is
 * not motion of its own, only the page's scroll position drawn as a line, so
 * it stays when the reader asked for less motion.
 */
export function ReadingProgress() {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const article = document.querySelector<HTMLElement>("[data-reading-article]");
    const line = bar.current;
    if (!article || !line) return;
    let frame = 0;
    const draw = () => {
      frame = 0;
      const rect = article.getBoundingClientRect();
      line.style.transform = `scaleX(${readingProgress(rect.top, rect.height, window.innerHeight)})`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    // At the bottom of the status bar in the phone app (BG-0151); the inset
    // is 0 in a browser, so the bar stays on the top edge there.
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top,0px)] z-[60] h-[3px]"
    >
      <div
        ref={bar}
        className="h-full w-full ltr:origin-left rtl:origin-right"
        style={{ backgroundImage: "var(--ui-grad-action)", transform: "scaleX(0)" }}
      />
    </div>
  );
}

/**
 * Wraps a hero picture so it drifts down a little as the page scrolls past it
 * (it lags the page by a fifth of the scroll). The picture is drawn slightly
 * larger so its edges never show. Nothing moves under reduced motion, and the
 * server's version is the plain picture.
 */
export function HeroParallax({ children }: { children: React.ReactNode }) {
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = layer.current;
    if (!element || prefersReducedMotion()) return;
    let frame = 0;
    const draw = () => {
      frame = 0;
      element.style.transform = `translate3d(0, ${parallaxShift(window.scrollY)}px, 0) scale(1.12)`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div ref={layer} className="absolute inset-0">
        {children}
      </div>
    </div>
  );
}
