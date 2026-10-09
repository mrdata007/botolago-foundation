import type { ReactNode } from "react";

import { ui, UiBadge } from "@/components/ui-kit";
import { useCardCopy } from "@/components/manager-card/copy";
import { cn } from "@/lib/utils";

/**
 * Small shared pieces of the Gradins screens: a figure that keeps its order inside Arabic text,
 * the « Provisoire » pill, and the dash that stands for a number the server has not given.
 */

/**
 * The Fantasy frame's column, clipped with `overflow: clip` from 768px so the card's column can
 * stick: the frame's default `overflow: hidden` would make the column the scroll box of a sticky
 * child, and it never scrolls. `flow-root` keeps the block formatting context `hidden` gave.
 * Passed as the frame's `className`, so the section leaves the shell's frame as it is.
 */
export const STICKY_COLUMN_CLASS = "md:flow-root md:overflow-clip";

/** Western digits, isolated: `<bdi dir="ltr">`, so a neighbouring word cannot reorder them. */
export function Figure({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}

/** A name another person chose, whichever way it reads. */
export function PersonName({ children }: { children: ReactNode }) {
  return <bdi dir="auto">{children}</bdi>;
}

/**
 * « Provisoire » / «مبدئي»: on every surface that shows a provisional number, as text beside the
 * number (never colour alone). Outline, not sunken: a provisional number is current, not spent.
 */
export function ProvisionalBadge({ className }: { className?: string }) {
  const copy = useCardCopy();
  return (
    <UiBadge tone="outline" className={cn("shrink-0 whitespace-nowrap", className)}>
      {copy.provisional}
    </UiBadge>
  );
}

/** « — »: an unknown number. Never 0. */
export const DASH = "—";

/**
 * A statistic's code (« CAP », « SEL »): the label size, heavy, set as written. The codes are
 * abbreviations, so they need no uppercase transform and no letter-spacing, which is what makes
 * a label an eyebrow.
 */
export const CODE_CLASS = cn(
  "text-[length:var(--ui-text-label)] [font-weight:var(--ui-weight-heavy)] leading-[var(--ui-leading-flat)]",
  ui.tone.muted,
);

/** A short caption above content (« Prochain match »): sentence case, never an eyebrow. */
export const CAPTION_CLASS = cn(
  ui.text.meta,
  "[font-weight:var(--ui-weight-heavy)]",
  ui.tone.muted,
);

/**
 * The heading of a section that explains rather than belongs (« Ce que dit votre carte »): the
 * 17px heading step in the muted tone, a size and a tone down from the section headings, so the
 * people, the club and the seasons lead the page.
 */
export function QuietHeading({ children }: { children: ReactNode }) {
  return <h2 className={cn("pb-2.5", ui.text.section, ui.tone.muted)}>{children}</h2>;
}
