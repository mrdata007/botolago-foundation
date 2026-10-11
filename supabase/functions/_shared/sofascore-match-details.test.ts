import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRapidApiClient } from "./rapidapi-client.ts";
import {
  fetchSofascoreMatchReplies,
  normalizeIncidents,
  normalizeSofascoreMatchDetails,
  runSofascoreMatchDetails,
  type SofascoreDetailsSkipped,
} from "./sofascore-match-details.ts";
import type { FixtureRpcClient } from "./sportsmonks-fixtures.ts";

const OBSERVED = "2026-10-11T20:00:00.000Z";

function fixture(id: string, part: "detail" | "incidents" | "lineups" | "statistics") {
  return JSON.parse(
    readFileSync(
      new URL(`../../../tests/fixtures/providers/sofascore/${id}.${part}.json`, import.meta.url),
      "utf8",
    ),
  );
}
function replies(id: string) {
  return {
    incidents: fixture(id, "incidents"),
    lineups: fixture(id, "lineups"),
    statistics: fixture(id, "statistics"),
  };
}
const teamsOf = (id: string) => {
  const { event } = fixture(id, "detail");
  return { home: String(event.homeTeam.id), away: String(event.awayTeam.id) };
};
const none = (): SofascoreDetailsSkipped => ({ events: 0, statistics: 0, lineupPlayers: 0 });

describe("full coverage match 17132481 (55035 - 263373, 2-1)", () => {
  const teams = teamsOf("17132481");
  const { payload, skipped } = normalizeSofascoreMatchDetails(replies("17132481"), teams, OBSERVED);

  test("sends the shape the RPC takes, with no pressure and no absences", () => {
    expect(Object.keys(payload).sort()).toEqual([
      "absences",
      "events",
      "lineups",
      "pressure",
      "providerUpdatedAt",
      "sourceSequence",
      "statistics",
    ]);
    expect(payload.providerUpdatedAt).toBe(OBSERVED);
    expect(payload.sourceSequence).toBe(Date.parse(OBSERVED));
    expect(payload.pressure).toEqual([]);
    expect(payload.absences).toBeNull();
    expect(skipped).toEqual(none());
  });

  test("goals come from the incidents, in order, penalties apart, on the scoring side", () => {
    const goals = payload.events.filter((e) => e.type === "goal" || e.type === "penalty_goal");
    expect(
      goals.map((g) => [g.key, g.type, g.minute, g.teamExternalId, g.playerExternalId]),
    ).toEqual([
      ["363303290", "goal", 48, teams.away, "1939981"],
      ["363303292", "penalty_goal", 59, teams.home, "895127"],
      ["363303293", "goal", 64, teams.home, "1919299"],
    ]);
    expect(goals[2]).toMatchObject({ relatedPlayerExternalId: "1096751", period: "second_half" });
  });

  test("cards and substitutions", () => {
    const cards = payload.events.filter((e) => e.type === "yellow_card");
    expect(cards).toHaveLength(4);
    expect(cards.filter((c) => c.teamExternalId === teams.home)).toHaveLength(3);
    const subs = payload.events.filter((e) => e.type === "substitution");
    expect(subs).toHaveLength(9);
    // 126925063: 90+2, home, Ghedamsi on for Mabasa
    expect(subs.find((s) => s.key === "126925063")).toMatchObject({
      teamExternalId: teams.home,
      playerExternalId: "1182110",
      relatedPlayerExternalId: "895127",
      detail: "Salaheddine Ghedamsi",
      minute: 90,
      addedTime: 2,
    });
    // sequence is 1..n in match order
    expect(payload.events.map((e) => e.sequence)).toEqual(payload.events.map((_, i) => i + 1));
    const minutes = payload.events.map((e) => e.minute * 100 + e.addedTime);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
  });

  test("team statistics keep the keys the app knows (whole match only)", () => {
    const stat = (code: string, team: string) =>
      payload.statistics.find((s) => s.code === code && s.teamExternalId === team)?.value;
    expect(stat("shots", teams.home)).toBe(15);
    expect(stat("shots", teams.away)).toBe(6);
    expect(stat("shots_on_target", teams.home)).toBe(4);
    expect(stat("shots_on_target", teams.away)).toBe(1);
    expect(stat("saves", teams.home)).toBe(0);
    expect(stat("saves", teams.away)).toBe(2);
    // one row per team and code, even though the provider repeats some keys
    expect(payload.statistics).toHaveLength(6);
    // cards are timeline events, not statistic codes
    expect(payload.statistics.some((s) => (s.code as string).includes("card"))).toBe(false);
  });

  test("lineups: both sides by the fixture, starters first, never by the lineup's teamId", () => {
    expect(payload.lineups.map((l) => l.teamExternalId)).toEqual([teams.home, teams.away]);
    const [home, away] = payload.lineups;
    expect(home.formation).toBe("4-2-3-1");
    expect(away.formation).toBe("4-4-2");
    expect(home.players).toHaveLength(20);
    expect(home.players.filter((p) => p.slot === "starting")).toHaveLength(11);
    expect(home.players[0]).toMatchObject({
      playerExternalId: "1140820",
      playerName: "Salaheddine Chihab",
      slot: "starting",
      position: "goalkeeper",
      shirtNumber: 16,
      order: 1,
    });
    expect(home.players.at(-1)?.order).toBeGreaterThan(100);
    // the away lineup rows carry three different teamIds (loans); all stay away
    const raw = fixture("17132481", "lineups");
    expect(new Set(raw.away.players.map((p: { teamId: number }) => p.teamId)).size).toBe(3);
    expect(away.players).toHaveLength(raw.away.players.length);
    expect(JSON.stringify(payload.lineups)).not.toContain("teamId");
  });
});

