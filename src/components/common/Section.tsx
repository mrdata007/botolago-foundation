import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Vertical rhythm wrapper for page sections.
 *
 * Option A spacing: 20px between sections on a phone (`mt-5`), 32px from
 * `sm` up. The boards break sections at about 20px above a heading and 10px
 * below it (the header's own `pb-2.5`); the previous 28/36px rhythm read as
 * a page of islands next to them. A caller that needs a different gap passes
 * its own `mt-*` in `className` — last one wins.
 *
 * Applies a gentle slide+fade on mount that respects
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
        "mt-5 sm:mt-8",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ease-out",
        className,
      )}
    >
      {children}
    </section>
  );
}
