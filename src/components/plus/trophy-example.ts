import type { CatalogTrophy, TrophiesCabinet } from "@/backend/trophies/contracts";

/**
 * The cabinet drawn under the blur of a locked reader: the catalogue's own names with made-up
 * figures. Presentation, not protection: nothing of the reader's own cabinet is ever passed in here
 * (only the catalogue, which is the same for everyone).
 */
const EXAMPLE_FACTS: Record<string, { gw: number; facts: Record<string, unknown> }> = {
  first_rating: { gw: 3, facts: { ovr: 62 } },
  first_stade: { gw: 7, facts: { ovr: 70 } },
  gw_80: { gw: 8, facts: { score: 81 } },
  ten_gameweeks: { gw: 10, facts: { played: 10 } },
  winning_transfer: { gw: 8, facts: { gain: 11 } },
};

export function exampleCabinet(catalog: readonly CatalogTrophy[]): TrophiesCabinet {
  const earned = catalog
    .filter((c) => c.code in EXAMPLE_FACTS)
    .map((c) => ({
      code: c.code,
      family: c.family,
      labelFr: c.labelFr,
      labelAr: c.labelAr,
      seasonId: null,
      gameweekSeq: EXAMPLE_FACTS[c.code]!.gw,
      facts: EXAMPLE_FACTS[c.code]!.facts,
      publishedAt: "2026-10-03T09:00:00+00:00",
      earnedAt: "2026-10-03T09:00:00+00:00",
    }));
  return {
    available: true,
    member: false,
    season: null,
    journeesPlayed: 0,
    catalog: [...catalog],
    earned,
    pending: [],
    progress: [],
    frames: [],
    chosenFrame: "standard",
    frame: "standard",
    showToLeagues: true,
  };
}
