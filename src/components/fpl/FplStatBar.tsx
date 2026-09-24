import type { CSSProperties, ReactNode } from "react";

import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export interface FplStatItem {
  label: ReactNode;
  value: ReactNode;
  /** `grey` quiets the value: a state that is spent or unavailable. */
  tone?: "ink" | "grey";
  /**
   * The value is a word ("Illimité", "JOUER", a date), not a figure. The stat
   * ramp is numerals only, so a word takes the body type instead.
   */
  text?: boolean;
  /** A unit set beside a figure, on the text ramp ("pts"). */
  unit?: ReactNode;
  /** A line under the value: the scoring state, a countdown. */
  sub?: ReactNode;
}

/**
 * The navy summary strip (A-Team, A-Players): full-bleed ink, a light label
 * over a white figure per column, the columns split by a hairline.
 *
 * `hero` makes the first column wider and its figure the screen's one number
 * ("58 pts" on Points). Figures are `ui.stat.*` — Manrope, tabular — and not
 * the boards' Changa: these are figures laid out in a grid, which the design
 * system keeps on the stat ramp (§2.2); Changa has no tabular digits.
 *
 * Translated from the boards rather than copied: the column rule is a logical
 * `border-s` (their `inset 1px 0 0` shadow stays on the left in Arabic), the
 * texture is `club-stripes` at 4% (its angle flips with the direction; the
 * boards' `-45deg` does not), and the label tone is `--ui-on-ink-muted`.
 */
export function FplStatBar({
  items,
  hero = false,
  footer,
  className,
}: {
  items: FplStatItem[];
  hero?: boolean;
  /** A full-width line under the columns (the gameweek deadline), past a hairline. */
  footer?: ReactNode;
  className?: string;
}) {
  const columns = items
    .map((_, index) => (hero && index === 0 ? "minmax(0,1.3fr)" : "minmax(0,1fr)"))
    .join(" ");
  const rows = items.some((item) => item.sub) ? 3 : 2;
  return (
    <div
      className={cn("px-[var(--ui-gutter)]", ui.surface.inkPlain, ui.club.stripes, className)}
      style={{ "--stripe-alpha": "4%" } as CSSProperties}
    >
      {/*
        Label, figure and sub-line are three shared ROWS across the columns
        (each column is a subgrid spanning them), so every figure sits on one
        line whatever its label does: "TRANSFERTS GRATUITS" wraps to two lines
        at 390px, and a sub-line under one figure no longer drags the others.
      */}
      <div
        className="grid gap-y-0.5 py-3"
        style={{ gridTemplateColumns: columns, gridTemplateRows: `repeat(${rows}, auto)` }}
      >
        {items.map((item, index) => {
          const lead = hero && index === 0;
          return (
            <div
              key={index}
              className={cn(
                "grid min-w-0 grid-rows-subgrid",
                rows === 3 ? "row-span-3" : "row-span-2",
                index > 0 &&
                  "border-s border-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_16%,transparent)] ps-3.5",
                index < items.length - 1 && "pe-2",
              )}
            >
              <span className={cn("self-end text-balance", ui.text.label, ui.tone.onInkMuted)}>
                {item.label}
              </span>
              <span
                className={cn(
                  "flex min-w-0 items-baseline gap-1 self-center",
                  item.tone === "grey" ? ui.tone.onInkMuted : ui.tone.onInkPlain,
                )}
              >
                <span
                  className={cn(
                    // A word never runs into the next column: it wraps first.
                    "min-w-0 break-words",
                    item.text
                      ? cn(ui.text.secondary, "[font-weight:var(--ui-weight-heavy)]")
                      : lead
                        ? ui.stat.hero
                        : ui.stat.lg,
                  )}
                >
                  {item.value}
                </span>
                {item.unit ? (
                  <span className={cn(ui.text.meta, "[font-weight:var(--ui-weight-heavy)]")}>
                    {item.unit}
                  </span>
                ) : null}
              </span>
              {item.sub ? (
                <span
                  className={cn(
                    "min-w-0 self-start",
                    ui.text.meta,
                    "[font-weight:var(--ui-weight-heavy)]",
                    ui.tone.onInkPlain,
                  )}
                >
                  {item.sub}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      {footer ? (
        <div className="border-t border-[color:color-mix(in_oklab,var(--ui-on-ink-plain)_16%,transparent)] pb-2.5 pt-2">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
