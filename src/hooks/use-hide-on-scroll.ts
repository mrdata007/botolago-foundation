import { useEffect, useState } from "react";

/**
 * True while the reader is scrolling down the page, false as soon as they
 * scroll back up or return to the top — for a bar that gets out of the way
 * and comes back (the Premier League site's live bar does this).
 *
 * `threshold` ignores jitter smaller than that many pixels; `topZone` keeps
 * the bar shown near the top of the page, where there is nothing to make
 * room for. Scroll reads are batched to one per animation frame.
 */
export function useHideOnScroll({ threshold = 8, topZone = 80 } = {}): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      if (y <= topZone) {
        setHidden(false);
        lastY = y;
        return;
      }
      const delta = y - lastY;
      if (Math.abs(delta) < threshold) return;
      setHidden(delta > 0);
      lastY = y;
    };
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [threshold, topZone]);

  return hidden;
}
