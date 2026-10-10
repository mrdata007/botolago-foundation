/**
 * The profile a season's token is drawn from. The current season is the card as it stands (a new
 * season with no number of its own is a forming token, not last season's number again); an earlier
 * season is that season's final number and tier, on the manager's own name, club and serial.
 * The browser draws what the server stored; it computes nothing.
 */
import type { MyCardDto, SeasonSummaryDto } from "@/backend/manager-card/contracts";
import { cardView } from "./curva-state";
import { fromMyCard } from "@/components/manager-card/to-profile";
import type { CardProfile } from "@/components/manager-card/types";

const EMPTY_STATS = { cap: null, sel: null, trf: null, con: null } as const;

export function seasonProfile(card: MyCardDto, season: SeasonSummaryDto): CardProfile {
  const base = fromMyCard(card);
  if (season.seasonId === card.season.id) {
    if (!cardView(card).newSeason) return base;
    return {
      ...base,
      ovr: null,
      tier: null,
      provisional: false,
      counted: card.gameweeksCounted,
      season: card.season.label,
      stats: {
        cap: card.stats.cap.value,
        sel: card.stats.sel.value,
        trf: card.stats.trf.value,
        con: card.stats.con.value,
      },
    };
  }
  return {
    ...base,
    ovr: season.ovr,
    tier: season.tier,
    provisional: false,
    counted: season.ovr === null ? season.gameweeksCounted : null,
    season: season.label,
    stats: { ...EMPTY_STATS },
  };
}

/** The seasons a card lists, newest first (the server sends them so; this keeps it true). */
export function seasonsNewestFirst(card: MyCardDto): SeasonSummaryDto[] {
  const current = card.seasons.filter((season) => season.seasonId === card.season.id);
  const others = card.seasons.filter((season) => season.seasonId !== card.season.id);
  return [...current, ...others];
}
