import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  auditGuard,
  auditMembershipRows,
  auditExtendedRows,
  auditFixtureSample,
  runRosterAudit,
} from "./current-season-roster-audit";
import { SportsMonksProbeError } from "./sportsmonks-production-probe";

const observedAt = "2026-09-14T19:00:00.000Z";
const env = {
  EXPECTED_COMMIT: "a".repeat(40),
  GITHUB_SHA: "a".repeat(40),
  GITHUB_REPOSITORY: "mrdata007/botolago-foundation",
  GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_ACTOR: "mrdata007",
  GITHUB_RUN_ATTEMPT: "1",
  GITHUB_TRIGGERING_ACTOR: "mrdata007",
  CONFIRMATION: "AUDIT_CURRENT_ROSTERS_READ_ONLY",
  SPORTSMONKS_API_TOKEN: "audit-test-token-not-a-real-secret",
};
const position = { id: 25, developer_name: "DEFENDER" };
function member(playerId = 123) {
  return {
    id: playerId + 1000,
    team_id: 1,
    season_id: 28647,
    player_id: playerId,
    position_id: null,
    position: null,
    player: { id: playerId, name: "PRIVATE PLAYER NAME", position_id: 25, position },
    start: "2026-09-14",
    end: "2026-09-14",
  };
}
function provider(path: string) {
  if (path.endsWith("/leagues/860"))
    return {
      data: {
        id: 860,
        active: true,
        currentseason: {
          id: 28647,
          league_id: 860,
          name: "2026/2027",
          is_current: true,
          starting_at: "2026-09-24",
          ending_at: "2026-09-24",
        },
      },
    };
  if (path.endsWith("/teams/seasons/28647"))
    return {
      data: Array.from({ length: 16 }, (_, index) => ({ id: index + 1 })),
      pagination: { has_more: false },
    };
  if (path.includes("/fixtures/between/"))
    return {
      data: [
        {
          id: 999,
          league_id: 860,
          season_id: 28647,
          starting_at: "2026-09-24 00:00:00",
          starting_at_timestamp: 1790208000,
          placeholder: true,
          state_id: 1,
        },
      ],
    };
  return { data: [] };
}

