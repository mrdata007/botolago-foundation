import type { ReactNode, CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Vertical rhythm wrapper for Home sections.
 *
 * Establishes consistent spacing between sections (mt-9 on ≥sm, mt-7 on
 * mobile) so section-to-section flow feels editorial rather than a wall of
 * stacked cards. Applies a gentle slide+fade reveal that respects
 * `prefers-reduced-motion` (global CSS in styles.css disables the transform).
 *
 * `index` sets a staggered animation-delay so sections cascade into view
 * as the user scrolls the initial fold. Purely CSS; zero runtime cost.
 */
export function Section({
  children,
  className,
  index = 0,
}: {
  children: ReactNode;
  className?: string;
  index?: number;
}) {
  const style: CSSProperties = {
    animationDelay: `${Math.min(index, 6) * 60}ms`,
    animationFillMode: "both",
  };
  return (
    <section
      className={cn(
        "mt-7 sm:mt-9",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ease-out",
        className,
      )}
      style={style}
    >
      {children}
    </section>
  );
}
