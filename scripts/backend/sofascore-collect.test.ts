import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RapidApiClient } from "../../src/backend/football/provider/rapidapi-client";
import {
  collect,
  collectLineups,
  csvReport,
  discoverRound,
  numericStatistics,
  parseEvent,
  type Read,
} from "./sofascore-collect-lib";
import { cachedReader, outputDirectory, parseArgs } from "./sofascore-collect";
const NOW = Date.parse("2026-10-18T12:00:00Z");
const observed = { fetchedAt: "2026-10-18T11:00:00.000Z", transport: "live" as const, data: {} };
function event(n = 1, round = 4, finished = true) {
  return {
    id: n,
    startTimestamp: (NOW - 86400000) / 1000,
    status: { type: finished ? "finished" : "notstarted", code: finished ? 100 : 0 },
    tournament: { uniqueTournament: { id: 937 } },
    season: { id: 102220 },
    roundInfo: { round },
    homeTeam: { id: n * 2, name: `Home ${n}` },
    awayTeam: { id: n * 2 + 1, name: `Away ${n}` },
  };
}
function lineups(full = true) {
  const side = (offset: number) => ({
    players: Array.from({ length: 12 }, (_, i) => ({
      player: { id: offset + i, name: `Player ${offset + i}`, position: "M" },
      teamId: 99999,
      substitute: i === 11,
      statistics:
        i === 11
          ? undefined
          : {
              minutesPlayed: 90,
              goals: i === 0 ? 1 : 0,
              goalAssist: 0,
              totalShots: 0,
              ...(full ? { rating: 6.5, totalPass: 35 } : {}),
            },
    })),
  });
  return { confirmed: true, home: side(1), away: side(101) };
}
function mockRead(responses: Record<string, unknown>): Read {
  return async (path) => {
    if (!(path in responses)) throw new Error("unexpected_request");
    return { ...observed, data: structuredClone(responses[path]) };
  };
}
const metrics = {
  requestsSent: () => 0,
  quota: () => ({ limit: null, remaining: null }),
  stoppedReason: () => null,
};

