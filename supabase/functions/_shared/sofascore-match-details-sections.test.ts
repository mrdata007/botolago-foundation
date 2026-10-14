import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRapidApiClient } from "./rapidapi-client.ts";
import {
  fetchSofascoreMatchReplies,
  isProviderNoData,
  normalizeSofascoreMatchDetails,
  runSofascoreMatchDetails,
  type SofascoreDetailsTarget,
} from "./sofascore-match-details.ts";
import type { FixtureRpcClient } from "./sportsmonks-fixtures.ts";

// 2026-10-13, round 4: FUS Rabat 1-1 Raja Casablanca (17256975, kickoff 20:00
// UTC, limited coverage) and RS Berkane 2-2 Renaissance Zemamra (17256978,
// 18:00 UTC, full coverage). The replies are SofaScore's own, trimmed by the
// keep-lists of scripts/backend/provider-fixtures.ts. During FUS - Raja every
// details attempt was refused and the 11 events only appeared at full time.
// SofaScore had no team statistics for the match while it was on, and RapidAPI
// answers that with HTTP 200 and an `{"error": ...}` body (the coverage audit
// of 2026-10-01 saw the same body on other endpoints), which the statistics
// parser refused, taking the goals, cards and lineups of the reply with it.

const FUS_RAJA = "17256975";
const BERKANE_ZEMAMRA = "17256978";
const NO_DATA = { error: { code: 404, message: "Not Found" } };

function fixture(id: string, part: "detail" | "incidents" | "lineups" | "statistics") {
  return JSON.parse(
    readFileSync(
      new URL(`../../../tests/fixtures/providers/sofascore/${id}.${part}.json`, import.meta.url),
      "utf8",
    ),
  );
}
const teamsOf = (id: string) => {
  const { event } = fixture(id, "detail");
  return { home: String(event.homeTeam.id), away: String(event.awayTeam.id) };
};
/** The incidents reply as it stood at `minute` (what a live tick read). */
function incidentsAt(id: string, minute: number) {
  const reply = fixture(id, "incidents") as { incidents: { time?: number }[] };
  return { incidents: reply.incidents.filter((i) => (i.time ?? 0) <= minute) };
}

function fakeFetch(routes: Record<string, unknown>, remaining = 5000) {
  const paths: string[] = [];
  const fetch = async (input: string) => {
    const url = new URL(input);
    const path = url.pathname.slice(1) + url.search;
    paths.push(path);
    const route = routes[path];
    const headers = {
      "x-ratelimit-requests-limit": "10000",
      "x-ratelimit-requests-remaining": String(remaining),
    };
    if (typeof route === "number") return new Response("{}", { status: route, headers });
    if (route === undefined) return new Response("{}", { status: 404, headers });
    return Response.json(route, { headers });
  };
  return { fetch, paths };
}
const rapid = (fetch: (input: string) => Promise<Response>) =>
  createRapidApiClient("sofascore", { RAPIDAPI_KEY: "k" }, { fetch, maxRetries: 0 });

