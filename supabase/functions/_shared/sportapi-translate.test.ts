import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import {
  createRapidApiClient,
  RapidApiClient,
  RapidApiError,
  rapidApiHostOf,
  SOFASCORE_RAPIDAPI_HOST,
  SPORTAPI_RAPIDAPI_HOST,
} from "./rapidapi-client.ts";
import { loadRapidApiBudget, type RapidApiBudgetClient } from "./rapidapi-budget.ts";
import { createRapidApiCallCounter, type RapidApiCountClient } from "./rapidapi-call-counter.ts";
import { parseSquad, createCatalogRapidClient } from "./sofascore-catalog.ts";
import { BOTOLA_UNIQUE_TOURNAMENT_ID, parseSofascoreEvents } from "./sofascore-fixtures.ts";
import { normalizeSofascoreMatchDetails, isProviderNoData } from "./sofascore-match-details.ts";
import {
  parseSofascoreIncidents,
  parseSofascoreLineups,
  parseSofascoreStatistics,
} from "./sofascore-performance-parse.ts";
import { parseStandingsRows } from "./sofascore-standings.ts";
import {
  readStagedConfig,
  STAGED_BUDGET_STOP,
  STAGED_BUDGET_STOP_SPORTAPI,
} from "./sofascore-staged-stats.ts";
import { translateToSportApi } from "./sportapi-translate.ts";

// SportAPI (sportapi7.p.rapidapi.com) serves Sofascore's own data under native
// paths. The files are real answers captured on 2026-10-27, trimmed to the fields
// the parsers read (tests/fixtures/providers/sportapi/README.md).

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      new URL(`../../../tests/fixtures/providers/sportapi/${name}.json`, import.meta.url),
      "utf8",
    ),
  );

const KEY = "fake-rapidapi-key-for-tests";
const runtime = { sleep: async () => undefined, random: () => 0 };
const HEADERS = {
  "x-ratelimit-requests-limit": "15000",
  "x-ratelimit-requests-remaining": "14000",
};

type Seen = { url: string; headers: Record<string, string> };

/** A SportAPI client whose "network" answers each native path with the given reply. */
function sportApi(routes: Record<string, () => Response>, seen: Seen[] = []) {
  return new RapidApiClient({
    host: SPORTAPI_RAPIDAPI_HOST,
    key: KEY,
    runtime,
    maxRetries: 0,
    fetch: async (url, init) => {
      const path = new URL(url).pathname.slice(1);
      seen.push({ url, headers: init?.headers as Record<string, string> });
      const route = routes[path];
      if (!route) return new Response("{}", { status: 404, headers: HEADERS });
      return route();
    },
  });
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });

describe("the committed SportAPI fixtures are trimmed", () => {
  const dir = new URL("../../../tests/fixtures/providers/sportapi/", import.meta.url);
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".json"))) {
    test(name, () => {
      const text = readFileSync(new URL(name, dir), "utf8");
      expect(statSync(new URL(name, dir)).size).toBeLessThan(80_000);
      for (const personal of ["dateOfBirth", "proposedMarketValue", "marketValue", '"height"']) {
        expect(text).not.toContain(personal);
      }
    });
  }
});

