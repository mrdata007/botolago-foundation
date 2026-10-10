import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { useCardCopy, useMomentCopy } from "@/components/manager-card/copy";
import { STAT_CODES, type StatCode } from "@/components/manager-card/types";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

import { CODE_CLASS, DASH, Figure } from "./figures";

/**
 * One statistic of the card: its code, its value (or a dash), what it is, and, when it is empty,
 * why. The value is the server's; a missing one is « — » with the server's reason, never 0
 * (plan 4.1 and 4.2). Used by G1's four tiles and G2's « D'où vient votre note ».
 */
export function StatTile({
  code,
  stat,
  minRated,
  className,
  variant = "full",
}: {
  code: StatCode;
  stat: MyCardDto["stats"][StatCode];
  minRated: number;
  className?: string;
  /** `quiet`: G1's explanation of the note, a size down; `full`: G2, where it is the point. */
  variant?: "full" | "quiet";
}) {
  const copy = useCardCopy();
  const empty = stat.value === null;
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-0.5 px-4",
        variant === "quiet" ? "py-2.5" : "py-3",
        className,
      )}
      data-stat={code}
    >
      <span className={CODE_CLASS}>{copy.stat[code]}</span>
      <span
        className={cn(
          variant === "quiet" ? ui.stat.lg : ui.stat.hero,
          empty ? ui.tone.muted : ui.tone.default,
        )}
      >
        {empty ? DASH : <Figure>{stat.value}</Figure>}
      </span>
      <span
        className={cn(
          "text-balance",
          ui.text.meta,
          variant === "quiet" ? ui.tone.muted : ui.tone.default,
        )}
      >
        {copy.statLong[code]}
      </span>
      {empty && stat.nullReason ? (
        <span className={cn("text-balance", ui.text.micro, "leading-snug", ui.tone.muted)}>
          {copy.reasonText(stat.nullReason, minRated)}
        </span>
      ) : null}
    </li>
  );
}

/**
 * « Ce que dit votre carte »: the four statistics in a 2 × 2 grid inside one card, and the whole
 * card goes to « Votre carte » (G2), where each one is explained. A statistic that is not there
 * yet shows its reason, not a zero.
 */
export function StatTiles({ card }: { card: MyCardDto }) {
  const moments = useMomentCopy();
  return (
    <Link
      to="/curva/carte"
      className={cn("press-tile block overflow-hidden", ui.surface.card, ui.focus)}
      data-testid="curva-stat-tiles"
    >
      <ul className="grid grid-cols-2">
        {STAT_CODES.map((code, index) => (
          <StatTile
            key={code}
            code={code}
            stat={card.stats[code]}
            minRated={card.minRated}
            variant="quiet"
            className={cn(
              index % 2 === 0 && "border-e border-[color:var(--ui-rule)]",
              index < 2 && "border-b border-[color:var(--ui-rule)]",
            )}
          />
        ))}
      </ul>
      <span
        className={cn(
          "flex min-h-[var(--ui-row-min)] items-center justify-between gap-2 border-t border-[color:var(--ui-rule)] px-4",
          ui.text.meta,
          "[font-weight:var(--ui-weight-heavy)]",
          ui.tone.ink,
        )}
      >
        {moments.m4.heroDetail}
        <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
      </span>
    </Link>
  );
}
