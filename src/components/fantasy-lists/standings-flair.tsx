import type { ReactNode } from "react";

import { FlashOnChange } from "@/components/common/AnimatedNumber";
import { ui, UiRankMovement } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { OrdinalParts } from "./rank-ordinal";

/**
 * The lively standings look (brief 2026-10-28 "more life", item 5): the
 * "your position" band on the header gradient, gold / silver / bronze rank
 * badges, the reader's row on an action-gradient tint, coloured movement
 * pills and a brand-tinted table head. Used by `/fantasy/rankings` and
 * `/fantasy/leagues/$leagueId`; nothing else imports it, so no other screen
 * changes.
 *
 * Every gradient is `to bottom` (a `deg` angle mirrors wrong under
 * `dir="rtl"`), every edge is logical, and nothing here animates: the one
 * motion is the existing `FlashOnChange` on a real rank change.
 */

/**
 * The medal fills. Light in both themes, with `--ui-ink-deep` digits: the
 * lowest stop of each (bronze, L 0.74) still clears 4.5:1 against the
 * ink-deep navy (L 0.22-0.24), so the figure reads the same in dark mode.
 */
const MEDAL_FILL: Record<1 | 2 | 3, string> = {
  1: "linear-gradient(to bottom, oklch(0.94 0.12 95) 0%, oklch(0.82 0.15 82) 100%)",
  2: "linear-gradient(to bottom, oklch(0.96 0.006 250) 0%, oklch(0.82 0.02 250) 100%)",
  3: "linear-gradient(to bottom, oklch(0.89 0.07 66) 0%, oklch(0.75 0.11 54) 100%)",
};

/**
 * A rank cell's content: a medal disc for 1, 2 and 3 (ties included, so two
 * managers sharing first both get gold), the plain figure otherwise. The
 * figure keeps the cell's stat step, which the caller sets on the cell.
 */
export function StandingsRank({ rank, nf }: { rank: number; nf: Intl.NumberFormat }) {
  if (rank === 1 || rank === 2 || rank === 3) {
    return (
      <span
        className={cn(
          "inline-grid h-8 min-w-8 place-items-center px-1.5",
          ui.radius.full,
          ui.shadow.card,
          "text-[color:var(--ui-ink-deep)] [font-weight:var(--ui-weight-heavy)]",
          "ring-1 ring-inset ring-[color:color-mix(in_oklab,var(--ui-ink-deep)_14%,transparent)]",
        )}
        style={{ backgroundImage: MEDAL_FILL[rank] }}
      >
        <bdi>{nf.format(rank)}</bdi>
      </span>
    );
  }
  return <bdi>{nf.format(rank)}</bdi>;
}

/**
 * The quiet ▲/▼ movement, set in a pill tinted by its direction: green up,
 * red down, no fill when unchanged or unknown. The pill is an opaque mix with
 * the surface, so it reads the same on a plain row and on the reader's tinted
 * one; the text keeps the measured `--ui-positive-text` / `--ui-negative-text`.
 */
export function MovementPill({
  rank,
  previousRank,
  labels,
  formatDelta,
}: {
  rank: number;
  previousRank: number | null;
  labels: { up: string; down: string; same: string; unknown?: string };
  formatDelta: (places: number) => string;
}) {
  const tint =
    previousRank === null || previousRank === rank
      ? null
      : previousRank > rank
        ? "bg-[color:color-mix(in_oklab,var(--ui-positive)_18%,var(--ui-surface))] ring-[color:color-mix(in_oklab,var(--ui-positive)_40%,transparent)]"
        : "bg-[color:color-mix(in_oklab,var(--ui-negative)_18%,var(--ui-surface))] ring-[color:color-mix(in_oklab,var(--ui-negative)_40%,transparent)]";
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap px-2 py-0.5",
        ui.radius.full,
        tint && cn("ring-1 ring-inset", tint),
      )}
    >
      <UiRankMovement
        variant="quiet"
        rank={rank}
        previousRank={previousRank}
        labels={labels}
        formatDelta={formatDelta}
      />
    </span>
  );
}

/** The table head: a light spring-to-sky wash and ink labels instead of grey. */
export const STANDINGS_HEAD =
  "[background-image:linear-gradient(to_bottom,color-mix(in_oklab,var(--ui-accent-spring)_20%,var(--ui-surface)),color-mix(in_oklab,var(--ui-accent-sky)_28%,var(--ui-surface)))]";
/** Each head cell: the themed ink foreground (navy light, pale blue dark). */
export const STANDINGS_HEAD_CELL = "text-[color:var(--ui-ink-fg)]";

/**
 * The reader's row: the action gradient (spring to sky) mixed into the
 * surface, so the default and muted text keep their contrast in both themes,
 * with an ink edge on the inline-start cell (the right edge in Arabic).
 */
export const STANDINGS_ME_ROW = cn(
  "[background-image:linear-gradient(to_bottom,color-mix(in_oklab,var(--ui-accent-spring)_24%,var(--ui-surface)),color-mix(in_oklab,var(--ui-accent-sky)_24%,var(--ui-surface)))]",
  "[&>td:first-child]:border-s-4 [&>td:first-child]:border-s-[color:var(--ui-ink-fg)]",
);

/**
 * The header gradient band for "your position", with a surface wash over its
 * lower half. The token's last stop is deep enough in the light theme that
 * navy body text on it measures under 4.5:1; the wash lifts it, and in the
 * dark theme (where the band is deep and the text pale) it deepens it.
 */
const BAND =
  "linear-gradient(to bottom, transparent 35%, color-mix(in oklab, var(--ui-surface) 38%, transparent) 100%), var(--ui-grad-header)";

/**
 * "Mon classement" as a card: the kicker and the rank, large, on the header
 * gradient, an optional control at the inline end, and a surface strip below
 * for the details line.
 */
export function RankHeroCard({
  kicker,
  parts,
  rank,
  trailing,
  children,
}: {
  kicker: string;
  /** The rank as an ordinal (`rankOrdinal`). */
  parts: OrdinalParts;
  /** The raw rank, for the flash on a live change (lower is better). */
  rank: number;
  trailing?: ReactNode;
  /** The details strip under the band. */
  children: ReactNode;
}) {
  const spoken = [parts.before, `${parts.figure}${parts.after}`].filter(Boolean).join(" ");
  return (
    <div className={cn("overflow-hidden", ui.surface.card, ui.shadow.lifted)}>
      <div
        className="flex items-center gap-3 px-4 pb-4 pt-3 text-[color:var(--ui-on-grad-header)]"
        style={{ backgroundImage: BAND }}
      >
        <div className="min-w-0 flex-1">
          <p className={ui.text.label}>{kicker}</p>
          <p className="mt-1">
            <FlashOnChange value={rank} better="lower">
              <span className="sr-only">{spoken}</span>
              <span aria-hidden className="inline-flex items-baseline">
                {parts.before ? (
                  <span
                    className={cn(
                      "me-1.5",
                      ui.text.bodyStrong,
                      "[font-weight:var(--ui-weight-heavy)]",
                    )}
                  >
                    {parts.before}
                  </span>
                ) : null}
                <bdi className={ui.score.hero}>{parts.figure}</bdi>
                {parts.after ? (
                  <span
                    className={cn(
                      "ms-0.5 self-start",
                      ui.text.bodyStrong,
                      "[font-weight:var(--ui-weight-heavy)]",
                    )}
                  >
                    {parts.after}
                  </span>
                ) : null}
              </span>
            </FlashOnChange>
          </p>
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5",
          ui.text.secondary,
          ui.tone.default,
        )}
      >
        {children}
      </div>
    </div>
  );
}