describe("path translation, one test per endpoint", () => {
  test("matches/get-lineups", () => {
    expect(translateToSportApi("matches/get-lineups?matchId=17294293")?.path).toBe(
      "api/v1/event/17294293/lineups",
    );
  });
  test("matches/get-incidents", () => {
    expect(translateToSportApi("matches/get-incidents?matchId=17294293")?.path).toBe(
      "api/v1/event/17294293/incidents",
    );
  });
  test("matches/get-statistics", () => {
    expect(translateToSportApi("matches/get-statistics?matchId=17294293")?.path).toBe(
      "api/v1/event/17294293/statistics",
    );
  });
  test("tournaments/get-live-events", () => {
    expect(translateToSportApi("tournaments/get-live-events?sport=football")?.path).toBe(
      "api/v1/sport/football/events/live",
    );
    expect(translateToSportApi("tournaments/get-live-events?sport=tennis")).toBeNull();
  });
  test("tournaments/get-next-matches and get-last-matches", () => {
    const query = "tournamentId=937&seasonId=102220&pageIndex=2";
    expect(translateToSportApi(`tournaments/get-next-matches?${query}`)?.path).toBe(
      "api/v1/unique-tournament/937/season/102220/events/next/2",
    );
    expect(translateToSportApi(`tournaments/get-last-matches?${query}`)?.path).toBe(
      "api/v1/unique-tournament/937/season/102220/events/last/2",
    );
    // The page defaults to 0 as on the Sofascore host.
    expect(
      translateToSportApi("tournaments/get-last-matches?tournamentId=937&seasonId=102220")?.path,
    ).toBe("api/v1/unique-tournament/937/season/102220/events/last/0");
  });
  test("tournaments/get-standings", () => {
    expect(
      translateToSportApi("tournaments/get-standings?tournamentId=937&seasonId=102220&type=total")
        ?.path,
    ).toBe("api/v1/unique-tournament/937/season/102220/standings/total");
    expect(
      translateToSportApi("tournaments/get-standings?tournamentId=937&seasonId=102220&type=x"),
    ).toBeNull();
  });
  test("teams/get-squad", () => {
    expect(translateToSportApi("teams/get-squad?teamId=47696")?.path).toBe(
      "api/v1/team/47696/players",
    );
  });
  test("teams/get-logo and players/get-image are the image paths", () => {
    expect(translateToSportApi("teams/get-logo?teamId=47696")?.path).toBe(
      "api/v1/team/47696/image",
    );
    expect(translateToSportApi("players/get-image?playerId=1140927")?.path).toBe(
      "api/v1/player/1140927/image",
    );
  });
  test("an id that is not a plain number, or an unknown endpoint, has no request", () => {
    for (const path of [
      "matches/get-lineups?matchId=1/../2",
      "matches/get-lineups?matchId=",
      "matches/get-lineups",
      "matches/get-lineups?matchId=0123",
      "tournaments/get-next-matches?tournamentId=937&seasonId=102220&pageIndex=-1",
      "teams/get-squad?teamId=abc",
      "matches/detail?matchId=1",
    ]) {
      expect(translateToSportApi(path)).toBeNull();
    }
  });
});

