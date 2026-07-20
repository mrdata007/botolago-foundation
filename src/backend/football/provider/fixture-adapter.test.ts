import { describe, expect, test } from "bun:test";
import { FixtureFootballProvider } from "./fixture-adapter";

const base = {
  id: "fixture-1",
  competitionId: "competition-1",
  seasonId: "season-1",
  homeId: "team-1",
  awayId: "team-2",
  kickoff: "2030-01-01T18:00:00.000Z",
  status: "1H" as const,
  homeScore: 1,
  awayScore: 0,
  minute: 12,
  updatedAt: "2030-01-01T18:12:00.000Z",
  sequence: 2,
};

describe("fixture provider adapter", () => {
  test("isolates raw payload shape and returns validated normalized DTOs", async () => {
    const provider = new FixtureFootballProvider({ fixtures: [base] });
    const result = await provider.listFixtures({ limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      externalId: "fixture-1",
      status: "live_first_half",
      period: "first_half",
      homeScore: 1,
      awayScore: 0,
    });
    expect(result.rateLimit).toEqual({
      limit: null,
      remaining: null,
      resetsAt: null,
      retryAfterMs: null,
    });
  });

  test("uses deterministic cursor pagination", async () => {
    const provider = new FixtureFootballProvider({
      fixtures: [base, { ...base, id: "fixture-2" }, { ...base, id: "fixture-3" }],
    });
    const first = await provider.listFixtures({ limit: 2 });
    const second = await provider.listFixtures({ limit: 2, cursor: first.nextCursor });
    expect(first.items.map((item) => item.externalId)).toEqual(["fixture-1", "fixture-2"]);
    expect(first.nextCursor).toBe("2");
    expect(second.items.map((item) => item.externalId)).toEqual(["fixture-3"]);
    expect(second.nextCursor).toBeNull();
  });

  test("exposes every provider capability without a fake live integration", () => {
    const provider = new FixtureFootballProvider();
    for (const capability of [
      "listCompetitions",
      "listSeasons",
      "listRounds",
      "listTeams",
      "listPlayers",
      "listSquads",
      "listFixtures",
      "listStandings",
      "listLineups",
      "listMatchEvents",
      "listMatchStatistics",
      "listAvailability",
    ] as const) {
      expect(typeof provider[capability]).toBe("function");
    }
  });
});