describe("mock collection validation (no live calls)", () => {
  test("rejects the wrong competition, event identity, unfinished status and team identity", () => {
    expect(() => parseEvent({ event: event() }, "2", NOW)).toThrow("event_identity_mismatch");
    expect(() =>
      parseEvent({ event: { ...event(), tournament: { uniqueTournament: { id: 1 } } } }, "1", NOW),
    ).toThrow("foreign_competition");
    expect(() => parseEvent({ event: event(1, 4, false) }, "1", NOW)).toThrow("event_not_finished");
    expect(() =>
      parseEvent({ event: { ...event(), awayTeam: event().homeTeam } }, "1", NOW),
    ).toThrow("duplicate_match_teams");
  });
  test("exports match-side IDs; limited assists/shots are null even for a scorer", () => {
    const result = collectLineups(event(), lineups(false), observed, "mock");
    expect(result.players[0]!.matchSideTeamId).toBe("2");
    expect(result.players[12]!.matchSideTeamId).toBe("3");
    expect(result.coverage).toBe("incomplete");
    expect(result.ratingState).toBe("unavailable");
    expect(result.ratedPlayers).toBe(0);
    expect(result.missingRatingIds).toHaveLength(22);
    expect(result.players[0]!.statistics).toMatchObject({
      goals: 1,
      goalAssist: null,
      totalShots: null,
    });
    expect(result.players[0]!.rating).toBeNull();
    expect(result.players[11]!.ratingState).toBe("not_applicable");
  });
  test("preserves signed fractional normalized metrics from the live response shape", () => {
    const data = lineups();
    Object.assign(data.home.players[0]!.statistics!, {
      passValueNormalized: -0.25,
      defensiveValueNormalized: -0.7,
      goalkeeperValueNormalized: -0.125,
      dribbleValueNormalized: -0.3,
      shotValueNormalized: -0.4,
      ratingVersions: { original: 6.5, alternative: 6.6 },
      statisticsType: { sportSlug: "football", statisticsType: "player" },
    });
    const parsed = collectLineups(event(), data, observed, "mock");
    expect(parsed.players[0]!.statistics.passValueNormalized).toBe(-0.25);
    expect(parsed.ratedPlayers).toBe(22);
    expect(() => numericStatistics({ passValueNormalized: -101 })).toThrow(
      "invalid_statistic_value",
    );
  });
  test("missing starter data and late unrated substitutes remain pending", () => {
    const data = lineups();
    data.home.players[0]!.statistics = undefined;
    data.home.players[11]!.statistics = {
      minutesPlayed: 1,
      goals: 0,
      goalAssist: 0,
      totalShots: 0,
    };
    const result = collectLineups(event(), data, observed, "mock");
    expect(result.missingRatingIds).toEqual(["1", "12"]);
    expect(result.ratingState).toBe("partial");
  });
  test("duplicate IDs, malformed sides, ambiguous starters and invalid numeric ranges fail", () => {
    const duplicate = lineups();
    duplicate.away.players[0]!.player.id = 1;
    expect(() => collectLineups(event(), duplicate, observed, "mock")).toThrow(
      "ratings_player_id_invalid",
    );
    const data = lineups();
    data.home.players.pop();
    data.home.players.pop();
    expect(() => collectLineups(event(), data, observed, "mock")).toThrow();
    const starter = lineups();
    starter.home.players[0]!.substitute = true;
    expect(() => collectLineups(event(), starter, observed, "mock")).toThrow(
      "invalid_starting_sides",
    );
    for (const raw of [
      { rating: 10.1 },
      { minutesPlayed: -1 },
      { minutesPlayed: 131 },
      { totalPass: 1.5 },
      { goals: NaN },
    ])
      expect(() => numericStatistics(raw)).toThrow();
    expect(
      numericStatistics({ rating: null, keeperSaveValue: -0.5, metricWithFraction: 0.12345 }),
    ).toEqual({
      rating: null,
      keeperSaveValue: -0.5,
      metricWithFraction: 0.12345,
    });
  });
  test("complete recent round discovery verifies season and paginates with a bound", async () => {
    const read = mockRead({
      "tournaments/get-seasons?tournamentId=937": {
        seasons: [{ id: 102220, name: "Botola 26/27", year: "26/27" }],
      },
      "tournaments/get-last-matches?tournamentId=937&seasonId=102220&pageIndex=0": {
        events: [event(9, 5, false), ...Array.from({ length: 4 }, (_, i) => event(i + 1))],
        hasNextPage: true,
      },
      "tournaments/get-last-matches?tournamentId=937&seasonId=102220&pageIndex=1": {
        events: Array.from({ length: 4 }, (_, i) => event(i + 5)),
        hasNextPage: false,
      },
    });
    const options = { maxPages: 2, maxAgeDays: 30, now: NOW };
    const result = await discoverRound(read, options);
    expect(result.round).toBe(4);
    expect(result.eventIds).toHaveLength(8);
    expect(result.pages).toBe(2);
    await expect(discoverRound(read, { ...options, maxPages: 1 })).rejects.toThrow(
      "discovery_page_bound",
    );
    await expect(discoverRound(read, { ...options, seasonId: 123 })).rejects.toThrow(
      "season_not_listed",
    );
  });
  test("does not certify an incomplete, stale, foreign or wrong-season round", async () => {
    const paths = {
      "tournaments/get-seasons?tournamentId=937": {
        seasons: [{ id: 102220, name: "Botola", year: "26/27" }],
      },
    };
    for (const events of [
      Array.from({ length: 7 }, (_, i) => event(i + 1)),
      Array.from({ length: 8 }, (_, i) => ({ ...event(i + 1), startTimestamp: 1 })),
      [{ ...event(), tournament: { uniqueTournament: { id: 1 } } }],
      [{ ...event(), season: { id: 1 } }],
    ]) {
      await expect(
        discoverRound(
          mockRead({
            ...paths,
            "tournaments/get-last-matches?tournamentId=937&seasonId=102220&pageIndex=0": {
              events,
              hasNextPage: false,
            },
          }),
          { maxPages: 1, maxAgeDays: 30, now: NOW },
        ),
      ).rejects.toThrow();
    }
  });
  test("partial results have a meaningful exit; diagnostics never fill absent lineup ratings", async () => {
    const report = await collect(
      mockRead({
        "matches/detail?matchId=1": { event: event() },
        "matches/get-lineups?matchId=1": lineups(false),
        "matches/get-player-statistics?matchId=1&playerId=1": {
          statistics: { rating: 7.5, totalShots: 0 },
        },
      }),
      metrics,
      {
        eventIds: ["1"],
        playerStatistics: 1,
        incidents: false,
        now: () => NOW,
        evidenceKind: "mock",
      },
    );
    expect(report.exitCode).toBe(4);
    expect(report.freshAuthenticatedPull).toBe(false);
    expect(report.results[0]!.players![0]!.rating).toBeNull();
    expect(csvReport(report)).toContain('"unavailable"');
    expect(csvReport(report)).toContain('"mock"');
  });
  test("HTTP access circuit prevents fan-out and errors are sanitized", async () => {
    const api = new RapidApiClient({
      host: "sofascore.p.rapidapi.com",
      key: "mock-key",
      fetch: async () => new Response("private", { status: 403 }),
    });
    const report = await collect(
      async (path) => ({ ...observed, data: await api.getJson(path) }),
      api,
      {
        eventIds: ["1", "2"],
        playerStatistics: 1,
        incidents: true,
        now: () => NOW,
        evidenceKind: "mock",
      },
    );
    expect(report.exitCode).toBe(3);
    expect(report.requestsConsumed).toBe(1);
    expect(report.results.map((r) => r.requestsConsumed)).toEqual([1, 0]);
    expect(JSON.stringify(report)).not.toContain("private");
    expect(JSON.stringify(report)).not.toContain("mock-key");
  });
});

