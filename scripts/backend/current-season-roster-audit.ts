import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  requestSportsMonksJson,
  requireSportsMonksToken,
  SportsMonksProbeError,
} from "./sportsmonks-production-probe";

type Row = Record<string, unknown>;
type Source = "season" | "current" | "extended";
const BASE = "/v3/football";
const LEAGUE = 860;
const SEASON = 28647;
const MAX_REQUESTS = 51;
const ROLES: Record<number, string> = {
  24: "GOALKEEPER",
  25: "DEFENDER",
  26: "MIDFIELDER",
  27: "ATTACKER",
};

class RosterAuditError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
function fail(code: string): never {
  throw new RosterAuditError(code);
}
function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_provider_object");
  return value as Row;
}
function id(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    fail("invalid_provider_id");
  return value;
}
function date(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail("invalid_provider_date");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    fail("invalid_provider_date");
  return value;
}
function rows(payload: unknown, maximum = 250): Row[] {
  const response = row(payload);
  if (!Array.isArray(response.data) || response.data.length > maximum)
    fail("invalid_provider_rows");
  const pagination = response.pagination ?? (response.meta ? row(response.meta).pagination : null);
  if (pagination) {
    const page = row(pagination);
    if (page.has_more === true || (page.next_page !== undefined && page.next_page !== null))
      fail("unexpected_provider_pagination");
  }
  return response.data.map(row);
}
function role(holder: Row): string | null {
  if (holder.position_id === null || holder.position_id === undefined) return null;
  const positionId = id(holder.position_id);
  const known = ROLES[positionId] ?? null;
  if (holder.position !== undefined && holder.position !== null) {
    const position = row(holder.position);
    if (id(position.id) !== positionId) fail("position_identity_mismatch");
    if (known && position.developer_name !== undefined && position.developer_name !== known)
      fail("position_role_mismatch");
  }
  return known;
}
function contractEligible(member: Row, observedAt: string): boolean {
  const asOf = new Date(observedAt).toISOString().slice(0, 10);
  const start = member.start == null ? null : date(member.start);
  const end = member.end == null ? null : date(member.end);
  if (start && end && start > end) fail("invalid_contract_range");
  return (!start || start <= asOf) && (!end || end >= asOf);
}
function safeError(error: unknown): string {
  return error instanceof RosterAuditError || error instanceof SportsMonksProbeError
    ? error.code
    : "audit_unexpected_error";
}

export function auditGuard(env: Record<string, string | undefined>): string {
  const sha = env.EXPECTED_COMMIT ?? "";
  if (
    !/^[0-9a-f]{40}$/.test(sha) ||
    sha !== env.GITHUB_SHA ||
    env.GITHUB_REPOSITORY !== "mrdata007/botolago-foundation" ||
    env.GITHUB_REF !== "refs/heads/main" ||
    env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    env.GITHUB_ACTOR !== "mrdata007" ||
    env.GITHUB_RUN_ATTEMPT !== "1" ||
    (env.GITHUB_TRIGGERING_ACTOR !== undefined && env.GITHUB_TRIGGERING_ACTOR !== "mrdata007") ||
    env.CONFIRMATION !== "AUDIT_CURRENT_ROSTERS_READ_ONLY"
  )
    fail("audit_dispatch_guard_failed");
  return sha;
}

