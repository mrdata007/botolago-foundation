import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CurrentSeasonRecoveryError,
  currentRosterContractEligible,
  readAllProviderRows,
} from "./current-season-recovery";
import {
  requestSportsMonksJson,
  requireSportsMonksToken,
  SportsMonksProbeError,
} from "./sportsmonks-production-probe";

// This season's player list as SportsMonks shows it today: every club's squad,
// and the lineups of the fixtures asked for. The observation is stored in
// production and planned there (migration 20260925200000); the player list
// itself does not change here. Applying a reviewed plan is a separate step,
// taken with the Fantasy tick paused
// (docs/backend/CURRENT_PLAYER_LIST_UPDATE.md).

type Row = Record<string, unknown>;
const SEASON = 28647;
const LEAGUE = 860;
const BASE = "/v3/football";
const CLUBS = 16;
const MAX_FIXTURES = 20;
/** SportsMonks position ids, as the current-season squad import reads them. */
const POSITIONS: Readonly<Record<number, string>> = {
  24: "goalkeeper",
  25: "defender",
  26: "midfielder",
  27: "forward",
};

export interface ObservedPlayer {
  externalPlayerId: string;
  fullName: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  position: string | null;
  shirtNumber: number | null;
}
interface RpcClient {
  schema(name: "api"): {
    rpc(
      name: string,
      args: Row,
    ): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
  };
}

export class CurrentPlayerListError extends Error {
  constructor(
    readonly code: string,
    readonly diagnostic?: Row,
  ) {
    super(code);
  }
}
function fail(code: string, diagnostic?: Row): never {
  throw new CurrentPlayerListError(code, diagnostic);
}
function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_provider_object");
  return value as Row;
}
function id(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    fail("invalid_provider_id", { field });
  return value;
}
function name(value: unknown, minimum: number, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length >= minimum && cleaned.length <= maximum ? cleaned : null;
}
function birthDate(value: unknown, today: string): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  return value >= "1900-01-01" && value <= today ? value : null;
}
function shirt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 99
    ? value
    : null;
}

/**
 * One player as SportsMonks describes them. The first known position wins; a
 * player without a usable name is left out (and counted by the caller).
 */
export function observedPlayer(
  playerId: number,
  player: Row | null,
  fallbackName: unknown,
  positionIds: readonly unknown[],
  jerseyNumber: unknown,
  today: string,
): ObservedPlayer | null {
  const fullName =
    name(player?.name, 2, 200) ??
    name(player?.display_name, 2, 200) ??
    name(player?.common_name, 2, 200) ??
    name(fallbackName, 2, 200);
  const displayName =
    name(player?.display_name, 2, 120) ??
    name(player?.common_name, 2, 120) ??
    name(fullName, 2, 120);
  if (!fullName || !displayName) return null;
  const position = positionIds
    .map((value) => (typeof value === "number" ? (POSITIONS[value] ?? null) : null))
    .find((value) => value !== null);
  return {
    externalPlayerId: String(playerId),
    fullName,
    displayName,
    firstName: name(player?.firstname, 1, 100),
    lastName: name(player?.lastname, 1, 100),
    dateOfBirth: birthDate(player?.date_of_birth, today),
    position: position ?? null,
    shirtNumber: shirt(jerseyNumber),
  };
}

/**
 * A club's squad this season. When SportsMonks has no season squad yet, the
 * club's current roster stands in, contracts running today only: the same
 * sources, in the same order, as the current-season squad import.
 */
export async function loadClubSquad(
  teamId: number,
  observedAt: string,
  token: string,
  request: typeof requestSportsMonksJson = requestSportsMonksJson,
): Promise<{ club: Row; evidence: Row }> {
  const read = async (path: string): Promise<Row[]> => {
    const payload = row(await request(path, { include: "player" }, token));
    if (!Array.isArray(payload.data) || payload.data.length > 100)
      fail("invalid_squad_response", { teamExternalId: String(teamId) });
    return payload.data.map(row);
  };
  const seasonRows = await read(`${BASE}/squads/seasons/${SEASON}/teams/${teamId}`);
  const source = seasonRows.length > 0 ? "season-squad" : "current-team-roster";
  const rows = seasonRows.length > 0 ? seasonRows : await read(`${BASE}/squads/teams/${teamId}`);
  const today = observedAt.slice(0, 10);
  const players: ObservedPlayer[] = [];
  const seen = new Set<string>();
  let excludedContracts = 0;
  let unnamed = 0;
  let repeated = 0;
  for (const member of rows) {
    if (id(member.team_id, "squad.team_id") !== teamId)
      fail("squad_scope_mismatch", { teamExternalId: String(teamId) });
    if (source === "season-squad" && member.season_id !== undefined && member.season_id !== SEASON)
      fail("squad_scope_mismatch", { teamExternalId: String(teamId) });
    if (source === "current-team-roster" && !currentRosterContractEligible(member, observedAt)) {
      excludedContracts += 1;
      continue;
    }
    const player = member.player && typeof member.player === "object" ? row(member.player) : null;
    const observed = observedPlayer(
      id(member.player_id, "squad.player_id"),
      player,
      null,
      [member.position_id, player?.position_id],
      member.jersey_number,
      today,
    );
    if (!observed) {
      unnamed += 1;
      continue;
    }
    if (seen.has(observed.externalPlayerId)) {
      repeated += 1;
      continue;
    }
    seen.add(observed.externalPlayerId);
    players.push(observed);
  }
  return {
    club: { teamExternalId: String(teamId), source, players },
    evidence: {
      teamExternalId: String(teamId),
      source,
      sourceRows: rows.length,
      players: players.length,
      withoutPosition: players.filter((player) => player.position === null).length,
      excludedContracts,
      unnamed,
      repeated,
    },
  };
}