function fakeDb(answer: Record<string, unknown> = { outcome: "stored", events: 1 }) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    schema() {
      return {
        rpc(name: string, args: Record<string, unknown>) {
          calls.push({ name, args });
          if (name === "begin_football_ingestion")
            return Promise.resolve({ data: "90000000-0000-4000-8000-000000000001", error: null });
          if (name === "ingest_football_match_details")
            return Promise.resolve({ data: answer, error: null });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  } as unknown as FixtureRpcClient;
  return { client, calls };
}

const NOW = new Date("2026-10-13T20:31:00.000Z");
const routes = (id: string, over: Record<string, unknown> = {}) => ({
  [`matches/get-incidents?matchId=${id}`]: fixture(id, "incidents"),
  [`matches/get-lineups?matchId=${id}`]: fixture(id, "lineups"),
  [`matches/get-statistics?matchId=${id}`]: fixture(id, "statistics"),
  ...over,
});
const sent = (calls: { name: string; args: Record<string, unknown> }[]) =>
  calls.find((c) => c.name === "ingest_football_match_details")?.args.p_details as
    | {
        events: { key: string; type: string; teamExternalId: string; minute: number }[] | null;
        lineups: { teamExternalId: string; players: unknown[] }[];
        statistics: { code: string; teamExternalId: string; value: number }[];
      }
    | undefined;

describe("FUS Rabat - Raja in play, statistics not published yet (the 2026-10-13 refusal)", () => {
  const teams = teamsOf(FUS_RAJA);
  const inPlay = (over: Record<string, unknown> = {}) =>
    routes(FUS_RAJA, {
      [`matches/get-incidents?matchId=${FUS_RAJA}`]: incidentsAt(FUS_RAJA, 30),
      [`matches/get-statistics?matchId=${FUS_RAJA}`]: NO_DATA,
      ...over,
    });

  test("a reply carrying only an error object is the provider's 'no data'", () => {
    expect(isProviderNoData(NO_DATA, "statistics")).toBe(true);
    expect(isProviderNoData(fixture(FUS_RAJA, "statistics"), "statistics")).toBe(false);
    expect(isProviderNoData({ incidents: [], error: null }, "incidents")).toBe(false);
    expect(isProviderNoData([], "home")).toBe(false);
  });

  test("the three replies of a live tick (the deployed rule then) are stored, goal and lineups included", async () => {
    const db = fakeDb();
    const summary = await runSofascoreMatchDetails([{ eventId: FUS_RAJA, teams }], {
      mode: "sofascore",
      scope: "live",
      client: db.client,
      rapid: rapid(fakeFetch(inPlay()).fetch),
      now: NOW,
      log: () => {},
    });
    // Before the fix: rejected 1, errors ["invalid_provider_payload"], no ingest.
    expect(summary).toMatchObject({ stored: 1, rejected: 0, errors: [] });
    const details = sent(db.calls);
    expect(details?.events?.map((e) => [e.type, e.minute, e.teamExternalId])).toEqual([
      ["goal", 20, teams.away],
    ]);
    expect(details?.lineups.map((l) => [l.teamExternalId, l.players.length])).toEqual([
      [teams.home, 20],
      [teams.away, 20],
    ]);
    expect(details?.statistics).toEqual([]);
    expect(db.calls.map((c) => c.name)).not.toContain("record_football_ingestion_rejection");
    expect(db.calls.find((c) => c.name === "complete_football_ingestion")?.args).toMatchObject({
      p_status: "succeeded",
      p_error_code: null,
    });
  });

  test("the current rule (incidents only, lineups on the kickoff tick) stores them in one tick", async () => {
    const db = fakeDb();
    const { fetch, paths } = fakeFetch(inPlay());
    const summary = await runSofascoreMatchDetails(
      [{ eventId: FUS_RAJA, teams, incidentsOnly: true, withLineups: true }],
      {
        mode: "sofascore",
        scope: "live",
        client: db.client,
        rapid: rapid(fetch),
        now: NOW,
        log: () => {},
      },
    );
    expect(paths).toEqual([
      `matches/get-incidents?matchId=${FUS_RAJA}`,
      `matches/get-lineups?matchId=${FUS_RAJA}`,
    ]);
    expect(summary).toMatchObject({ stored: 1, rejected: 0 });
    expect(sent(db.calls)?.events).toHaveLength(1);
  });

  test("lineups not published yet are 'no data' too, and the goal is still stored", async () => {
    const db = fakeDb();
    const summary = await runSofascoreMatchDetails([{ eventId: FUS_RAJA, teams }], {
      mode: "sofascore",
      scope: "live",
      client: db.client,
      rapid: rapid(
        fakeFetch(inPlay({ [`matches/get-lineups?matchId=${FUS_RAJA}`]: NO_DATA })).fetch,
      ),
      now: NOW,
      log: () => {},
    });
    expect(summary).toMatchObject({ stored: 1, rejected: 0, partial: [] });
    expect(sent(db.calls)?.lineups).toEqual([]);
    expect(sent(db.calls)?.events).toHaveLength(1);
  });

  test("a match in play with no incidents yet is unavailable, not a rejection", async () => {
    const db = fakeDb();
    const summary = await runSofascoreMatchDetails(
      [{ eventId: FUS_RAJA, teams, incidentsOnly: true }],
      {
        mode: "sofascore",
        scope: "live",
        client: db.client,
        rapid: rapid(
          fakeFetch(inPlay({ [`matches/get-incidents?matchId=${FUS_RAJA}`]: NO_DATA })).fetch,
        ),
        now: NOW,
        log: () => {},
      },
    );
    expect(summary).toMatchObject({ stored: 0, rejected: 0, unavailable: 1, errors: [] });
    expect(db.calls.map((c) => c.name)).not.toContain("ingest_football_match_details");
    expect(db.calls.map((c) => c.name)).not.toContain("record_football_ingestion_rejection");
  });

  test("a statistics request that fails stores the rest and reports the part left out", async () => {
    const db = fakeDb();
    const handed: string[] = [];
    const summary = await runSofascoreMatchDetails(
      [{ eventId: FUS_RAJA, teams, fantasyFixtureId: "f" }],
      {
        mode: "sofascore",
        scope: "live",
        client: db.client,
        rapid: rapid(
          fakeFetch(inPlay({ [`matches/get-statistics?matchId=${FUS_RAJA}`]: 500 })).fetch,
        ),
        now: NOW,
        log: () => {},
        onReplies: async (target) => {
          handed.push(target.eventId);
        },
      },
    );
    expect(summary).toMatchObject({ stored: 1, rejected: 0 });
    expect(summary.partial).toEqual([
      { eventId: FUS_RAJA, leftOut: ["statistics"], rejected: [], rowsRejected: 0 },
    ]);
    expect(sent(db.calls)?.events).toHaveLength(1);
    // Fantasy waits for a whole set of replies rather than an empty statistics list.
    expect(handed).toEqual([]);
    const rejection = db.calls.find((c) => c.name === "record_football_ingestion_rejection");
    expect(rejection?.args).toMatchObject({
      p_error_code: "details_section_left_out",
      p_validation_issues: [{ code: "section_left_out", section: "statistics" }],
    });
    expect(db.calls.find((c) => c.name === "complete_football_ingestion")?.args).toMatchObject({
      p_status: "partial",
      p_error_code: "match_details_section_rejected",
      p_records_rejected: 0,
    });
  });

  test("an unreadable lineups reply is left out alone", () => {
    const { payload, unreadable } = normalizeSofascoreMatchDetails(
      { incidents: incidentsAt(FUS_RAJA, 30), lineups: [], statistics: NO_DATA },
      teams,
      NOW.toISOString(),
    );
    expect(unreadable).toEqual(["lineups"]);
    expect(payload.events).toHaveLength(1);
    expect(payload.lineups).toEqual([]);
  });

  test("unreadable incidents send events null (the stored timeline is kept)", () => {
    const { payload, unreadable } = normalizeSofascoreMatchDetails(
      { incidents: { incidents: "x" }, lineups: fixture(FUS_RAJA, "lineups"), statistics: null },
      teams,
      NOW.toISOString(),
    );
    expect(unreadable).toEqual(["incidents"]);
    expect(payload.events).toBeNull();
    expect(payload.lineups).toHaveLength(2);
  });

  test("nothing readable at all is still a payload error", () => {
    expect(() =>
      normalizeSofascoreMatchDetails(
        { incidents: { incidents: "x" }, lineups: [], statistics: { statistics: "x" } },
        teams,
        NOW.toISOString(),
      ),
    ).toThrow("invalid_provider_payload");
  });

  test("the full-time replies give the 11 events production stored at 21:53", () => {
    const { payload } = normalizeSofascoreMatchDetails(
      {
        incidents: fixture(FUS_RAJA, "incidents"),
        lineups: fixture(FUS_RAJA, "lineups"),
        statistics: fixture(FUS_RAJA, "statistics"),
      },
      teams,
      NOW.toISOString(),
    );
    const counts: Record<string, number> = {};
    for (const e of payload.events ?? []) counts[e.type] = (counts[e.type] ?? 0) + 1;
    expect(counts).toEqual({ goal: 2, substitution: 8, yellow_card: 1 });
    // Limited coverage: SofaScore's statistics are the cards only, none of them shown.
    expect(payload.statistics).toEqual([]);
  });
});

describe("RS Berkane - Renaissance Zemamra, full statistics", () => {
  const teams = teamsOf(BERKANE_ZEMAMRA);
  const replies = () => ({
    incidents: fixture(BERKANE_ZEMAMRA, "incidents"),
    lineups: fixture(BERKANE_ZEMAMRA, "lineups"),
    statistics: fixture(BERKANE_ZEMAMRA, "statistics"),
  });

  test("every mapped line becomes a statistic of the right club", () => {
    const { payload } = normalizeSofascoreMatchDetails(replies(), teams, NOW.toISOString());
    const byCode = (code: string) =>
      payload.statistics
        .filter((s) => s.code === code)
        .map((s) => [s.teamExternalId === teams.home ? "home" : "away", s.value]);
    expect(payload.statistics).toHaveLength(18);
    expect(byCode("possession")).toEqual([
      ["home", 77],
      ["away", 23],
    ]);
    expect(byCode("expected_goals")).toEqual([
      ["home", 2.06],
      ["away", 1.49],
    ]);
    expect(byCode("shots_on_target")).toEqual([
      ["home", 5],
      ["away", 2],
    ]);
    // Only codes app.statistic_definitions knows.
    const known = new Set([
      "possession",
      "expected_goals",
      "expected_goals_on_target",
      "shots",
      "shots_on_target",
      "corners",
      "fouls",
      "offsides",
      "saves",
      "passes",
      "pass_accuracy",
    ]);
    expect(payload.statistics.every((s) => known.has(s.code))).toBe(true);
  });

  test("the own goal counts for the side it was scored for (0-1)", () => {
    const { payload } = normalizeSofascoreMatchDetails(replies(), teams, NOW.toISOString());
    const first = payload.events?.[0];
    expect([first?.type, first?.minute, first?.teamExternalId]).toEqual([
      "own_goal",
      5,
      teams.away,
    ]);
  });

  test("replies already read (a staged pull) are stored with no request", async () => {
    const db = fakeDb({ outcome: "stored", events: 16, statistics: 18 });
    const { fetch, paths } = fakeFetch({});
    const target: SofascoreDetailsTarget = {
      eventId: BERKANE_ZEMAMRA,
      teams,
      replies: replies(),
    };
    const summary = await runSofascoreMatchDetails([target], {
      mode: "sofascore",
      scope: "staged",
      client: db.client,
      rapid: rapid(fetch),
      now: NOW,
      log: () => {},
    });
    expect(paths).toEqual([]);
    expect(summary).toMatchObject({ stored: 1, statistics: 18, requests: [] });
    expect(sent(db.calls)?.statistics).toHaveLength(18);
    expect(db.calls[0].args.p_target_scope).toMatchObject({ scope: "staged" });
  });

  test("sections the database refused are recorded; the fixture still counts as stored", async () => {
    const db = fakeDb({
      outcome: "stored",
      events: 16,
      statistics: 0,
      rejectedSections: ["statistics"],
      statisticsRejected: 18,
      eventsRejected: 0,
      lineupPlayersRejected: 1,
    });
    const summary = await runSofascoreMatchDetails([{ eventId: BERKANE_ZEMAMRA, teams }], {
      mode: "sofascore",
      scope: "live",
      client: db.client,
      rapid: rapid(fakeFetch(routes(BERKANE_ZEMAMRA)).fetch),
      now: NOW,
      log: () => {},
    });
    expect(summary).toMatchObject({ stored: 1, rejected: 0 });
    expect(summary.partial).toEqual([
      { eventId: BERKANE_ZEMAMRA, leftOut: [], rejected: ["statistics"], rowsRejected: 19 },
    ]);
    expect(summary.errors).toEqual(["details_section_rejected"]);
    expect(
      db.calls.find((c) => c.name === "record_football_ingestion_rejection")?.args,
    ).toMatchObject({
      p_error_code: "details_section_rejected",
      p_validation_issues: [
        { code: "section_rejected", section: "statistics" },
        { code: "rows_rejected", rows: 19 },
      ],
    });
  });
});

describe("fetchSofascoreMatchReplies and 'no data' bodies", () => {
  test("lineups and statistics come back null; incidents throw data_unavailable", async () => {
    const id = FUS_RAJA;
    const requests: never[] = [];
    const ok = await fetchSofascoreMatchReplies(
      rapid(
        fakeFetch({
          [`matches/get-incidents?matchId=${id}`]: fixture(id, "incidents"),
          [`matches/get-lineups?matchId=${id}`]: NO_DATA,
          [`matches/get-statistics?matchId=${id}`]: NO_DATA,
        }).fetch,
      ),
      id,
      requests,
    );
    expect(ok.lineups).toBeNull();
    expect(ok.statistics).toBeNull();
    expect(requests).toHaveLength(3);
    await expect(
      fetchSofascoreMatchReplies(
        rapid(fakeFetch({ [`matches/get-incidents?matchId=${id}`]: NO_DATA }).fetch),
        id,
        [],
      ),
    ).rejects.toMatchObject({ code: "data_unavailable" });
  });

  test("without a failure list, a failing statistics request still fails the read (staged pulls)", async () => {
    const id = FUS_RAJA;
    await expect(
      fetchSofascoreMatchReplies(
        rapid(fakeFetch(routes(id, { [`matches/get-statistics?matchId=${id}`]: 500 })).fetch),
        id,
        [],
      ),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
  });
});
