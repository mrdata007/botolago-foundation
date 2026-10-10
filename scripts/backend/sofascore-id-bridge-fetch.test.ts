import { describe, expect, test } from "bun:test";
import {
  eventListPath,
  fetchAllEvents,
  reduceEvents,
  resolveIds,
  snapshotSql,
} from "./sofascore-id-bridge-fetch";

const raw = (id: number, tournament = 937, season = 102220) => ({
  id,
  startTimestamp: 1_790_000_000,
  roundInfo: { round: 3 },
  status: { type: "finished", code: 100 },
  homeTeam: { id: 1, name: "A" },
  awayTeam: { id: 2, name: "B" },
  tournament: { uniqueTournament: { id: tournament } },
  season: { id: season },
});

describe("sofascore bridge fetch", () => {
  test("keeps only the bridge fields and drops foreign tournaments", () => {
    const { events } = reduceEvents({
      events: [raw(1), raw(2, 8), raw(3, 937, 1)],
      hasNextPage: false,
    });
    expect(events).toEqual([
      {
        id: 1,
        startTimestamp: 1_790_000_000,
        roundInfo: { round: 3 },
        status: { type: "finished" },
        homeTeam: { id: 1 },
        awayTeam: { id: 2 },
      },
    ]);
  });

  test("rejects a malformed event", () => {
    expect(() => reduceEvents({ events: [{ id: 1 }], hasNextPage: false })).toThrow("malformed");
  });

  test("walks every page of both lists and de-duplicates by id", async () => {
    const paths: string[] = [];
    const client = {
      async getJson(path: string) {
        paths.push(path);
        const page = Number(/pageIndex=(\d+)/.exec(path)![1]);
        const last = path.includes("get-last-matches");
        return { events: [raw(last ? page + 1 : 10 + page), raw(99)], hasNextPage: page < 1 };
      },
    };
    const { events, pages } = await fetchAllEvents(client);
    expect(paths).toEqual([
      eventListPath("get-last-matches", 0),
      eventListPath("get-last-matches", 1),
      eventListPath("get-next-matches", 0),
      eventListPath("get-next-matches", 1),
    ]);
    expect(pages).toEqual({ "get-last-matches": 2, "get-next-matches": 2 });
    expect(events.map((e) => e.id).sort((a, b) => a - b)).toEqual([1, 2, 10, 11, 99]);
  });

  test("the season must be exactly one row unless ids are given", async () => {
    await expect(resolveIds(async () => [], {})).rejects.toThrow("season_not_unique");
    const one = [
      {
        season_id: "00000000-0000-4000-8000-000000000002",
        competition_id: "00000000-0000-4000-8000-000000000001",
      },
    ];
    expect(await resolveIds(async () => one, {})).toEqual({
      competitionId: "00000000-0000-4000-8000-000000000001",
      seasonId: "00000000-0000-4000-8000-000000000002",
    });
  });

  test("the snapshot query takes a uuid only and is a single select", () => {
    expect(() => snapshotSql("x'; drop table y; --")).toThrow("not a uuid");
    expect(snapshotSql("00000000-0000-4000-8000-000000000002")).toMatch(/^select /);
  });
});
