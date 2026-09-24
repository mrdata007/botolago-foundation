import { useEffect, useState } from "react";

/**
 * Whether `element` has scrolled up out of view under the sticky bar
 * (`[data-match-bar]`): the moment the match page swaps its white bar for the
 * compact club-colour one.
 *
 * An IntersectionObserver whose root is shrunk by the bar's height, so
 * "leaving the viewport" means "disappearing under the bar" — no scroll
 * handler. The element is state (a callback ref), not a ref object: the
 * header mounts only once the match has loaded, after this hook first runs.
 *
 * `false` on the server and on the first client render, so both agree.
 */
export function useScrolledPast(element: HTMLElement | null): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    if (!element || typeof IntersectionObserver === "undefined") {
      setPast(false);
      return;
    }
    const bar = document.querySelector<HTMLElement>("[data-match-bar]");
    const inset = Math.round(bar?.getBoundingClientRect().height ?? 0);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setPast(!entry.isIntersecting && entry.boundingClientRect.top < inset);
      },
      { rootMargin: `-${inset}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return past;
}