export function auditMembershipRows(
  payload: unknown,
  teamId: number,
  observedAt: string,
  source: "season" | "current",
) {
  const members = rows(payload);
  const playerIds = new Set<number>();
  const rowIds = new Set<number>();
  const counts = {
    raw: members.length,
    membershipRoleKnown: 0,
    profileRoleKnown: 0,
    profileFillsMissingMembershipRole: 0,
    roleKnownWithoutConflict: 0,
    conflictingRoles: 0,
    eligibleCurrentContracts: source === "current" ? 0 : null,
    ineligibleCurrentContracts: source === "current" ? 0 : null,
    eligibleCurrentContractsWithKnownRole: source === "current" ? 0 : null,
    contractDateFieldsPresent: 0,
  };
  for (const member of members) {
    if (id(member.team_id) !== teamId || (source === "season" && id(member.season_id) !== SEASON))
      fail("roster_scope_mismatch");
    const playerId = id(member.player_id);
    const recordId = id(member.id);
    if (playerIds.has(playerId) || rowIds.has(recordId)) fail("duplicate_roster_identity");
    playerIds.add(playerId);
    rowIds.add(recordId);
    const player = row(member.player);
    if (id(player.id) !== playerId) fail("player_identity_mismatch");
    const membershipRole = role(member);
    const profileRole = role(player);
    const conflict = Boolean(membershipRole && profileRole && membershipRole !== profileRole);
    const known = Boolean((membershipRole || profileRole) && !conflict);
    if (membershipRole) counts.membershipRoleKnown += 1;
    if (profileRole) counts.profileRoleKnown += 1;
    if (!membershipRole && profileRole) counts.profileFillsMissingMembershipRole += 1;
    if (conflict) counts.conflictingRoles += 1;
    if (known) counts.roleKnownWithoutConflict += 1;
    if ("start" in member || "end" in member) counts.contractDateFieldsPresent += 1;
    if (source === "current") {
      const eligible = contractEligible(member, observedAt);
      if (eligible) counts.eligibleCurrentContracts! += 1;
      else counts.ineligibleCurrentContracts! += 1;
      if (eligible && known) counts.eligibleCurrentContractsWithKnownRole! += 1;
    }
  }
  return counts;
}

export function auditExtendedRows(payload: unknown, teamId: number) {
  const players = rows(payload);
  const ids = new Set<number>();
  const counts = {
    raw: players.length,
    inSquadTrue: 0,
    inSquadFalse: 0,
    inSquadMissingOrInvalid: 0,
    roleKnown: 0,
    inSquadTrueWithKnownRole: 0,
    eligibleCurrentContracts: null,
  };
  for (const player of players) {
    const playerId = id(player.id);
    if (ids.has(playerId)) fail("duplicate_roster_identity");
    ids.add(playerId);
    if (player.team_id !== undefined && id(player.team_id) !== teamId)
      fail("roster_scope_mismatch");
    const known = Boolean(role(player));
    if (known) counts.roleKnown += 1;
    if (player.in_squad === true) {
      counts.inSquadTrue += 1;
      if (known) counts.inSquadTrueWithKnownRole += 1;
    } else if (player.in_squad === false) counts.inSquadFalse += 1;
    else counts.inSquadMissingOrInvalid += 1;
  }
  return counts;
}

export function auditFixtureSample(payload: unknown): Row {
  const response = row(payload);
  if (!Array.isArray(response.data)) fail("invalid_fixture_sample");
  if (response.data.length === 0) return { available: false, timingIndependentlyConfirmed: false };
  const fixture = row(response.data[0]);
  if (id(fixture.league_id) !== LEAGUE || id(fixture.season_id) !== SEASON)
    fail("fixture_scope_mismatch");
  const result: Row = {
    available: true,
    externalId: String(id(fixture.id)),
    timingIndependentlyConfirmed: false,
  };
  for (const key of ["starting_at", "starting_at_timestamp", "placeholder", "state_id"]) {
    if (!(key in fixture)) continue;
    const value = fixture[key];
    if (
      key === "starting_at" &&
      value !== null &&
      (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value))
    )
      fail("invalid_fixture_time");
    if (
      (key === "starting_at_timestamp" || key === "state_id") &&
      value !== null &&
      (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    )
      fail("invalid_fixture_time");
    if (key === "placeholder" && value !== null && typeof value !== "boolean")
      fail("invalid_fixture_placeholder");
    result[key] = value;
  }
  return result;
}

