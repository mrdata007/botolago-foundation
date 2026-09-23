import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Vertical rhythm wrapper for page sections.
 *
 * Establishes consistent spacing between sections (mt-9 on ≥sm, mt-7 on
 * mobile) so section-to-section flow feels editorial rather than a wall of
 * stacked cards. Applies a gentle slide+fade on mount that respects
 * `prefers-reduced-motion` (global CSS in styles.css disables it).
 *
 * Every section fades in at the same moment. They used to cascade on a
 * per-section delay (60ms a step), which held content back — the lower
 * sections finished animating before anyone scrolled to them, and under
 * reduced motion they stayed hidden for the delay and then popped in.
 */
export function Section({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "mt-7 sm:mt-9",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ease-out",
        className,
      )}
    >
      {children}
    </section>
  );
}