describe("limited coverage match 16958239 (118834 - 55027, 2-1)", () => {
  const teams = teamsOf("16958239");
  const { payload } = normalizeSofascoreMatchDetails(replies("16958239"), teams, OBSERVED);

  test("events and lineups are complete, statistics hold only what the app maps", () => {
    const goals = payload.events.filter((e) => e.type === "goal");
    expect(goals.map((g) => [g.minute, g.teamExternalId])).toEqual([
      [12, teams.home],
      [27, teams.home],
      [70, teams.away],
    ]);
    expect(payload.events.filter((e) => e.type === "yellow_card")).toHaveLength(5);
    expect(payload.events.filter((e) => e.type === "substitution")).toHaveLength(8);
    expect(payload.lineups).toHaveLength(2);
    expect(payload.lineups[0].players).toHaveLength(20);
    // the reply has only yellow and red card counts: nothing the app stores
    expect(payload.statistics).toEqual([]);
  });
});

describe("incidents", () => {
  const teams = { home: "11", away: "22" };
  const incident = (over: Record<string, unknown>) => ({
    id: 1,
    incidentType: "goal",
    incidentClass: "regular",
    time: 10,
    isHome: true,
    player: { id: 5, name: "A" },
    ...over,
  });
  const run = (list: unknown[]) => {
    const skipped = none();
    const events = normalizeIncidents({ incidents: list }, teams, skipped);
    return { events, skipped };
  };

  test("goals ignore the lineups: an undercounting lineup does not remove a goal", () => {
    const lineups = fixture("17132481", "lineups");
    for (const side of [lineups.home, lineups.away]) {
      for (const p of side.players) if (p.statistics) p.statistics.goals = 0;
    }
    const { payload } = normalizeSofascoreMatchDetails(
      { ...replies("17132481"), lineups },
      teamsOf("17132481"),
      OBSERVED,
    );
    expect(
      payload.events.filter((e) => e.type === "goal" || e.type === "penalty_goal"),
    ).toHaveLength(3);
  });

  test("an own goal is placed on the side the score moved for", () => {
    const { events } = run([
      incident({
        id: 1,
        time: 20,
        isHome: true,
        homeScore: 0,
        awayScore: 1,
        incidentClass: "ownGoal",
      }),
      incident({ id: 2, time: 30, isHome: true, homeScore: 1, awayScore: 1 }),
    ]);
    expect(events.map((e) => [e.type, e.teamExternalId])).toEqual([
      ["own_goal", "22"],
      ["goal", "11"],
    ]);
  });

  test("second yellow, red, missed penalty; rescinded and period markers are left out", () => {
    const { events, skipped } = run([
      { id: 9, incidentType: "period", time: 90, text: "FT" },
      incident({ id: 1, incidentType: "card", incidentClass: "yellowRed", time: 80 }),
      incident({ id: 2, incidentType: "card", incidentClass: "red", time: 85, isHome: false }),
      incident({ id: 3, incidentType: "inGamePenalty", incidentClass: "missed", time: 30 }),
      incident({ id: 4, incidentType: "card", incidentClass: "yellow", time: 40, rescinded: true }),
      incident({ id: 5, incidentType: "varDecision", time: 41 }),
      incident({ id: 6, time: undefined }),
    ]);
    expect(events.map((e) => e.type)).toEqual(["missed_penalty", "second_yellow", "red_card"]);
    expect(events[2].teamExternalId).toBe("22");
    expect(skipped.events).toBe(2); // the unknown type and the one with no minute
  });

  test("a reply that is not an incidents list is refused", () => {
    expect(() => normalizeIncidents({}, teams, none())).toThrow("invalid_provider_payload");
  });
});

