import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { OrdinalParts } from "./rank-ordinal";

/**
 * A rank as an ordinal — "12 483ᵉ", "3e", "المركز 12.483".
 *
 * The figure is display type (`ui.score.*`, digits only) and the affix is its
 * sibling on the text ramp, never inside it: see `rank-ordinal.ts`. On the
 * hero size the French affix rides at the top of the line like a superscript;
 * an Arabic affix is a word before the figure and stays on the baseline.
 *
 * The visible parts are hidden from assistive tech and the whole ordinal is
 * read once, as one string, so "12 483" and "e" are not announced as two
 * separate things.
 */
export function RankOrdinal({
  parts,
  size = "row",
  className,
}: {
  parts: OrdinalParts;
  /** `hero` — the "your position" figure (score md); `row` — a list row (score row). */
  size?: "hero" | "row";
  className?: string;
}) {
  const spoken = [parts.before, `${parts.figure}${parts.after}`].filter(Boolean).join(" ");
  return (
    <span className={cn("inline-flex", className)}>
      <span className="sr-only">{spoken}</span>
      <span aria-hidden className="inline-flex items-baseline">
        {parts.before ? (
          <span
            className={cn(
              "me-1.5",
              size === "hero" ? ui.text.bodyStrong : ui.text.meta,
              "[font-weight:var(--ui-weight-heavy)]",
              ui.tone.muted,
            )}
          >
            {parts.before}
          </span>
        ) : null}
        <bdi className={size === "hero" ? ui.score.md : ui.score.row}>{parts.figure}</bdi>
        {parts.after ? (
          // Changa's digits carry their own side bearing, so the affix sits
          // flush on the row size and just off the figure on the hero.
          <span
            className={cn(
              size === "hero" ? cn("ms-0.5 self-start", ui.text.bodyStrong) : ui.text.meta,
              "[font-weight:var(--ui-weight-heavy)]",
            )}
          >
            {parts.after}
          </span>
        ) : null}
      </span>
    </span>
  );
}