describe("read-only current roster audit", () => {
  test("requires exact first owner dispatch and has no database or scheduled workflow capability", () => {
    expect(auditGuard(env)).toBe(env.EXPECTED_COMMIT);
    for (const override of [
      { GITHUB_SHA: "b".repeat(40) },
      { GITHUB_RUN_ATTEMPT: "2" },
      { GITHUB_EVENT_NAME: "schedule" },
      { GITHUB_ACTOR: "someone-else" },
      { GITHUB_REF: "refs/heads/feature" },
      { GITHUB_TRIGGERING_ACTOR: "someone-else" },
    ])
      expect(() => auditGuard({ ...env, ...override })).toThrow("audit_dispatch_guard_failed");
    const workflow = readFileSync(".github/workflows/football-current-roster-audit.yml", "utf8");
    expect(workflow).not.toContain("SUPABASE");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("write");
  });

  test("counts authoritative profile roles without exposing player identities and respects inclusive contract dates", () => {
    const payload = {
      data: [
        member(),
        { ...member(124), end: "2026-09-13", start: null },
        { ...member(125), start: "2026-09-15", end: null },
      ],
    };
    const current = auditMembershipRows(payload, 1, observedAt, "current");
    expect(current).toMatchObject({
      raw: 3,
      membershipRoleKnown: 0,
      profileRoleKnown: 3,
      profileFillsMissingMembershipRole: 3,
      eligibleCurrentContracts: 1,
      ineligibleCurrentContracts: 2,
      eligibleCurrentContractsWithKnownRole: 1,
    });
    expect(JSON.stringify(current)).not.toContain("PRIVATE PLAYER NAME");
    const season = auditMembershipRows(payload, 1, observedAt, "season");
    expect(season).toMatchObject({
      profileFillsMissingMembershipRole: 3,
      eligibleCurrentContracts: null,
    });
    expect(() =>
      auditMembershipRows({ data: [{ ...member(), team_id: 2 }] }, 1, observedAt, "current"),
    ).toThrow("roster_scope_mismatch");
    expect(() =>
      auditMembershipRows({ data: [member(), member()] }, 1, observedAt, "current"),
    ).toThrow("duplicate_roster_identity");
    expect(() =>
      auditMembershipRows({ data: [{ ...member(), end: "2026-02-30" }] }, 1, observedAt, "current"),
    ).toThrow("invalid_provider_date");
  });

  test("does not count conflicting roles or unverified extended squad flags as eligible", () => {
    const membership = {
      ...member(),
      position_id: 24,
      position: { id: 24, developer_name: "GOALKEEPER" },
    };
    expect(auditMembershipRows({ data: [membership] }, 1, observedAt, "current")).toMatchObject({
      conflictingRoles: 1,
      roleKnownWithoutConflict: 0,
      eligibleCurrentContractsWithKnownRole: 0,
    });
    expect(
      auditExtendedRows(
        {
          data: [
            { id: 1, in_squad: true, position_id: 25, position },
            { id: 2, in_squad: false, position_id: 25, position },
            { id: 3, in_squad: "true", position_id: 25, position },
          ],
        },
        1,
      ),
    ).toMatchObject({
      raw: 3,
      inSquadTrue: 1,
      inSquadFalse: 1,
      inSquadMissingOrInvalid: 1,
      inSquadTrueWithKnownRole: 1,
      eligibleCurrentContracts: null,
    });
    expect(() =>
      auditExtendedRows({ data: [{ id: 1, in_squad: true, position_id: 24, position }] }, 1),
    ).toThrow("position_identity_mismatch");
  });

  test("observes all 16 clubs with exactly 51 scoped GET helper calls and captures unconfirmed fixture timing", async () => {
    const paths: string[] = [];
    const result = await runRosterAudit(
      env,
      async (path, query, token) => {
        paths.push(path);
        expect(token).toBe(env.SPORTSMONKS_API_TOKEN);
        if (path.includes("/squads/"))
          expect(query).toEqual({
            include: path.endsWith("/extended") ? "position" : "player.position;position",
          });
        return provider(path);
      },
      observedAt,
    );
    expect(paths).toHaveLength(51);
    expect(result.clubs).toHaveLength(16);
    expect(result.logicalRequests).toBe(51);
    expect(result.fixtureSample).toMatchObject({
      starting_at: "2026-09-24 00:00:00",
      placeholder: true,
      state_id: 1,
      timingIndependentlyConfirmed: false,
    });
    expect(JSON.stringify(result)).not.toContain(env.SPORTSMONKS_API_TOKEN);
    expect(auditFixtureSample({ data: [{ id: 1, league_id: 860, season_id: 28647 }] })).toEqual({
      available: true,
      externalId: "1",
      timingIndependentlyConfirmed: false,
    });
  });

  test("distinguishes denied endpoints from zero coverage and avoids repeating the denied endpoint", async () => {
    let denied = 0;
    const result = await runRosterAudit(
      env,
      async (path) => {
        if (path.endsWith("/extended")) {
          denied += 1;
          throw new SportsMonksProbeError("provider_access_denied");
        }
        return provider(path);
      },
      observedAt,
    );
    expect(denied).toBe(1);
    expect(result.logicalRequests).toBe(36);
    expect(result.clubs[0].extended).toEqual({
      status: "unavailable",
      errorCode: "provider_access_denied",
    });
    expect(result.clubs[1].extended).toEqual({
      status: "unavailable",
      errorCode: "provider_access_denied",
      requestSkippedAfterAccessDenial: true,
    });
    expect(result.clubs[0].current).toMatchObject({ status: "ok", counts: { raw: 0 } });
  });

  test("rejects incorrect live season identity before any roster request", async () => {
    let requested = 0;
    await expect(
      runRosterAudit(
        env,
        async () => {
          requested += 1;
          return { data: { id: 860, active: true, currentseason: { id: 999, league_id: 860 } } };
        },
        observedAt,
      ),
    ).rejects.toThrow("current_season_scope_mismatch");
    expect(requested).toBe(1);
  });
});
