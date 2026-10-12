import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "@/lib/motion";

type Phase = "rest" | "from" | "to";

/**
 * A block that arrives after the page is already on screen (the live-matches
 * strip, the Fantasy deadline banner, a "Mes clubs" row) grows into place
 * instead of shoving what is below it down in one frame: a short height reveal
 * (`grid-template-rows` 0fr to 1fr) with a fade, on the settle ease
 * (docs/engineering/MOTION_CALM_SCREENS.md).
 *
 * The rule: if `show` is already true on the first render (cached or
 * server-rendered data) the block is drawn at full size with no animation.
 * Only a `show` that turns true later animates. Reduced motion: instant.
 *
 * At rest the wrapper adds no box of its own when `transparent` (a sticky
 * child, like the live strip, must stick against the page and not against a
 * wrapper), or is a plain block carrying `className` (negative margins and so
 * on). Nothing is rendered while `show` is false.
 */
export function RevealOnArrive({
  show,
  children,
  className,
  transparent = false,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
  transparent?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("rest");
  const wasShown = useRef(show);

  useLayoutEffect(() => {
    const arrived = show && !wasShown.current;
    wasShown.current = show;
    if (!arrived || prefersReducedMotion()) return;
    // Paint the collapsed state, then open it on the next frame.
    setPhase("from");
  }, [show]);

  useEffect(() => {
    if (phase === "from") {
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setPhase("to")));
      return () => cancelAnimationFrame(frame);
    }
    if (phase === "to") {
      // `transitionend` can be missed (a hidden tab); this always settles it.
      const timer = window.setTimeout(() => setPhase("rest"), 320);
      return () => window.clearTimeout(timer);
    }
  }, [phase]);

  if (!show) return null;

  if (phase === "rest") {
    return <div className={cn(transparent && "contents", className)}>{children}</div>;
  }

  return (
    <div
      className={cn("grid", className)}
      style={{
        gridTemplateRows: phase === "to" ? "1fr" : "0fr",
        opacity: phase === "to" ? 1 : 0,
        transition:
          phase === "to"
            ? "grid-template-rows 240ms var(--ease-settle-soft), opacity 200ms var(--ease-settle-soft)"
            : "none",
      }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
