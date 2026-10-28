import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { countUpValue, prefersReducedMotion, type RevealState } from "@/lib/motion";

/**
 * The `/pepites` Top 10's one-off motion (`pepites-motion.css`), on the calm
 * rule (`docs/engineering/MOTION_CALM_SCREENS.md`): nothing starts blank.
 *
 * A score counts up once, when it is first scrolled into view, from a value
 * just under it. The server and a reader who wants less motion get the final
 * figure (the reveal stays `static`), so the page's HTML is unchanged.
 */

/**
 * `useRevealOnView` (`@/lib/motion`), except that with `belowFoldOnly` an
 * element already on screen when the page goes live stays `static`, exactly
 * as drawn: a real figure is never shown and then taken back. Only an
 * element still below the fold is `armed` (its start state, set before the
 * first paint and while it cannot be seen) and `played` once 40% of it
 * scrolls into view. Without `belowFoldOnly` it is `useRevealOnView`.
 */
export function useRevealBelowFold<T extends HTMLElement>(belowFoldOnly = true) {
  const ref = useRef<T | null>(null);
  const [state, setState] = useState<RevealState>("static");

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;
    if (belowFoldOnly) {
      const box = element.getBoundingClientRect();
      // On screen (or above it, scrolled past) at mount: left as drawn.
      if (box.top < window.innerHeight) return;
    }
    setState("armed");
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setState("played");
        observer.disconnect();
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => observer.disconnect();
    // Read once, at mount, like `useRevealOnView`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [ref, state] as const;
}

/**
 * Where a score's count starts: about an eighth below it (at least 3), never
 * under 0 and never with fewer digits than the score, so the figure keeps its
 * width while it counts and nothing beside it moves.
 */
export function revealCountFrom(value: number): number {
  const target = Math.round(value);
  if (target <= 0) return target;
  const floor = target >= 10 ? 10 ** Math.floor(Math.log10(target)) : 0;
  const near = Math.round(target - Math.max(3, target * 0.12));
  return Math.max(floor, near);
}

/** How long a score takes to count, in milliseconds: quick, then settled. */
export const REVEAL_COUNT_MS = 720;

/**
 * The score to print and the ref of the element that holds it: the score
 * itself, unless (only with motion allowed) the element is below the fold
 * when the page goes live: then the near value until it is seen, then
 * counting up to the score once. A score on screen at mount is never
 * touched, nor one that is not a number.
 */
export function useRevealCount<T extends HTMLElement>(
  score: number | null | undefined,
  enabled = true,
) {
  const [ref, reveal] = useRevealBelowFold<T>();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!enabled || reveal !== "played") return;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const next = Math.min(1, (now - started) / REVEAL_COUNT_MS);
      setProgress(next);
      if (next < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled, reveal]);

  const ranked = typeof score === "number" && Number.isFinite(score);
  if (!enabled || !ranked || reveal === "static") return [ref, score] as const;
  const target = Math.round(score);
  const from = revealCountFrom(target);
  const shown = reveal === "armed" ? from : countUpValue(from, target, progress);
  return [ref, shown] as const;
}
