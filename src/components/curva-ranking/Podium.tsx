import type { CSSProperties, JSX } from "react";

import { Figure, PersonName } from "@/components/curva/figures";
import { useCardCopy } from "@/components/manager-card/copy";
import { TierWord } from "@/components/manager-card/tier-word";
import { useCardPalette } from "@/components/manager-card/use-card-palette";
import type { TierCode } from "@/components/manager-card/types";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

import type { RankingEntry } from "./ranking";

/** Gold, silver and bronze: a fill and the ink that reads on it, the same in both themes. */
export const MEDALS: Record<1 | 2 | 3, { fill: string; ink: string }> = {
  1: { fill: "linear-gradient(to bottom, #ffe48a 0%, #f2b632 55%, #c98a12 100%)", ink: "#3a2604" },
  2: { fill: "linear-gradient(to bottom, #f4f7fb 0%, #c9d2de 55%, #9aa6b6 100%)", ink: "#1d2733" },
  3: { fill: "linear-gradient(to bottom, #ffd2ae 0%, #d98b53 55%, #a85d2c 100%)", ink: "#3b1b07" },
};

export function isMedal(rank: number): rank is 1 | 2 | 3 {
  return rank === 1 || rank === 2 || rank === 3;
}

/**
 * The first three rated managers on a floodlit band, the leader raised in the middle. It repeats
 * rows the list below already gives, so it is hidden from screen readers and carries none of the
 * rows' data attributes. The visual order 2, 1, 3 comes from `order`, the source stays 1, 2, 3.
 */
export function Podium({
  rows,
}: {
  rows: ReadonlyArray<{ entry: RankingEntry; rank: number }>;
}): JSX.Element | null {
  if (rows.length < 3) return null;
  const top = rows.slice(0, 3);
  return (
    <div
      aria-hidden
      data-testid="curva-ranking-podium"
      className={cn("cr-podium relative isolate overflow-hidden px-3 pb-0 pt-5", ui.radius.card)}
    >
      <span aria-hidden className="cr-podium-beam" />
      <div className="relative grid grid-cols-3 items-end gap-2">
        {top.map((row, index) => (
          <Step key={row.entry.teamId} entry={row.entry} rank={row.rank} place={index} />
        ))}
      </div>
    </div>
  );
}

const STEP_ORDER = ["order-2", "order-1", "order-3"];
const STEP_HEIGHT = ["h-16", "h-11", "h-8"];

function Step({
  entry,
  rank,
  place,
}: {
  entry: RankingEntry;
  rank: number;
  /** 0 for the leader. */
  place: number;
}): JSX.Element {
  const medal = MEDALS[isMedal(rank) ? rank : 3];
  const first = place === 0;
  return (
    <div
      className={cn("cr-step flex min-w-0 flex-col items-center gap-2", STEP_ORDER[place])}
      style={{ "--cr-i": place } as CSSProperties}
    >
      <TierPlate tier={entry.tier} ovr={entry.ovr} size={first ? "lg" : "md"} own={entry.own} />
      <p
        className={cn(
          "w-full truncate text-center text-[color:var(--ui-on-ink-plain)]",
          ui.text.meta,
          "[font-weight:var(--ui-weight-heavy)]",
        )}
      >
        <PersonName>{entry.name}</PersonName>
      </p>
      <div
        className={cn(
          "flex w-full items-start justify-center rounded-t-xl pt-1.5",
          STEP_HEIGHT[place],
        )}
        style={{ backgroundImage: medal.fill, color: medal.ink }}
      >
        <span className={cn(ui.stat.md, "leading-none")}>
          <Figure>{rank}</Figure>
        </span>
      </div>
    </div>
  );
}

/**
 * The rating on the tier's own lacquer, the way the card draws it: the plate and its deeper field,
 * the rim light, the tier word in the card's label colour. Before the card renderer loads it is the
 * base card's graphite.
 */
export function TierPlate({
  tier,
  ovr,
  size,
  own = false,
  caption = "tier",
}: {
  tier: TierCode | null;
  ovr: number | null;
  size: "sm" | "md" | "lg";
  own?: boolean;
  /** What the small line under the rating says: the tier's word, or « OVR » where the tier is written beside it. */
  caption?: "tier" | "ovr";
}): JSX.Element {
  const palette = useCardPalette(tier);
  const card = useCardCopy();
  const box =
    size === "lg"
      ? "min-w-[5.25rem] px-2.5 pb-2 pt-2.5"
      : size === "md"
        ? "min-w-[4.5rem] px-2 pb-1.5 pt-2"
        : "min-w-[3.5rem] px-2 pb-1 pt-1.5";
  return (
    <span
      className={cn(
        "cr-plate relative flex flex-col items-center overflow-hidden rounded-xl",
        box,
        own && "cr-plate-own",
      )}
      style={{
        backgroundImage: `linear-gradient(to bottom, ${palette.glow} 0%, ${palette.plate} 42%, ${palette.deep} 100%)`,
        boxShadow: `inset 0 0 0 1.5px ${palette.light}, 0 8px 18px -10px ${palette.plate}`,
        color: palette.word,
      }}
      data-tier={tier ?? undefined}
    >
      <span className="cr-plate-sheen" aria-hidden />
      <span
        className={cn(
          "relative leading-none [font-family:var(--ui-font-display)] [font-weight:var(--ui-weight-heavy)]",
          size === "lg" ? ui.stat.hero : size === "md" ? ui.stat.lg : ui.stat.md,
        )}
      >
        {ovr === null ? "…" : <Figure>{ovr}</Figure>}
      </span>
      <span
        className={cn(
          "relative mt-0.5 whitespace-nowrap [font-weight:var(--ui-weight-heavy)] leading-none",
          size === "lg" ? "text-[length:var(--ui-text-label)]" : "text-[0.625rem]",
        )}
        style={{ color: palette.label }}
      >
        {caption === "tier" && tier ? <TierWord tier={tier} /> : card.ovr}
      </span>
    </span>
  );
}
