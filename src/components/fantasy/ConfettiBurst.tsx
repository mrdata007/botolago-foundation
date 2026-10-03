import { useEffect, useMemo, type CSSProperties } from "react";

import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

const PIECES = 24;
/** How long the burst stays in the page before it removes itself. */
const BURST_MS = 1400;

const COLOURS = [
  "bg-[color:var(--ui-accent-spring)]",
  "bg-[color:var(--ui-accent-sky)]",
  "bg-[color:var(--ui-caution)]",
  "bg-[color:var(--ui-ink-fg)]",
] as const;

/**
 * Where each piece ends up, from the burst's centre. Fixed numbers from a
 * small generator rather than `Math.random()`, so the burst is the same every
 * time and a test can pin it. Pieces fan out and fall (positive `dy` bias).
 */
export function confettiPieces(count = PIECES): Array<{
  dx: number;
  dy: number;
  rot: number;
  delay: number;
  colour: number;
}> {
  let seed = 7;
  const next = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + next() * 0.4;
    const reach = 70 + next() * 90;
    return {
      dx: Math.round(Math.cos(angle) * reach),
      dy: Math.round(Math.sin(angle) * reach * 0.8 + 50 + next() * 40),
      rot: Math.round((next() - 0.5) * 720),
      delay: Math.round(next() * 80),
      colour: index % COLOURS.length,
    };
  });
}

/**
 * A short burst of confetti over the page, for a transfer that has just been
 * confirmed: about two dozen small pieces, made of CSS, gone after a second
 * and a bit. It takes no clicks and is hidden from assistive tech (the toast
 * says what happened). Nothing is drawn under reduced motion.
 */
export function ConfettiBurst({ onDone }: { onDone?: () => void }) {
  const pieces = useMemo(() => confettiPieces(), []);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    const timer = setTimeout(() => onDone?.(), reduced ? 0 : BURST_MS);
    return () => clearTimeout(timer);
  }, [onDone, reduced]);

  if (reduced) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-[38%] z-50 flex justify-center"
    >
      {pieces.map((piece, index) => (
        <span
          key={index}
          className={cn("confetti-piece absolute h-3 w-2 rounded-[2px]", COLOURS[piece.colour])}
          style={
            {
              "--dx": `${piece.dx}px`,
              "--dy": `${piece.dy}px`,
              "--rot": `${piece.rot}deg`,
              animationDelay: `${piece.delay}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