/** Who SportsMonks names in a fixture's lineup, and for which of its two clubs. */
export async function loadFixtureLineup(
  fixtureId: number,
  observedAt: string,
  token: string,
  request: typeof requestSportsMonksJson = requestSportsMonksJson,
): Promise<{ lineup: Row; evidence: Row }> {
  const fixture = row(
    row(
      await request(
        `${BASE}/fixtures/${fixtureId}`,
        { include: "lineups.player;participants" },
        token,
      ),
    ).data,
  );
  if (
    id(fixture.id, "fixture.id") !== fixtureId ||
    fixture.season_id !== SEASON ||
    fixture.league_id !== LEAGUE ||
    !Array.isArray(fixture.participants)
  )
    fail("lineup_fixture_scope_mismatch", { fixtureExternalId: String(fixtureId) });
  const clubs = new Set(
    fixture.participants.map((participant) => id(row(participant).id, "participant.id")),
  );
  if (clubs.size !== 2)
    fail("lineup_fixture_scope_mismatch", { fixtureExternalId: String(fixtureId) });
  const rows = Array.isArray(fixture.lineups) ? fixture.lineups.map(row) : [];
  const today = observedAt.slice(0, 10);
  const players: Array<ObservedPlayer & { teamExternalId: string }> = [];
  const seen = new Set<string>();
  let unidentified = 0;
  let unnamed = 0;
  for (const lineup of rows) {
    const teamId = id(lineup.team_id, "lineup.team_id");
    if (!clubs.has(teamId))
      fail("lineup_fixture_scope_mismatch", { fixtureExternalId: String(fixtureId) });
    if (lineup.player_id === null || lineup.player_id === undefined) {
      unidentified += 1;
      continue;
    }
    const player = lineup.player && typeof lineup.player === "object" ? row(lineup.player) : null;
    const observed = observedPlayer(
      id(lineup.player_id, "lineup.player_id"),
      player,
      lineup.player_name,
      [player?.position_id, lineup.position_id],
      lineup.jersey_number,
      today,
    );
    if (!observed) {
      unnamed += 1;
      continue;
    }
    if (seen.has(observed.externalPlayerId))
      fail("duplicate_lineup_player", { fixtureExternalId: String(fixtureId) });
    seen.add(observed.externalPlayerId);
    players.push({ ...observed, teamExternalId: String(teamId) });
  }
  return {
    lineup: { fixtureExternalId: String(fixtureId), players },
    evidence: {
      fixtureExternalId: String(fixtureId),
      lineupRows: rows.length,
      players: players.length,
      unidentified,
      unnamed,
    },
  };
}

export function parseFixtureIds(value: string | undefined): number[] {
  const text = (value ?? "").trim();
  if (text === "") return [];
  const ids = text.split(",").map((part) => part.trim());
  if (ids.length > MAX_FIXTURES || ids.some((part) => !/^[1-9]\d{0,14}$/.test(part)))
    fail("invalid_fixture_ids");
  if (new Set(ids).size !== ids.length) fail("invalid_fixture_ids");
  return ids.map(Number);
}

async function rpc(client: RpcClient, name: string, args: Row): Promise<unknown> {
  const result = await client.schema("api").rpc(name, args);
  if (result.error)
    fail("current_player_list_rpc_failed", {
      rpcName: name,
      ...(result.error.code && /^[A-Z0-9]{5}$/.test(result.error.code)
        ? { sqlState: result.error.code }
        : {}),
      // The database's own refusal (player_list_club_scope_mismatch, ...) says why.
      ...(result.error.message && /^[a-z][a-z_]{2,79}$/.test(result.error.message)
        ? { reason: result.error.message }
        : {}),
    });
  return result.data;
}

