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
 * It draws on the first frame, with no mount animation. Sections used to fade
 * in from opacity 0 over 500ms while sliding 8px, which blanked the body of
 * every page for its first frames, then moved each block as its data arrived
 * (docs/engineering/MOTION_CALM_SCREENS.md).
 */
export function Section({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("mt-5 sm:mt-8", className)}>{children}</section>;
}
