import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { SectionHeader } from "@/components/common/SectionHeader";
import { useCurvaCopy } from "@/components/manager-card/copy";
import { fill } from "@/components/manager-card/interpolate";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

import { Figure } from "./figures";
import { SeasonRack } from "./SeasonRack";
import { seasonsNewestFirst } from "./season-profile";

/** The rack shows this many seasons on G1; the rest are on the seasons page. */
const ROW_LIMIT = 5;

/**
 * « Vos saisons »: one row, the seasons hanging from the rail, the current season's count of
 * counted journées, and a chevron to the seasons page (G6). Plan 4.1.
 */
export function SeasonsBlock({ card }: { card: MyCardDto }) {
  const copy = useCurvaCopy();
  const seasons = seasonsNewestFirst(card).slice(0, ROW_LIMIT);
  if (seasons.length === 0) return null;
  const current = card.seasons.find((season) => season.seasonId === card.season.id);
  return (
    <section data-testid="curva-seasons" aria-label={copy.seasonsTitle}>
      <SectionHeader title={copy.seasonsTitle} />
      <Link
        to="/curva/saisons"
        className={cn("press-tile block overflow-hidden", ui.surface.card, ui.focus)}
      >
        {/* The current season on the brand's navy (white and cyan text on the ink fill, both
            themes); the rack stays on the card's surface under it. */}
        <span
          className={cn(
            "flex min-h-[var(--ui-row-min)] items-center justify-between gap-3 px-4 py-3",
            ui.surface.inkPlain,
          )}
        >
          <span className="min-w-0">
            <span className={cn("block", ui.text.bodyStrong)}>
              {fill(copy.seasonsSeason, { season: <Figure>{card.season.label}</Figure> })}
            </span>
            {current ? (
              <span className={cn("block", ui.text.secondary, "text-[color:var(--ui-on-ink)]")}>
                {copy.countedRounds(current.gameweeksCounted)}
              </span>
            ) : null}
          </span>
          <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
        </span>
        <span className="block px-4 pb-3 pt-2">
          <SeasonRack card={card} seasons={seasons} size={44} />
        </span>
      </Link>
    </section>
  );
}
