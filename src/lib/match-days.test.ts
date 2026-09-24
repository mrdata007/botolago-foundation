import { describe, expect, it } from "bun:test";

import type { Match } from "@/types/domain";
import { capitalizeFirst, groupByMatchDay, matchRounds } from "./match-days";

function match(id: string, kickoff: string, gameweek = 14): Match {
  return {
    id,
    gameweek,
    homeClubId: "h",
    awayClubId: "a",
    kickoff,
    status: "scheduled",
    venue: { fr: "", ar: "" },
  };
}

// Thursday 24 September 2026, 04:00 in Casablanca (UTC+1).
const NOW = new Date("2026-09-24T03:00:00Z");
const LABELS = { locale: "fr-FR", today: "Aujourd'hui", tomorrow: "Demain", now: NOW };

describe("groupByMatchDay — Home's 'À venir' day groups", () => {
  it("names today and tomorrow, and any other day by its date, capitalised", () => {
    const days = groupByMatchDay(
      [
        match("today", "2026-09-24T19:30:00Z"),
        match("tomorrow", "2026-09-25T20:00:00Z"),
        match("saturday", "2026-09-26T18:00:00Z"),
      ],
      LABELS,
    );
    expect(days.map((d) => d.label)).toEqual(["Aujourd'hui", "Demain", "Samedi 26 septembre"]);
    expect(days.map((d) => d.key)).toEqual(["2026-09-24", "2026-09-25", "2026-09-26"]);
  });

  it("files a kickoff under the competition's day, not the UTC one (BG-0100)", () => {
    // 23:30 UTC on the 25th is 00:30 on the 26th in Casablanca.
    const [day] = groupByMatchDay([match("late", "2026-09-25T23:30:00Z")], LABELS);
    expect(day!.key).toBe("2026-09-26");
    expect(day!.label).toBe("Samedi 26 septembre");
  });

  it("keeps the order it is given and gathers consecutive matches of a day", () => {
    const days = groupByMatchDay(
      [
        match("a", "2026-09-24T17:00:00Z"),
        match("b", "2026-09-24T19:30:00Z"),
        match("c", "2026-09-25T20:00:00Z"),
      ],
      LABELS,
    );
    expect(days).toHaveLength(2);
    expect(days[0]!.matches.map((m) => m.id)).toEqual(["a", "b"]);
    expect(days[1]!.matches.map((m) => m.id)).toEqual(["c"]);
  });

  it("dates in Arabic with the ar-MA calendar words", () => {
    const [day] = groupByMatchDay([match("x", "2026-09-26T18:00:00Z")], {
      ...LABELS,
      locale: "ar-MA",
      today: "اليوم",
      tomorrow: "غداً",
    });
    expect(day!.label).toContain("26");
    expect(day!.label).toMatch(/\p{Script=Arabic}/u);
  });

  it("returns nothing for no matches", () => {
    expect(groupByMatchDay([], LABELS)).toEqual([]);
  });
});

describe("matchRounds — the round(s) a day belongs to", () => {
  it("lists each known round once, ascending", () => {
    expect(matchRounds([{ gameweek: 14 }, { gameweek: 13 }, { gameweek: 14 }])).toEqual([13, 14]);
  });

  it("never names round 0, the presenter's 'no round number'", () => {
    expect(matchRounds([{ gameweek: 0 }, { gameweek: 14 }])).toEqual([14]);
    expect(matchRounds([{ gameweek: 0 }])).toEqual([]);
  });
});

describe("capitalizeFirst", () => {
  it("capitalises the first letter only — French months stay lower case", () => {
    expect(capitalizeFirst("jeudi 24 septembre")).toBe("Jeudi 24 septembre");
    expect(capitalizeFirst("")).toBe("");
  });
});