describe("normalizeSofascoreMatchDetails", () => {
  test("home and away must be two different clubs", () => {
    expect(() =>
      normalizeSofascoreMatchDetails(replies("17132481"), { home: "1", away: "1" }, OBSERVED),
    ).toThrow();
  });

  test("lineups and statistics may be missing, incidents may not", () => {
    const { payload } = normalizeSofascoreMatchDetails(
      { incidents: fixture("17132481", "incidents"), lineups: null, statistics: null },
      teamsOf("17132481"),
      OBSERVED,
    );
    expect(payload.lineups).toEqual([]);
    expect(payload.statistics).toEqual([]);
    expect(payload.events.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Fetch and store

function fakeFetch(routes: Record<string, unknown | number>, remaining = 5000) {
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
const rapid = (fetch: (input: string) => Promise<Response>, minRemaining = 100) =>
  createRapidApiClient("sofascore", { RAPIDAPI_KEY: "k" }, { fetch, maxRetries: 0, minRemaining });

function routesFor(id: string) {
  const r = replies(id);
  return {
    [`matches/get-incidents?matchId=${id}`]: r.incidents,
    [`matches/get-lineups?matchId=${id}`]: r.lineups,
    [`matches/get-statistics?matchId=${id}`]: r.statistics,
  };
}

function fakeDb(outcome: Record<string, unknown> = { outcome: "stored", events: 3 }) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    schema() {
      return {
        rpc(name: string, args: Record<string, unknown>) {
          calls.push({ name, args });
          if (name === "begin_football_ingestion") {
            return Promise.resolve({ data: "90000000-0000-4000-8000-000000000001", error: null });
          }
          if (name === "ingest_football_match_details") {
            return Promise.resolve({ data: outcome, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  } as unknown as FixtureRpcClient;
  return { client, calls };
}

const NOW = new Date(OBSERVED);
const target = (id: string) => ({ eventId: id, teams: teamsOf(id) });

describe("runSofascoreMatchDetails", () => {
  test("three requests per fixture, then one ingest with the SofaScore provider", async () => {
    const db = fakeDb();
    const { fetch, paths } = fakeFetch(routesFor("17132481"));
    const lines: Record<string, unknown>[] = [];
    const summary = await runSofascoreMatchDetails([target("17132481")], {
      mode: "sofascore",
      scope: "live",
      client: db.client,
      rapid: rapid(fetch),
      now: NOW,
      log: (f) => lines.push(f),
    });
    expect(paths).toEqual([
      "matches/get-incidents?matchId=17132481",
      "matches/get-lineups?matchId=17132481",
      "matches/get-statistics?matchId=17132481",
    ]);
    expect(summary).toMatchObject({ attempted: 1, stored: 1, rejected: 0, rateLimited: false });
    expect(summary.requests.map((r) => r.quotaRemaining)).toEqual([5000, 5000, 5000]);
    expect(db.calls.map((c) => c.name)).toEqual([
      "begin_football_ingestion",
      "ingest_football_match_details",
      "complete_football_ingestion",
    ]);
    const ingest = db.calls[1].args;
    expect(ingest.p_provider_name).toBe("sofascore");
    expect(ingest.p_fixture_external_id).toBe("17132481");
    expect((ingest.p_details as { events: unknown[] }).events.length).toBeGreaterThan(10);
    expect(db.calls[0].args.p_job_type).toBe("match_events");
  });

  test("shadow reads and logs, writes nothing at all", async () => {
    const db = fakeDb();
    const { fetch, paths } = fakeFetch(routesFor("16958239"));
    const lines: Record<string, unknown>[] = [];
    const summary = await runSofascoreMatchDetails([target("16958239")], {
      mode: "shadow",
      scope: "backfill",
      client: db.client,
      rapid: rapid(fetch),
      now: NOW,
      log: (f) => lines.push(f),
    });
    expect(paths).toHaveLength(3);
    expect(db.calls).toEqual([]);
    expect(summary).toMatchObject({ stored: 0, wouldStore: 1 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      result: "shadow_match_details",
      written: 0,
      eventId: "16958239",
    });
  });

  test("a quota refusal mid-fixture writes nothing for it and ends the run", async () => {
    const db = fakeDb();
    // 50 left after the first reply, below the floor of 100: lineups are refused
    const { fetch, paths } = fakeFetch(routesFor("17132481"), 50);
    const summary = await runSofascoreMatchDetails([target("17132481"), target("16958239")], {
      mode: "sofascore",
      scope: "live",
      client: db.client,
      rapid: rapid(fetch),
      now: NOW,
      log: () => {},
    });
    expect(paths).toEqual(["matches/get-incidents?matchId=17132481"]);
    expect(summary).toMatchObject({ rateLimited: true, stored: 0, rejected: 0, attempted: 1 });
    expect(summary.errors).toEqual(["provider_rate_limited"]);
    expect(db.calls.map((c) => c.name)).not.toContain("ingest_football_match_details");
    // a refusal is not a rejection: the backfill must not count it against the fixture
    expect(db.calls.map((c) => c.name)).not.toContain("record_football_ingestion_rejection");
  });

  test("lineups the provider does not have are stored without them; no incidents is a rejection", async () => {
    const routes = routesFor("17132481");
    const missingLineups = { ...routes, [`matches/get-lineups?matchId=17132481`]: 404 };
    const okDb = fakeDb();
    const ok = await runSofascoreMatchDetails([target("17132481")], {
      mode: "sofascore",
      scope: "backfill",
      client: okDb.client,
      rapid: rapid(fakeFetch(missingLineups).fetch),
      now: NOW,
      log: () => {},
    });
    expect(ok.stored).toBe(1);
    const sent = okDb.calls.find((c) => c.name === "ingest_football_match_details");
    expect((sent?.args.p_details as { lineups: unknown[] }).lineups).toEqual([]);

    const badDb = fakeDb();
    const missingIncidents = { ...routes, [`matches/get-incidents?matchId=17132481`]: 404 };
    const bad = await runSofascoreMatchDetails([target("17132481")], {
      mode: "sofascore",
      scope: "backfill",
      client: badDb.client,
      rapid: rapid(fakeFetch(missingIncidents).fetch),
      now: NOW,
      log: () => {},
    });
    expect(bad).toMatchObject({ stored: 0, rejected: 1, errors: ["data_unavailable"] });
    expect(badDb.calls.map((c) => c.name)).toContain("record_football_ingestion_rejection");
    expect(badDb.calls.map((c) => c.name)).not.toContain("ingest_football_match_details");
  });

  test("an event id that is not a number never reaches the provider", async () => {
    const { fetch, paths } = fakeFetch({});
    await expect(fetchSofascoreMatchReplies(rapid(fetch), "1/../2", [])).rejects.toThrow(
      "invalid_provider_payload",
    );
    expect(paths).toEqual([]);
  });
});