describe("private local cache and CLI (mock responses)", () => {
  test("cache preserves original observation times, fresh bypasses and expiry refetches", async () => {
    const directory = mkdtempSync(join(tmpdir(), "sofascore-cache-test-"));
    try {
      let clock = NOW,
        calls = 0;
      const client = {
        getJson: async () => {
          calls++;
          return { okay: true };
        },
      };
      const read = cachedReader(client, directory, 1000, false, () => clock);
      const first = await read("matches/detail?matchId=1");
      clock += 500;
      const cached = await read("matches/detail?matchId=1");
      expect(cached.transport).toBe("cache");
      expect(cached.fetchedAt).toBe(first.fetchedAt);
      expect(calls).toBe(1);
      const fresh = await cachedReader(
        client,
        directory,
        1000,
        true,
        () => clock,
      )("matches/detail?matchId=1");
      expect(fresh.transport).toBe("live");
      expect(calls).toBe(2);
      clock += 1001;
      await read("matches/detail?matchId=1");
      expect(calls).toBe(3);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  test("rejects unknown, missing, ambiguous or unbounded arguments and repository output", () => {
    for (const args of [
      [],
      ["--out-dir"],
      ["--out-dir", "/tmp/a", "--recent-round", "--max-requests", "101"],
      ["--out-dir", "/tmp/a", "--event-ids", "1&key=x"],
      ["--out-dir", "/tmp/a", "--recent-round", "--fresh", "--fresh"],
    ])
      expect(() => parseArgs(args)).toThrow();
    expect(parseArgs(["--out-dir", "/tmp/a", "--event-ids", "1,1,2"]).eventIds).toEqual(["1", "2"]);
    expect(() => outputDirectory(process.cwd())).toThrow("output_must_be_outside_repository");
  });
});

describe("historical fixture replays (2026-10-01 captures, NOT fresh retrieval)", () => {
  for (const id of ["17132481", "16958239"])
    test(`replays ${id} without making network requests`, () => {
      const raw = JSON.parse(
        readFileSync(
          new URL(`../../tests/fixtures/providers/sofascore/${id}.lineups.json`, import.meta.url),
          "utf8",
        ),
      );
      const result = collectLineups(
        { ...event(), id: Number(id) },
        raw,
        { data: raw, fetchedAt: "2026-10-01T00:00:00.000Z", transport: "cache" },
        "historical_replay",
      );
      expect(result.players.every((p) => p.evidenceKind === "historical_replay")).toBe(true);
      expect(result.ratedPlayers).toBe(id === "17132481" ? 29 : 0);
    });
});
