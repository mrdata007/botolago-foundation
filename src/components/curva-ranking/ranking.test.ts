import { describe, expect, it } from "bun:test";

import { buildRanking, RANKING_LIMIT, rankingTeamIds, toEntry } from "./ranking";
import { SAMPLE_CARDS, SAMPLE_OWN_ID } from "./sample-data";

const ranking = buildRanking(SAMPLE_CARDS, SAMPLE_OWN_ID);
const names = (rows: typeof ranking.rated) => rows.map((row) => row.entry.name);

describe("buildRanking: order and rank", () => {
  it("sorts rated cards by OVR, highest first", () => {
    expect(ranking.rated.map((row) => row.entry.ovr)).toEqual([91, 91, 84, 77, 62, 62]);
  });

  it("gives equal OVR an equal rank and skips the next one (1, 1, 3, 4, 5, 5)", () => {
    expect(ranking.rated.map((row) => row.rank)).toEqual([1, 1, 3, 4, 5, 5]);
    expect(ranking.rated.map((row) => row.tied)).toEqual([false, true, false, false, false, true]);
  });

  it("breaks a tie by name so the order is stable", () => {
    expect(names(ranking.rated).slice(0, 2)).toEqual(["Imane", "Youssef Benali"]);
    expect(names(ranking.rated).slice(4)).toEqual(["Hamza Ouazzani", "Khadija Tazi"]);
  });

  it("puts the cards without an OVR after the rated ones, unranked, the fullest first", () => {
    expect(ranking.unrated.map((entry) => entry.name)).toEqual(["Mehdi", "Nadia Cherkaoui"]);
    expect(ranking.unrated.map((entry) => entry.filled)).toEqual([2, 0]);
    expect(ranking.unrated.every((entry) => entry.ovr === null)).toBe(true);
  });

  it("does not depend on the order the cards came in", () => {
    const reversed = buildRanking([...SAMPLE_CARDS].reverse(), SAMPLE_OWN_ID);
    expect(names(reversed.rated)).toEqual(names(ranking.rated));
    expect(reversed.unrated.map((entry) => entry.name)).toEqual(
      ranking.unrated.map((entry) => entry.name),
    );
  });

  it("ranks nobody when nobody is rated", () => {
    const none = buildRanking(
      SAMPLE_CARDS.filter((card) => card.ovr === null),
      null,
    );
    expect(none.rated).toEqual([]);
    expect(none.unrated).toHaveLength(2);
  });
});

describe("buildRanking: the flags", () => {
  it("keeps the provisional flag on the card that has it, and only there", () => {
    const flagged = ranking.rated.filter((row) => row.entry.provisional);
    expect(flagged.map((row) => row.entry.name)).toEqual(["Imane"]);
  });

  it("marks the reader's own row, once", () => {
    const own = [...ranking.rated.map((row) => row.entry), ...ranking.unrated].filter(
      (entry) => entry.own,
    );
    expect(own.map((entry) => entry.name)).toEqual(["Ali"]);
  });

  it("recognises the mock's « me » team as the reader's own", () => {
    const entry = toEntry({ ...SAMPLE_CARDS[0], teamId: "me" }, null);
    expect(entry?.own).toBe(true);
  });

  it("counts the filled statistics (the 2/4 of an unrated card)", () => {
    expect(ranking.unrated[0]!.filled).toBe(2);
  });

  it("never marks an unrated card as provisional", () => {
    const entry = toEntry({ ...SAMPLE_CARDS[6], provisional: true }, null);
    expect(entry?.provisional).toBe(false);
  });
});

describe("buildRanking: rows that cannot be read are skipped", () => {
  const good = SAMPLE_CARDS[1]!;
  const bad: unknown[] = [
    null,
    "text",
    42,
    [],
    { ...good, teamId: "" },
    { ...good, teamId: undefined },
    { ...good, name: "   " },
    { ...good, name: undefined },
    { ...good, ovr: 0 },
    { ...good, ovr: 100 },
    { ...good, ovr: 80.5 },
    { ...good, ovr: "80" },
    { ...good, tier: "mythic" },
  ];

  it("drops each one, counts it and keeps the good row", () => {
    const result = buildRanking([...bad, good], null);
    expect(result.skipped).toBe(bad.length);
    expect(result.rated.map((row) => row.entry.name)).toEqual([good.name]);
  });

  it("treats a missing or damaged statistic as empty, never as zero", () => {
    const entry = toEntry({ ...good, stats: { cap: 0, sel: "x", trf: 140, con: 70 } }, null);
    expect(entry?.stats).toEqual({ cap: null, sel: null, trf: null, con: 70 });
    expect(toEntry({ ...good, stats: null }, null)?.filled).toBe(0);
  });

  it("lists a team that appears twice once", () => {
    const result = buildRanking([good, { ...good, ovr: 50 }], null);
    expect(result.rated).toHaveLength(1);
    expect(result.rated[0]!.entry.ovr).toBe(good.ovr as number);
  });

  it("returns an empty ranking for no cards", () => {
    expect(buildRanking([], null)).toEqual({ rated: [], unrated: [], skipped: 0 });
  });

  it("shows the name the API gave, trimmed, and nothing else in its place", () => {
    const entry = toEntry({ ...good, name: "  Youssef  ", handle: "x@example.com" }, null);
    expect(entry?.name).toBe("Youssef");
    expect(JSON.stringify(entry)).not.toContain("example.com");
  });
});

describe("rankingTeamIds", () => {
  const ids = Array.from({ length: 130 }, (_, index) => `team-${index}`);

  it("asks for at most the limit", () => {
    expect(rankingTeamIds(ids)).toHaveLength(RANKING_LIMIT);
  });

  it("keeps the reader's own team in when it is past the limit", () => {
    const result = rankingTeamIds(ids, "team-125");
    expect(result).toHaveLength(RANKING_LIMIT);
    expect(result).toContain("team-125");
  });

  it("does not invent a team the list does not have", () => {
    expect(rankingTeamIds(ids, "stranger")).not.toContain("stranger");
  });

  it("asks once per team", () => {
    expect(rankingTeamIds(["a", "b", "a"])).toEqual(["a", "b"]);
  });
});
