/**
 * The « Revoir » list: the moments that happened, derived from what the server stored and never
 * invented (plan 4.6, `m12.item.*`):
 *
 *   - the season's first rating (the earliest journée with a number);
 *   - the first time at each tier above the first rating's (STADE, PRO, CHAMPION, LEGEND), at the
 *     earliest journée that held it;
 *   - the founder mark, when the card has it (drawn from the current card);
 *   - each season that has closed.
 *
 * Each item names the beat its replay plays. Newest first, as the rest of the page is.
 */
import type { HistoryRowDto, MyCardDto, SeasonSummaryDto } from "@/backend/manager-card/contracts";
import {
  TIER_CODES,
  type BeatName,
  type ReplayItem,
  type TierCode,
} from "@/components/manager-card/types";

function tierBeat(tier: TierCode): BeatName {
  return tier === "legend" ? "legend" : "tier";
}

export function deriveReplayItems(
  card: MyCardDto,
  history: readonly HistoryRowDto[],
  seasonId: string = card.season.id,
): ReplayItem[] {
  const items: ReplayItem[] = [];
  const rated = history
    .filter((row) => row.ovr !== null && row.seasonId === seasonId)
    .sort((a, b) => a.gameweekSeq - b.gameweekSeq);
  const first = rated[0];
  if (first) {
    items.push({
      kind: "first_rating",
      seasonId: first.seasonId,
      gameweekSeq: first.gameweekSeq,
      tier: first.tier,
      beat: "first",
      row: first,
    });
    for (const tier of TIER_CODES) {
      if (tier === "homa" || tier === first.tier) continue;
      const row = rated.find((r) => r.tier === tier);
      if (!row || row.gameweekSeq <= first.gameweekSeq) continue;
      items.push({
        kind: "tier",
        seasonId: row.seasonId,
        gameweekSeq: row.gameweekSeq,
        tier,
        beat: tierBeat(tier),
        row,
      });
    }
  }
  if (card.founder) {
    items.push({
      kind: "founder",
      seasonId: null,
      gameweekSeq: null,
      tier: null,
      beat: "founder",
      row: null,
    });
  }
  for (const season of closedSeasons(card)) {
    items.push({
      kind: "season",
      seasonId: season.seasonId,
      gameweekSeq: null,
      tier: season.tier,
      beat: "castoff",
      row: null,
    });
  }
  return items;
}

/** The seasons that have closed, newest first. */
export function closedSeasons(card: MyCardDto): SeasonSummaryDto[] {
  return card.seasons.filter((season) => season.closedAt !== null);
}

/** The beat the stage's « Revoir » button plays: the first rating's, else the card's making. */
export function stageReplayBeat(card: MyCardDto): BeatName {
  return card.firstRatedGameweekSeq !== null && card.ovr !== null ? "first" : "make";
}
