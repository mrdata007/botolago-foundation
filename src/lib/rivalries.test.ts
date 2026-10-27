import { describe, expect, test } from "bun:test";
import {
  findRivalryClubs,
  RIVALRIES,
  rivalrySeoDescription,
  splitMeetings,
  tallyMeetings,
} from "./rivalries";
import { PERMANENT_REDIRECTS } from "./seo-routing";
import { SITEMAP_STATIC_PATHS } from "./sitemap";
import type { Club, Match } from "@/types/domain";

const club = (id: string, slug: string, fr: string, short = fr): Club => ({
  id,
  slug,
  name: { fr, ar: fr },
  shortName: { fr: short, ar: short },
  city: { fr: "", ar: "" },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: "XXX",
});

// Names and slugs as production writes them (a hash after the name).
const WYDAD = club("w", "wydad-casablanca-80a3fb8202ae", "Wydad Casablanca", "WCA");
const RAJA = club("r", "raja-casablanca-3b0f1fc95b29", "Raja Casablanca");
const FAR = club("f", "far-rabat-fd6ff8ea898c", "FAR Rabat");
const OTHER = club("o", "olympique-safi-111111111111", "Olympique Safi");
const LOOKALIKE = club("l", "raja-beni-mellal-222222222222", "Raja Beni Mellal");

const match = (
  id: string,
  home: string,
  away: string,
  kickoff: string,
  status: Match["status"],
  score?: [number, number],
): Match => ({
  id,
  gameweek: 1,
  homeClubId: home,
  awayClubId: away,
  kickoff,
  status,
  homeScore: score?.[0],
  awayScore: score?.[1],
  venue: { fr: "", ar: "" },
});

describe("finding the clubs of a rivalry", () => {
  test("by the slug stem, whatever the hash and the ids", () => {
    const clubs = [OTHER, LOOKALIKE, FAR, RAJA, WYDAD];
    expect(findRivalryClubs(RIVALRIES["derby-casablanca"], clubs)).toEqual([WYDAD, RAJA]);
    expect(findRivalryClubs(RIVALRIES["classico-wac-far"], clubs)).toEqual([WYDAD, FAR]);
  });

  test("by name when the slug does not carry the stem", () => {
    const wydad = club("w2", "", "Wydad Athletic Club");
    const raja = club("r2", "", "Raja Club Athletic");
    expect(findRivalryClubs(RIVALRIES["derby-casablanca"], [raja, wydad])).toEqual([wydad, raja]);
  });

  test("a lookalike is not the club, and a missing club gives null", () => {
    expect(findRivalryClubs(RIVALRIES["derby-casablanca"], [WYDAD, LOOKALIKE])).toBeNull();
    expect(findRivalryClubs(RIVALRIES["classico-wac-far"], [WYDAD, OTHER])).toBeNull();
  });
});

describe("meetings", () => {
  const NOW = Date.parse("2026-10-27T12:00:00Z");
  const all = [
    match("old", "w", "r", "2025-11-01T20:00:00Z", "finished", [1, 1]),
    match("older", "r", "w", "2025-03-01T20:00:00Z", "finished", [0, 2]),
    match("next", "r", "w", "2026-12-01T20:00:00Z", "scheduled"),
    match("later", "w", "r", "2027-03-01T20:00:00Z", "scheduled"),
    match("other", "w", "o", "2026-11-01T20:00:00Z", "scheduled"),
    match("postponed", "w", "r", "2026-09-01T20:00:00Z", "postponed"),
    match("noscore", "w", "r", "2024-09-01T20:00:00Z", "finished"),
  ];

  test("the next match is the soonest to come, results run newest first", () => {
    const { upcoming, results } = splitMeetings(all, "w", "r", NOW);
    expect(upcoming.map((m) => m.id)).toEqual(["next", "later"]);
    expect(results.map((m) => m.id)).toEqual(["old", "older"]);
  });

  test("wins are counted for the club, whichever side it played", () => {
    const { results } = splitMeetings(all, "w", "r", NOW);
    expect(tallyMeetings(results, "w", "r")).toEqual({ aWins: 1, draws: 1, bWins: 0 });
  });
});

describe("the page's meta and routes", () => {
  test("the description names both clubs and the next meeting's day", () => {
    const next = match("next", "r", "w", "2026-12-01T20:00:00Z", "scheduled");
    const description = rivalrySeoDescription([WYDAD, RAJA], next);
    expect(description).toContain("Wydad Casablanca");
    expect(description).toContain("Raja Casablanca");
    expect(description).toContain("Prochain match le 1 déc. 2026");
    expect(rivalrySeoDescription([WYDAD, RAJA], undefined)).not.toContain("Prochain match le");
  });

  test("both pages are in the sitemap and none of them is a redirect", () => {
    for (const rivalry of Object.values(RIVALRIES)) {
      expect(SITEMAP_STATIC_PATHS as readonly string[]).toContain(rivalry.path);
      expect(PERMANENT_REDIRECTS[rivalry.path]).toBeUndefined();
    }
  });
});
