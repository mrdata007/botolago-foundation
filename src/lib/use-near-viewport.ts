import { useEffect, useState } from "react";

/**
 * True once the element matching `selector` is within `rootMargin` of the
 * viewport, and from then on. For data only a section far down the page
 * shows: the request waits until the reader is about to see it instead of
 * competing with the first screen.
 *
 * It fails open: with no matching element or no IntersectionObserver the
 * answer becomes true at once, so the data is never withheld for good. False
 * on the server and on the first client render.
 */
export function useNearViewport(selector: string, rootMargin = "600px"): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near) return;
    const element = document.querySelector(selector);
    if (!element || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near, selector, rootMargin]);
  return near;
}