describe("through the client: the answer is what the callers parse today", () => {
  test("lineups, incidents and statistics parse and normalise as the Sofascore host's do", async () => {
    const seen: Seen[] = [];
    const api = sportApi(
      {
        "api/v1/event/1/lineups": () => json(fixture("lineups")),
        "api/v1/event/1/incidents": () => json(fixture("incidents")),
        "api/v1/event/1/statistics": () => json(fixture("statistics")),
      },
      seen,
    );
    const lineups = (await api.getJson("matches/get-lineups?matchId=1")).data;
    const incidents = (await api.getJson("matches/get-incidents?matchId=1")).data;
    const statistics = (await api.getJson("matches/get-statistics?matchId=1")).data;
    expect(parseSofascoreLineups(lineups).players.length).toBeGreaterThan(30);
    expect(parseSofascoreIncidents(incidents).map((i) => i.kind)).toContain("substitution");
    expect(parseSofascoreStatistics(statistics).length).toBeGreaterThan(0);
    const details = normalizeSofascoreMatchDetails(
      { incidents, lineups, statistics },
      { home: "101", away: "102" },
      "2026-10-28T12:00:00.000Z",
    );
    expect(details.unreadable).toEqual([]);
    expect(details.payload.events?.length).toBeGreaterThan(0);
    expect(details.payload.lineups).toHaveLength(2);
    expect(details.payload.statistics.length).toBeGreaterThan(0);
    // The key goes in headers, the host header names SportAPI, nothing else is sent.
    expect(seen.map((s) => s.url)).toEqual([
      "https://sportapi7.p.rapidapi.com/api/v1/event/1/lineups",
      "https://sportapi7.p.rapidapi.com/api/v1/event/1/incidents",
      "https://sportapi7.p.rapidapi.com/api/v1/event/1/statistics",
    ]);
    expect(seen[0]?.headers["x-rapidapi-host"]).toBe(SPORTAPI_RAPIDAPI_HOST);
    expect(seen[0]?.headers["x-rapidapi-key"]).toBe(KEY);
    expect(seen[0]?.url).not.toContain(KEY);
  });

  test("the quota headers have the same names and feed the same quota", async () => {
    const api = sportApi({ "api/v1/event/1/incidents": () => json(fixture("incidents")) });
    const result = await api.getJson("matches/get-incidents?matchId=1");
    expect(result.quota).toEqual({ limit: 15000, remaining: 14000 });
  });

  test("the live feed keeps the Botola matches and drops the world's", async () => {
    const live = fixture("live") as { events: Record<string, unknown>[] };
    expect(live.events.length).toBeGreaterThan(0);
    // The captured feed held no Botola match: make one from a captured event, and
    // keep one with an unreadable tournament, which the parser counts as malformed.
    const botola = {
      ...live.events[0],
      id: 17294999,
      tournament: { name: "Botola Pro", uniqueTournament: { id: BOTOLA_UNIQUE_TOURNAMENT_ID } },
      season: { id: 102220 },
    };
    const odd = { id: 5 };
    const api = sportApi({
      "api/v1/sport/football/events/live": () => json({ events: [...live.events, botola, odd] }),
    });
    const { data } = await api.getJson("tournaments/get-live-events?sport=football");
    const events = (data as { events: { id: number }[] }).events;
    expect(events.map((e) => e.id)).toEqual([17294999, 5]);
    const parsed = parseSofascoreEvents(data);
    expect(parsed.events.map((e) => e.sofascoreEventId)).toEqual(["17294999"]);
    expect(parsed.malformedCount).toBe(1);
    expect(parsed.foreignTournamentCount).toBe(0);
    // Unfiltered, the parser would have dropped all of them but this one as foreign.
    expect(parseSofascoreEvents(live).foreignTournamentCount).toBe(live.events.length);
  });

  test("the season lists parse, and hasNextPage is always a boolean", async () => {
    const api = sportApi({
      "api/v1/unique-tournament/937/season/102220/events/next/0": () => json(fixture("next")),
      "api/v1/unique-tournament/937/season/102220/events/last/1": () =>
        json({ events: (fixture("last") as { events: unknown[] }).events }),
    });
    const next = await api.getJson(
      "tournaments/get-next-matches?tournamentId=937&seasonId=102220&pageIndex=0",
    );
    const nextParsed = parseSofascoreEvents(next.data);
    expect(nextParsed.events.length).toBe(3);
    expect(nextParsed.foreignTournamentCount).toBe(0);
    expect(typeof (next.data as { hasNextPage: unknown }).hasNextPage).toBe("boolean");
    const last = await api.getJson(
      "tournaments/get-last-matches?tournamentId=937&seasonId=102220&pageIndex=1",
    );
    expect(parseSofascoreEvents(last.data).events.length).toBe(3);
    expect((last.data as { hasNextPage: unknown }).hasNextPage).toBe(false);
    expect(parseSofascoreEvents(last.data).events.every((e) => e.seasonId === "102220")).toBe(true);
  });

  test("the standings parse", async () => {
    const api = sportApi({
      "api/v1/unique-tournament/937/season/102220/standings/total": () =>
        json(fixture("standings")),
    });
    const { data } = await api.getJson(
      "tournaments/get-standings?tournamentId=937&seasonId=102220&type=total",
    );
    const parsed = parseStandingsRows(data);
    expect(parsed?.rows).toHaveLength(16);
    expect(parsed?.malformedRows).toBe(0);
    expect(parsed?.rows[0]).toMatchObject({ rank: 1, teamExternalId: "47696" });
  });

  test("the squad parses (players and foreign players listed once)", async () => {
    const api = sportApi({ "api/v1/team/47696/players": () => json(fixture("squad")) });
    const { data } = await api.getJson("teams/get-squad?teamId=47696");
    const squad = parseSquad(data);
    expect(squad).toHaveLength(6);
    expect(squad?.[0]).toEqual({
      sofascoreId: "1140927",
      name: "Saleh Al Sellami",
      position: "forward",
      shirtNumber: 11,
    });
  });

  test("a missing resource is a 404: data_unavailable, as the Sofascore host's no-data body is", async () => {
    const api = sportApi({
      "api/v1/event/9/incidents": () => json({ error: { code: 404, message: "Not Found" } }, 404),
    });
    await expect(api.getJson("matches/get-incidents?matchId=9")).rejects.toMatchObject({
      code: "data_unavailable",
    });
    // The Sofascore host's own no-data body is still recognised if it ever appears.
    expect(isProviderNoData({ error: { code: 404 } }, "incidents")).toBe(true);
  });

  test("an endpoint SportAPI has no equivalent for, or a bad id, sends nothing", async () => {
    const seen: Seen[] = [];
    const api = sportApi({}, seen);
    await expect(api.getJson("matches/detail?matchId=1")).rejects.toBeInstanceOf(RapidApiError);
    await expect(api.getJson("matches/get-lineups?matchId=x")).rejects.toMatchObject({
      code: "provider_unavailable",
    });
    expect(seen).toHaveLength(0);
    expect(api.requestsSent()).toBe(0);
  });

  test("429 is not retried and not translated away", async () => {
    const api = sportApi({ "api/v1/event/1/lineups": () => json({ message: "x" }, 429) });
    await expect(api.getJson("matches/get-lineups?matchId=1")).rejects.toMatchObject({
      code: "provider_rate_limited",
    });
    expect(api.requestsSent()).toBe(1);
  });

  test("the same match is never read twice in one run", async () => {
    const seen: Seen[] = [];
    const api = sportApi({ "api/v1/event/1/incidents": () => json(fixture("incidents")) }, seen);
    const first = await api.getJson("matches/get-incidents?matchId=1");
    const second = await api.getJson("matches/get-incidents?matchId=1");
    expect(seen).toHaveLength(1);
    expect(second.data).toBe(first.data);
    expect(api.requestsSent()).toBe(1);
    // A failure is not remembered.
    const failing = sportApi({ "api/v1/event/2/incidents": () => json({}, 500) }, seen);
    await expect(failing.getJson("matches/get-incidents?matchId=2")).rejects.toBeInstanceOf(
      RapidApiError,
    );
    await expect(failing.getJson("matches/get-incidents?matchId=2")).rejects.toBeInstanceOf(
      RapidApiError,
    );
    expect(failing.requestsSent()).toBe(2);
  });

  test("the budget guard and the essential list still use the Sofascore-host endpoint names", async () => {
    const events: string[] = [];
    const api = new RapidApiClient({
      host: SPORTAPI_RAPIDAPI_HOST,
      key: KEY,
      runtime,
      maxRetries: 0,
      budget: { used: 100, softLimit: 100, hardLimit: 200 },
      onRequest: (event) => events.push(event.endpoint),
      fetch: async () => json(fixture("incidents")),
    });
    // Above the soft limit: lineups are refused, incidents are sent.
    await expect(api.getJson("matches/get-lineups?matchId=1")).rejects.toMatchObject({
      budget: "soft_limit",
    });
    await api.getJson("matches/get-incidents?matchId=1");
    expect(events).toEqual(["matches/get-incidents"]);
  });
});

