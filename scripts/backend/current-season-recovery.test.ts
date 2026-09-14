import { describe, expect, test } from "bun:test";
import {
  fixtureWindows,
  normalizeCurrentMembership,
  readAllProviderRows,
  validateCurrentReadiness,
  validateCurrentSquads,
  validateCanaryRun,
  validateRecoveryMode,
  preflightCurrentSquadRpc,
  currentRosterContractEligible,
  normalizeCurrentTeamRoster,
  loadCurrentSeasonSquad,
} from "./current-season-recovery";
import type { SportsMonksProbeEvidence } from "./sportsmonks-production-probe";

const sha = "a".repeat(40);
const probe: SportsMonksProbeEvidence = {
  schemaVersion: 1,
  provider: "sportsmonks",
  mode: "read_only",
  expectedCommit: sha,
  observedAt: "2026-09-14T12:00:00Z",
  league: { id: 860, name: "Botola Pro", active: true },
  season: {
    id: 28647,
    leagueId: 860,
    name: "2026/2027",
    current: true,
    startingAt: "2026-09-24",
    endingAt: "2026-09-24",
  },
  verifiedResources: { rounds: 1, teams: 16 },
  fixtureWindow: { from: "2026-09-24", to: "2026-09-24", inclusiveDays: 1 },
  fixtureSample: {
    available: true,
    leagueMatches: true,
    seasonMatches: true,
    participants: 2,
    statePresent: true,
    scores: 0,
  },
  requestCount: 4,
  verdict: "pass",
};

