import { describe, expect, test } from "bun:test";
import { runSofascoreCollection, validateCollectionLineups } from "./sofascore-collection.ts";
import { RapidApiError } from "./rapidapi-client.ts";
import type { FixtureRpcClient } from "./sportsmonks-fixtures.ts";
const U = (n: number) => `a1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function syntheticLineups(rated = true) {
  const side = (offset: number) => ({
    players: Array.from({ length: 11 }, (_, i) => ({
      player: { id: offset + i, name: `Test ${i}`, position: i === 0 ? "G" : "M" },
      teamId: 999999,
      shirtNumber: i + 1,
      substitute: false,
      statistics: {
        minutesPlayed: 90,
        goals: 0,
        goalAssist: 0,
        ownGoals: 0,
        saves: 0,
        totalPass: 30,
        ...(rated ? { rating: 7.2 } : {}),
      },
    })),
  });
  return { confirmed: true, home: side(1), away: side(12) };
}
export const syntheticCandidate = {
  fixture_id: U(100),
  event_id: "123",
  season_id: "102220",
  home_external: "11",
  away_external: "22",
};
export function syntheticDetail() {
  return {
    event: {
      id: 123,
      status: { type: "finished", code: 100 },
      tournament: { uniqueTournament: { id: 937 } },
      season: { id: 102220 },
      homeTeam: { id: 11 },
      awayTeam: { id: 22 },
      homeScore: { current: 0 },
      awayScore: { current: 0 },
    },
  };
}
export function syntheticContext() {
  return {
    found: true,
    sofascoreEventId: "123",
    status: "finished",
    finalized: true,
    adaptiveEnabled: true,
    homeTeamId: U(200),
    awayTeamId: U(201),
    homeScore: 0,
    awayScore: 0,
    players: Array.from({ length: 22 }, (_, i) => ({
      id: U(i + 300),
      externalId: String(i + 1),
      appPlayerId: U(i + 1),
      active: true,
      reviewed: true,
      version: "approved_test_mapping",
      updatedAt: "2026-10-18T00:00:00Z",
    })),
  };
}
function setup(
  options: {
    rated?: boolean;
    reserve?: boolean;
    providerError?: RapidApiError;
    missingMapping?: boolean;
    detail?: unknown;
    claim?: string;
  } = {},
) {
  const writes: { name: string; args: Record<string, unknown> }[] = [];
  const paths: string[] = [];
  const client: FixtureRpcClient = {
    schema: () => ({
      rpc: async (name, args) => {
        writes.push({ name, args });
        if (name === "service_sofascore_collection_plan")
          return { data: { enabled: true, due: [syntheticCandidate] }, error: null };
        if (name === "service_sofascore_collection_claim")
          return {
            data: { status: options.claim ?? "claimed", due: [syntheticCandidate] },
            error: null,
          };
        if (name === "service_sofascore_collection_reserve")
          return { data: options.reserve ?? true, error: null };
        if (name === "service_sofascore_fantasy_context") {
          const ctx = syntheticContext();
          if (options.missingMapping) ctx.players.shift();
          return { data: ctx, error: null };
        }
        if (name === "service_sofascore_collection_commit")
          return {
            data: { ...(args.p_meta as object), created: args.p_request !== null },
            error: null,
          };
        if (name === "service_sofascore_collection_finish") return { data: null, error: null };
        throw new Error("unexpected RPC");
      },
    }),
  };
  const rapid = {
    getJson: async (path: string) => {
      paths.push(path);
      if (options.providerError) throw options.providerError;
      return {
        data: path.startsWith("matches/detail")
          ? (options.detail ?? syntheticDetail())
          : path.includes("lineups")
            ? syntheticLineups(options.rated ?? true)
            : path.includes("incidents")
              ? { incidents: [] }
              : { statistics: [] },
        quota: { remaining: 5000, limit: 10000 },
        requestsSent: paths.length,
      };
    },
  };
  return { client, rapid, writes, paths, now: new Date("2026-10-19T00:00:00Z"), holder: U(999) };
}
describe("unattended collection worker (mock provider/RPC; not live evidence)", () => {
  test("discovers from durable state and sends validated approved-ID observations into the existing recorder", async () => {
    const s = setup();
    const result = await runSofascoreCollection(s);
    expect(result.body).toMatchObject({
      code: "collected",
      requests: 4,
      created: 1,
      validated: 1,
      missingRatings: 0,
    });
    const write = s.writes.find((w) => w.name === "service_sofascore_collection_commit")!;
    const request = write.args.p_request as {
      payload: { players: { rating: number; teamId: string }[] };
    };
    expect(request.payload.players).toHaveLength(22);
    expect(request.payload.players[0]!.rating).toBe(7.2);
    expect(request.payload.players[0]!.teamId).toBe(U(200));
    expect(s.writes.filter((w) => w.name.includes("auto_map"))).toHaveLength(0);
    expect(s.writes.filter((w) => w.name.endsWith("reserve"))).toHaveLength(4);
  });
  test("missing ratings are recorded as unavailable and remain pending without invented points", async () => {
    const s = setup({ rated: false });
    const result = await runSofascoreCollection(s);
    expect(result.body).toMatchObject({ code: "ratings_pending", missingRatings: 22, created: 1 });
    const request = s.writes.find((w) => w.name.endsWith("commit"))!.args.p_request as {
      payload: { players: { rating: unknown }[] };
    };
    expect(request.payload.players.every((p) => p.rating === null)).toBe(true);
  });
  test("an unapproved identity holds the whole match, without creating mappings", async () => {
    const s = setup({ missingMapping: true });
    const result = await runSofascoreCollection(s);
    expect(result.body).toMatchObject({ code: "approved_player_mapping_missing", created: 0 });
    expect(s.writes.find((w) => w.name.endsWith("commit"))!.args.p_request).toBeNull();
  });
  test("dry-run is read-only and requires no provider calls; lease losers send nothing", async () => {
    const s = setup();
    await runSofascoreCollection({ ...s, dryRun: true });
    expect(s.paths).toHaveLength(0);
    expect(s.writes.map((w) => w.name)).toEqual(["service_sofascore_collection_plan"]);
    for (const claim of ["disabled", "busy", "cooldown", "budget_stop", "idle"]) {
      const x = setup({ claim });
      await runSofascoreCollection(x);
      expect(x.paths).toHaveLength(0);
      expect(x.writes).toHaveLength(1);
    }
  });
  test("reservation refusal protects quota before any request", async () => {
    const s = setup({ reserve: false });
    const r = await runSofascoreCollection(s);
    expect(s.paths).toHaveLength(0);
    expect(r.body).toMatchObject({ code: "collection_budget_or_lease_stop" });
  });
  test("access denial and Retry-After persist bounded cooldown instead of fanning out", async () => {
    for (const error of [
      new RapidApiError("provider_unavailable", "never log this", undefined, 403),
      new RapidApiError("provider_rate_limited", "never log this", undefined, 429, 7200),
    ]) {
      const s = setup({ providerError: error });
      const r = await runSofascoreCollection(s);
      expect(s.paths).toHaveLength(1);
      expect(r.body).toMatchObject({ cooldownSeconds: error.httpStatus === 403 ? 86400 : 7200 });
      expect(JSON.stringify(r)).not.toContain("never log this");
    }
  });
  test("rejects wrong competition/status and duplicate players before observation writes", async () => {
    const detail = syntheticDetail();
    detail.event.tournament.uniqueTournament.id = 1;
    const s = setup({ detail });
    const r = await runSofascoreCollection(s);
    expect(r.body).toMatchObject({ code: "event_identity_or_status_invalid", created: 0 });
    expect(s.paths).toHaveLength(1);
    const lineups = syntheticLineups();
    lineups.away.players[0]!.player.id = 1;
    expect(() => validateCollectionLineups(lineups)).toThrow("duplicate_player_id");
  });
});