/** Reads SportsMonks, records the observation and returns its plan. Writes nothing else. */
export async function runCurrentPlayerListObservation(
  client: RpcClient,
  token: string,
  fixtureIds: readonly number[],
  request: typeof requestSportsMonksJson = requestSportsMonksJson,
  now: () => Date = () => new Date(),
): Promise<Row> {
  const observedAt = now().toISOString();
  const teams = await readAllProviderRows(`${BASE}/teams/seasons/${SEASON}`, {}, token, request);
  const teamIds = [...new Set(teams.map((team) => id(team.id, "team.id")))].sort((a, b) => a - b);
  if (teamIds.length !== CLUBS) fail("current_club_count_mismatch", { clubs: teamIds.length });
  const clubs: Row[] = [];
  const squadEvidence: Row[] = [];
  for (const teamId of teamIds) {
    const squad = await loadClubSquad(teamId, observedAt, token, request);
    clubs.push(squad.club);
    squadEvidence.push(squad.evidence);
  }
  const lineups: Row[] = [];
  const lineupEvidence: Row[] = [];
  for (const fixtureId of fixtureIds) {
    const lineup = await loadFixtureLineup(fixtureId, observedAt, token, request);
    lineups.push(lineup.lineup);
    lineupEvidence.push(lineup.evidence);
  }
  const recorded = row(
    await rpc(client, "service_record_current_player_list", {
      p_observations: {
        providerName: "sportsmonks",
        seasonExternalId: String(SEASON),
        observedAt,
        clubs,
        lineups,
      },
    }),
  );
  if (typeof recorded.observationId !== "string" || !/^[0-9a-f-]{36}$/.test(recorded.observationId))
    fail("invalid_observation_record");
  const plan = row(
    await rpc(client, "service_plan_current_player_list", {
      p_observation_id: recorded.observationId,
    }),
  );
  if (typeof plan.digest !== "string" || !/^[0-9a-f]{64}$/.test(plan.digest))
    fail("invalid_player_list_plan");
  return {
    verdict: "planned",
    observation: recorded,
    squads: squadEvidence,
    lineups: lineupEvidence,
    plan,
  };
}

export function currentPlayerListGuard(env: Record<string, string | undefined>): {
  token: string;
  url: string;
  secret: string;
  expectedCommit: string;
  fixtureIds: number[];
} {
  const expectedCommit = env.EXPECTED_COMMIT ?? "";
  if (
    !/^[0-9a-f]{40}$/.test(expectedCommit) ||
    expectedCommit !== env.GITHUB_SHA ||
    env.GITHUB_REPOSITORY !== "mrdata007/botolago-foundation" ||
    env.GITHUB_REF !== "refs/heads/main" ||
    env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    env.GITHUB_ACTOR !== "mrdata007" ||
    env.GITHUB_RUN_ATTEMPT !== "1" ||
    env.CONFIRMATION !== "OBSERVE_CURRENT_PLAYER_LIST" ||
    env.SUPABASE_PRODUCTION_PROJECT_REF !== "tkewgajrljbwgwedqsxn" ||
    env.SUPABASE_PRODUCTION_PROJECT_NAME !== "BotolaGO Production V2" ||
    env.SUPABASE_PRODUCTION_URL?.replace(/\/$/, "") !==
      "https://tkewgajrljbwgwedqsxn.supabase.co" ||
    !env.SUPABASE_SECRET_KEY
  )
    fail("current_player_list_dispatch_guard_failed");
  return {
    expectedCommit,
    token: requireSportsMonksToken(env.SPORTSMONKS_API_TOKEN),
    url: env.SUPABASE_PRODUCTION_URL,
    secret: env.SUPABASE_SECRET_KEY,
    fixtureIds: parseFixtureIds(env.FIXTURE_IDS),
  };
}

function safeFailure(error: unknown): Row {
  if (error instanceof CurrentPlayerListError)
    return { code: error.code, ...(error.diagnostic ? { diagnostic: error.diagnostic } : {}) };
  if (error instanceof SportsMonksProbeError || error instanceof CurrentSeasonRecoveryError)
    return { code: error.code };
  return { code: "current_player_list_failed" };
}

if (import.meta.main) {
  const config = currentPlayerListGuard(process.env);
  const evidenceDir = process.env.CURRENT_PLAYER_LIST_EVIDENCE_DIR;
  if (!evidenceDir) fail("current_player_list_evidence_directory_missing");
  await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
  let evidence: Row;
  try {
    const client = createClient(config.url, config.secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    evidence = {
      mode: "observe_current_player_list",
      expectedCommit: config.expectedCommit,
      ...(await runCurrentPlayerListObservation(client, config.token, config.fixtureIds)),
    };
  } catch (error) {
    evidence = { verdict: "fail", expectedCommit: config.expectedCommit, ...safeFailure(error) };
    process.exitCode = 1;
  }
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (serialized.includes(config.secret) || serialized.includes(config.token))
    fail("credential_in_evidence");
  await writeFile(resolve(evidenceDir, "current-player-list.json"), serialized, { mode: 0o600 });
  console.log("CURRENT_PLAYER_LIST_EVIDENCE_WRITTEN");
}