describe("current season recovery boundaries", () => {
  test("current roster contract start and end dates are inclusive and expired or future contracts are excluded", () => {
    expect(
      currentRosterContractEligible({ start: "2026-09-14", end: "2026-09-14" }, probe.observedAt),
    ).toBe(true);
    expect(currentRosterContractEligible({ start: null, end: null }, probe.observedAt)).toBe(true);
    expect(
      currentRosterContractEligible({ start: "2026-09-15", end: null }, probe.observedAt),
    ).toBe(false);
    expect(
      currentRosterContractEligible({ start: "2025-01-01", end: "2026-09-13" }, probe.observedAt),
    ).toBe(false);
    expect(() => currentRosterContractEligible({ start: "2026-02-30" }, probe.observedAt)).toThrow(
      "invalid_provider_date",
    );
    expect(() =>
      currentRosterContractEligible({ start: "2026-09-15", end: "2026-09-14" }, probe.observedAt),
    ).toThrow("invalid_current_contract_range");
  });
  test("current team roster preserves provenance without constructing a provider season_id", () => {
    const value = Object.freeze({
      id: 1,
      team_id: 10,
      player_id: 99,
      position_id: 27,
      position: { id: 27, developer_name: "DEFENDER" },
      player: { id: 99, name: "Verified Player" },
      start: "2026-08-01",
      end: null,
    });
    const normalized = normalizeCurrentTeamRoster(value, 10, probe.observedAt);
    expect(normalized?.position).toBe("defender");
    expect((normalized?.freshness as { sourceVersion: string }).sourceVersion).toStartWith(
      "sportsmonks-current-team-roster:10:99:",
    );
    expect("season_id" in value).toBe(false);
    expect(() => normalizeCurrentTeamRoster(value, 11, probe.observedAt)).toThrow(
      "squad_scope_mismatch",
    );
    expect(() =>
      normalizeCurrentTeamRoster(
        { ...value, position: { id: 26, developer_name: "MIDFIELDER" } },
        10,
        probe.observedAt,
      ),
    ).toThrow("squad_position_mismatch");
    expect(
      normalizeCurrentTeamRoster({ ...value, end: "2026-09-13" }, 10, probe.observedAt),
    ).toBeNull();
  });
  test("fallback is bounded to empty season results and the verified 16 current-season clubs", async () => {
    const calls: Array<{ path: string; query: Readonly<Record<string, string>> }> = [];
    const value = {
      id: 1,
      team_id: 10,
      player_id: 99,
      position_id: 27,
      position: { id: 27, developer_name: "DEFENDER" },
      player: { id: 99, name: "Verified Player" },
      start: "2026-08-01",
      end: null,
    };
    const request = async (path: string, query: Readonly<Record<string, string>>) => {
      calls.push({ path, query });
      return { data: path.includes("/seasons/") ? [] : [value] };
    };
    const verified = new Set(Array.from({ length: 16 }, (_, i) => i + 1));
    const loaded = await loadCurrentSeasonSquad(10, verified, probe.observedAt, "secret", request);
    expect(loaded.memberships).toHaveLength(1);
    expect(loaded.evidence).toMatchObject({
      source: "current-team-roster",
      associatedSeasonExternalId: "28647",
      association: "verified_current_season_club",
      seasonSourceRows: 0,
      sourceRows: 1,
      eligiblePlayers: 1,
    });
    expect(calls).toEqual([
      { path: "/v3/football/squads/seasons/28647/teams/10", query: { include: "player;position" } },
      { path: "/v3/football/squads/teams/10", query: { include: "player;position" } },
    ]);
    await expect(
      loadCurrentSeasonSquad(17, verified, probe.observedAt, "secret", request),
    ).rejects.toThrow("current_roster_club_not_verified");
    expect(calls).toHaveLength(2);
  });
  test("populated or malformed season data never silently switches to current-team roster", async () => {
    const verified = new Set(Array.from({ length: 16 }, (_, i) => i + 1));
    const calls: string[] = [];
    const seasonRow = {
      id: 1,
      season_id: 28647,
      team_id: 10,
      player_id: 99,
      position_id: null,
      player: { id: 99, name: "Unclassified Player" },
    };
    const loaded = await loadCurrentSeasonSquad(
      10,
      verified,
      probe.observedAt,
      "secret",
      async (path) => {
        calls.push(path);
        return { data: [seasonRow] };
      },
    );
    expect(calls).toHaveLength(1);
    expect(loaded.evidence.source).toBe("season-squad");
    expect(loaded.memberships).toHaveLength(0);
    await expect(
      loadCurrentSeasonSquad(10, verified, probe.observedAt, "secret", async () => ({
        data: null,
      })),
    ).rejects.toThrow("invalid_current_squad_response");
  });
  test("duplicate roster player rows fail before any current squad transaction", async () => {
    const verified = new Set(Array.from({ length: 16 }, (_, i) => i + 1));
    const member = { id: 1, team_id: 10, player_id: 99 };
    await expect(
      loadCurrentSeasonSquad(10, verified, probe.observedAt, "secret", async (path) => ({
        data: path.includes("/seasons/") ? [] : [member, { ...member, id: 2 }],
      })),
    ).rejects.toThrow("duplicate_current_roster_player");
  });
  test("deployed squad RPC preflight proves service access with input that cannot mutate data", async () => {
    const calls: unknown[] = [];
    const client = {
      schema: (schema: "api") => ({
        rpc: async (name: string, args: Record<string, unknown>) => {
          calls.push({ schema, name, args });
          return { data: null, error: { code: "PT400", message: "invalid_current_squad_input" } };
        },
      }),
    };
    expect(await preflightCurrentSquadRpc(client)).toEqual({
      available: true,
      serviceAuthorized: true,
      writesAttempted: false,
    });
    expect(calls).toEqual([
      {
        schema: "api",
        name: "service_ingest_current_football_squads",
        args: {
          p_provider_name: null,
          p_season_external_id: null,
          p_team_squads: null,
          p_observed_at: null,
        },
      },
    ]);
  });
  test("preflight rejects unauthenticated, missing and unexpected successful RPC responses", async () => {
    for (const error of [
      null,
      { code: "PT403", message: "forbidden" },
      { code: "42501", message: "permission denied" },
      { code: "PGRST202", message: "function not found" },
      { code: "PT400", message: "some_other_error" },
    ]) {
      const client = { schema: (_name: "api") => ({ rpc: async () => ({ data: null, error }) }) };
      await expect(preflightCurrentSquadRpc(client)).rejects.toThrow(
        "current_squad_rpc_preflight_failed",
      );
    }
  });
  test("recurring refresh requires opt-in and cannot run a new canary", () => {
    expect(
      validateRecoveryMode({
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR: "mrdata007",
        CURRENT_SEASON_RECOVERY_MODE: "canary",
      }),
    ).toBe("canary");
    expect(
      validateRecoveryMode({
        GITHUB_EVENT_NAME: "schedule",
        CURRENT_SEASON_RECOVERY_MODE: "refresh",
        FOOTBALL_CURRENT_SCHEDULE_ENABLED: "true",
      }),
    ).toBe("refresh");
    expect(() =>
      validateRecoveryMode({
        GITHUB_EVENT_NAME: "schedule",
        CURRENT_SEASON_RECOVERY_MODE: "refresh",
      }),
    ).toThrow("current_season_schedule_not_enabled");
    expect(() =>
      validateRecoveryMode({
        GITHUB_EVENT_NAME: "schedule",
        CURRENT_SEASON_RECOVERY_MODE: "canary",
        FOOTBALL_CURRENT_SCHEDULE_ENABLED: "true",
      }),
    ).toThrow("current_season_schedule_not_enabled");
    expect(() =>
      validateRecoveryMode({
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR: "someone-else",
        CURRENT_SEASON_RECOVERY_MODE: "refresh",
      }),
    ).toThrow("immutable_owner_dispatch_required");
  });
  test("only a successful first-attempt owner canary is trusted as refresh evidence", () => {
    const run = {
      path: ".github/workflows/football-current-season-recovery.yml",
      event: "workflow_dispatch",
      conclusion: "success",
      head_branch: "main",
      run_attempt: 1,
      head_sha: sha,
      repository: { full_name: "mrdata007/botolago-foundation" },
      actor: { login: "mrdata007" },
    };
    expect(validateCanaryRun(run)).toBe(sha);
    for (const change of [
      { event: "schedule" },
      { conclusion: "failure" },
      { run_attempt: 2 },
      { head_branch: "unreviewed" },
      { actor: { login: "someone-else" } },
      { path: ".github/workflows/some-other-workflow.yml" },
    ]) {
      expect(() => validateCanaryRun({ ...run, ...change })).toThrow(
        "verified_manual_canary_required",
      );
    }
  });
  test("accepts truthful partial provider dates without inventing a full season", () => {
    expect(() => validateCurrentReadiness(probe, sha)).not.toThrow();
    expect(fixtureWindows(probe.season.startingAt, probe.season.endingAt)).toEqual([
      { from: "2026-09-24", to: "2026-09-24" },
    ]);
    expect(() =>
      validateCurrentReadiness({ ...probe, season: { ...probe.season, id: 26027 } }, sha),
    ).toThrow("current_season_scope_mismatch");
    expect(() =>
      validateCurrentReadiness(
        { ...probe, season: { ...probe.season, startingAt: "2026-02-30" } },
        sha,
      ),
    ).toThrow("invalid_provider_date");
    expect(() =>
      validateCurrentReadiness(
        { ...probe, season: { ...probe.season, endingAt: "2029-09-24" } },
        sha,
      ),
    ).toThrow("current_season_dates_out_of_scope");
  });
  test("windows exhaust the date interval exactly once with bounded requests", () => {
    const windows = fixtureWindows("2026-09-24", "2027-07-05");
    expect(windows[0].from).toBe("2026-09-24");
    expect(windows.at(-1)?.to).toBe("2027-07-05");
    for (let i = 0; i < windows.length; i++) {
      expect((Date.parse(windows[i].to) - Date.parse(windows[i].from)) / 86400000).toBeLessThan(30);
      if (i > 0) expect(Date.parse(windows[i].from) - Date.parse(windows[i - 1].to)).toBe(86400000);
    }
  });
  test("reads all provider pages and rejects duplicate page loops", async () => {
    const calls: string[] = [];
    const request = async (_path: string, query: Readonly<Record<string, string>>) => {
      calls.push(query.page);
      return { data: [{ id: Number(query.page) }], pagination: { has_more: query.page === "1" } };
    };
    expect(await readAllProviderRows("/v3/football/test", {}, "secret", request)).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
    expect(calls).toEqual(["1", "2"]);
    await expect(
      readAllProviderRows("/v3/football/test", {}, "secret", async () => ({
        data: [{ id: 1 }],
        pagination: { has_more: true },
      })),
    ).rejects.toThrow("duplicate_provider_page_row");
  });
  test("current membership resolves only exact player/season/team identities", () => {
    const value = {
      id: 1,
      season_id: 28647,
      team_id: 10,
      player_id: 99,
      position_id: 27,
      position: { id: 27, developer_name: "DEFENDER" },
      player: { id: 99, name: "Verified Player" },
      jersey_number: 4,
    };
    expect(normalizeCurrentMembership(value, 10, probe.observedAt)?.position).toBe("defender");
    expect(() =>
      normalizeCurrentMembership({ ...value, season_id: 26027 }, 10, probe.observedAt),
    ).toThrow("squad_scope_mismatch");
    expect(
      normalizeCurrentMembership({ ...value, position_id: null }, 10, probe.observedAt),
    ).toBeNull();
  });
  test("rejects ambiguous cross-club memberships before any squad transaction", () => {
    const squads = Array.from({ length: 16 }, (_, n) => ({
      teamExternalId: String(n + 1),
      memberships: [{ externalPlayerId: String(n + 100), shirtNumber: 1 }],
    }));
    expect(() => validateCurrentSquads(squads)).not.toThrow();
    squads[1].memberships[0].externalPlayerId = "100";
    expect(() => validateCurrentSquads(squads)).toThrow("duplicate_current_player_membership");
  });
});