describe("images", () => {
  test("the catalog client keeps the bytes of SportAPI's image paths", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const urls: string[] = [];
    const rapid = createCatalogRapidClient(
      { RAPIDAPI_KEY: KEY, RAPIDAPI_HOST: SPORTAPI_RAPIDAPI_HOST },
      async (url) => {
        urls.push(url);
        return new Response(png, { status: 200, headers: { "content-type": "image/png" } });
      },
    );
    const crest = await rapid.getImage("teams/get-logo?teamId=47696");
    const face = await rapid.getImage("players/get-image?playerId=1140927");
    expect(urls).toEqual([
      "https://sportapi7.p.rapidapi.com/api/v1/team/47696/image",
      "https://sportapi7.p.rapidapi.com/api/v1/player/1140927/image",
    ]);
    expect(crest.contentType).toBe("image/png");
    expect(Array.from(face.bytes)).toEqual(Array.from(png));
  });
});

describe("choosing the host", () => {
  test("RAPIDAPI_HOST picks SportAPI; absent or empty is the Sofascore host; anything else is refused", () => {
    expect(rapidApiHostOf({})).toBe(SOFASCORE_RAPIDAPI_HOST);
    expect(rapidApiHostOf({ RAPIDAPI_HOST: "  " })).toBe(SOFASCORE_RAPIDAPI_HOST);
    expect(rapidApiHostOf({ RAPIDAPI_HOST: " SportAPI7.p.rapidapi.com " })).toBe(
      SPORTAPI_RAPIDAPI_HOST,
    );
    expect(() => rapidApiHostOf({ RAPIDAPI_HOST: "evil.example" })).toThrow(RapidApiError);
    expect(() => rapidApiHostOf({ RAPIDAPI_HOST: "https://sportapi7.p.rapidapi.com" })).toThrow(
      RapidApiError,
    );
  });

  test("createRapidApiClient sends to the chosen host with the matching header", async () => {
    const seen: Seen[] = [];
    const fetch = async (url: string, init?: RequestInit) => {
      seen.push({ url, headers: init?.headers as Record<string, string> });
      return json(fixture("incidents"));
    };
    await createRapidApiClient("sofascore", { RAPIDAPI_KEY: KEY }, { fetch }).getJson(
      "matches/get-incidents?matchId=1",
    );
    await createRapidApiClient(
      "sofascore",
      { RAPIDAPI_KEY: KEY, RAPIDAPI_HOST: SPORTAPI_RAPIDAPI_HOST },
      { fetch },
    ).getJson("matches/get-incidents?matchId=1");
    expect(seen.map((s) => s.url)).toEqual([
      "https://sofascore.p.rapidapi.com/matches/get-incidents?matchId=1",
      "https://sportapi7.p.rapidapi.com/api/v1/event/1/incidents",
    ]);
    expect(seen.map((s) => s.headers["x-rapidapi-host"])).toEqual([
      SOFASCORE_RAPIDAPI_HOST,
      SPORTAPI_RAPIDAPI_HOST,
    ]);
  });

  test("the staged-statistics stop follows the host's plan", () => {
    expect(readStagedConfig({}).budgetStop).toBe(STAGED_BUDGET_STOP);
    expect(readStagedConfig({ RAPIDAPI_HOST: SPORTAPI_RAPIDAPI_HOST }).budgetStop).toBe(
      STAGED_BUDGET_STOP_SPORTAPI,
    );
  });
});