export async function runRosterAudit(
  env: Record<string, string | undefined>,
  request: typeof requestSportsMonksJson = requestSportsMonksJson,
  observedAt = new Date().toISOString(),
) {
  const expectedCommit = auditGuard(env);
  const token = requireSportsMonksToken(env.SPORTSMONKS_API_TOKEN);
  let requests = 0;
  const get = async (path: string, query: Record<string, string> = {}) => {
    if (++requests > MAX_REQUESTS) fail("audit_request_budget_exceeded");
    return request(`${BASE}${path}`, query, token);
  };
  const league = row(row(await get(`/leagues/${LEAGUE}`, { include: "currentSeason" })).data);
  const season = row(league.currentseason ?? league.current_season ?? league.currentSeason);
  if (
    id(league.id) !== LEAGUE ||
    league.active !== true ||
    id(season.id) !== SEASON ||
    id(season.league_id) !== LEAGUE ||
    season.is_current !== true ||
    season.name !== "2026/2027"
  )
    fail("current_season_scope_mismatch");
  const start = date(season.starting_at);
  const end = date(season.ending_at);
  if (start < "2026-01-01" || start > "2026-12-31" || end < start || end > "2027-12-31")
    fail("current_season_date_scope_mismatch");
  const teams = rows(await get(`/teams/seasons/${SEASON}`, { page: "1", per_page: "50" }), 16);
  const teamIds = teams.map((team) => id(team.id));
  if (teamIds.length !== 16 || new Set(teamIds).size !== 16)
    fail("current_season_team_scope_mismatch");
  const unavailable = new Map<Source, string>();
  const clubs: Row[] = [];
  for (const teamId of teamIds) {
    const club: Row = {
      teamExternalId: String(teamId),
      associatedSeasonExternalId: String(SEASON),
    };
    for (const source of ["season", "current", "extended"] as const) {
      if (unavailable.has(source)) {
        club[source] = {
          status: "unavailable",
          errorCode: unavailable.get(source),
          requestSkippedAfterAccessDenial: true,
        };
        continue;
      }
      try {
        const path =
          source === "season"
            ? `/squads/seasons/${SEASON}/teams/${teamId}`
            : `/squads/teams/${teamId}${source === "extended" ? "/extended" : ""}`;
        const payload = await get(path, {
          include: source === "extended" ? "position" : "player.position;position",
        });
        club[source] = {
          status: "ok",
          counts:
            source === "extended"
              ? auditExtendedRows(payload, teamId)
              : auditMembershipRows(payload, teamId, observedAt, source),
        };
      } catch (error) {
        const code = safeError(error);
        club[source] = { status: "unavailable", errorCode: code };
        if (code === "provider_access_denied") unavailable.set(source, code);
      }
    }
    clubs.push(club);
  }
  let fixtureSample: Row;
  try {
    fixtureSample = auditFixtureSample(
      await get(`/fixtures/between/${start}/${start}`, {
        filters: `fixtureLeagues:${LEAGUE}`,
        page: "1",
        per_page: "1",
        timezone: "UTC",
      }),
    );
  } catch (error) {
    fixtureSample = {
      status: "unavailable",
      errorCode: safeError(error),
      timingIndependentlyConfirmed: false,
    };
  }
  return {
    schemaVersion: 1,
    mode: "read_only",
    provider: "sportsmonks",
    expectedCommit,
    observedAt,
    leagueId: LEAGUE,
    seasonId: SEASON,
    seasonName: "2026/2027",
    seasonStartingAt: start,
    seasonEndingAt: end,
    verifiedCurrentClubs: 16,
    logicalRequests: requests,
    maximumLogicalRequests: MAX_REQUESTS,
    maximumAttemptsPerRequest: 3,
    clubs,
    fixtureSample,
  };
}

if (import.meta.main) {
  let result: unknown;
  try {
    result = await runRosterAudit(process.env);
  } catch (error) {
    result = { mode: "read_only", status: "failed", errorCode: safeError(error) };
    process.exitCode = 1;
  }
  const evidenceDir = process.env.CURRENT_ROSTER_AUDIT_EVIDENCE_DIR;
  if (!evidenceDir) fail("audit_evidence_directory_missing");
  await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
  await writeFile(
    resolve(evidenceDir, "current-season-roster-audit.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.log("CURRENT_ROSTER_READ_ONLY_AUDIT_EVIDENCE_WRITTEN");
}
