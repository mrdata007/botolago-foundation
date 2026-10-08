import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { SectionHeader } from "@/components/common/SectionHeader";
import { useGradinsCopy } from "@/components/manager-card/copy";
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
  const copy = useGradinsCopy();
  const seasons = seasonsNewestFirst(card).slice(0, ROW_LIMIT);
  if (seasons.length === 0) return null;
  const current = card.seasons.find((season) => season.seasonId === card.season.id);
  return (
    <section data-testid="gradins-seasons" aria-label={copy.seasonsTitle}>
      <SectionHeader title={copy.seasonsTitle} />
      <Link to="/gradins/saisons" className={cn("press-tile block", ui.surface.card, ui.focus)}>
        <span className="flex min-h-[var(--ui-row-min)] items-center justify-between gap-3 px-4 pt-3">
          <span className="min-w-0">
            <span className={cn("block", ui.text.bodyStrong, ui.tone.default)}>
              {fill(copy.seasonsSeason, { season: <Figure>{card.season.label}</Figure> })}
            </span>
            {current ? (
              <span className={cn("block", ui.text.secondary, ui.tone.muted)}>
                {copy.countedRounds(current.gameweeksCounted)}
              </span>
            ) : null}
          </span>
          <ChevronRight className={cn("h-5 w-5 shrink-0", ui.tone.muted)} aria-hidden />
        </span>
        <span className="block px-4 pb-3 pt-1">
          <SeasonRack card={card} seasons={seasons} size={44} />
        </span>
      </Link>
    </section>
  );
}