describe("the budget and the call counts are per host", () => {
  const rpcClient = (calls: { name: string; args: Record<string, unknown> }[]) =>
    ({
      schema: () => ({
        rpc: (name: string, args: Record<string, unknown>) => {
          calls.push({ name, args });
          return Promise.resolve({
            data: { used: 3, softLimit: 13500, hardLimit: 14700, liveIntervalSeconds: 120 },
            error: null,
          });
        },
      }),
    }) as unknown as RapidApiBudgetClient & RapidApiCountClient;

  test("the Sofascore host reads api.service_rapidapi_budget as ever; SportAPI reads its own", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const client = rpcClient(calls);
    await loadRapidApiBudget(client, "fixtures");
    await loadRapidApiBudget(client, "fixtures", () => undefined, SPORTAPI_RAPIDAPI_HOST);
    expect(calls).toEqual([
      { name: "service_rapidapi_budget", args: {} },
      { name: "service_rapidapi_host_budget", args: { p_host: SPORTAPI_RAPIDAPI_HOST } },
    ]);
  });

  test("calls and the provider quota are recorded under the host", async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const record = (host?: string) => {
      const counter = createRapidApiCallCounter({
        client: rpcClient(calls) as unknown as RapidApiCountClient,
        job: "fixtures",
        ...(host ? { host } : {}),
      });
      counter.record({
        endpoint: "matches/get-incidents",
        statusCode: 200,
        quotaRemaining: 14000,
        quotaLimit: 15000,
      });
      return counter.flush();
    };
    await record(SPORTAPI_RAPIDAPI_HOST);
    expect(calls.map((c) => c.name)).toEqual([
      "service_record_rapidapi_host_calls",
      "service_record_rapidapi_host_quota",
    ]);
    expect(calls[0]?.args).toMatchObject({ p_host: SPORTAPI_RAPIDAPI_HOST, p_job: "fixtures" });
    expect(calls[1]?.args).toMatchObject({
      p_host: SPORTAPI_RAPIDAPI_HOST,
      p_remaining: 14000,
      p_limit: 15000,
    });
    calls.length = 0;
    await record();
    await record(SOFASCORE_RAPIDAPI_HOST);
    expect(calls.map((c) => c.name)).toEqual([
      "service_record_rapidapi_calls",
      "service_record_rapidapi_quota",
      "service_record_rapidapi_calls",
      "service_record_rapidapi_quota",
    ]);
    expect(calls.every((c) => !("p_host" in c.args))).toBe(true);
  });
});
