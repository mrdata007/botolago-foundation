import { History } from "lucide-react";
import type { ReactNode } from "react";

import { useMomentCopy } from "@/components/manager-card/copy";
import { fill } from "@/components/manager-card/interpolate";
import { TierWord } from "@/components/manager-card/tier-word";
import type { ReplayItem } from "@/components/manager-card/types";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { MyCardDto } from "@/backend/manager-card/contracts";

import { Figure } from "./figures";

/**
 * « Revoir »: the moments that happened, one per row, each opening the replay sheet (WP4) on that
 * journée's stored values. The list stays under reduced motion, where a row opens the static
 * state. A row is at least 48px.
 */
export function RevoirList({
  items,
  card,
  onOpen,
}: {
  items: readonly ReplayItem[];
  card: MyCardDto;
  onOpen: (item: ReplayItem) => void;
}) {
  const moments = useMomentCopy();
  if (items.length === 0) return null;
  const labelOf = (item: ReplayItem): ReactNode => {
    switch (item.kind) {
      case "first_rating":
        return fill(moments.m12.itemFirstRating, { gw: item.gameweekSeq ?? "" });
      case "tier":
        return fill(moments.m12.itemTier, {
          tier: item.tier ? <TierWord tier={item.tier} /> : "",
          gw: item.gameweekSeq ?? "",
        });
      case "founder":
        return moments.m9.heading;
      case "season": {
        const season = card.seasons.find((s) => s.seasonId === item.seasonId);
        return fill(moments.m12.itemSeason, {
          season: <Figure>{season?.label ?? ""}</Figure>,
        });
      }
    }
  };
  return (
    <ul className="-mx-4 flex flex-col" data-testid="curva-revoir">
      {items.map((item, index) => (
        <li
          key={`${item.kind}-${item.seasonId ?? ""}-${item.tier ?? ""}-${item.gameweekSeq ?? index}`}
          className={cn(index < items.length - 1 && ui.rule.block)}
        >
          <button
            type="button"
            onClick={() => onOpen(item)}
            className={cn(
              "press flex w-full items-center gap-3 px-4 py-1.5 text-start",
              ui.space.row,
              ui.text.bodyStrong,
              ui.tone.default,
              ui.focus,
            )}
          >
            <span
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center",
                ui.radius.full,
                ui.surface.sunken,
                ui.tone.ink,
              )}
            >
              <History className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-pretty">{labelOf(item)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
