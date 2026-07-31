import { chmod } from "node:fs/promises";
import { resolve } from "node:path";

import {
  SPORTSMONKS_BASE_PATH,
  SportsMonksProbeError,
  requestSportsMonksJson,
  requireSportsMonksToken,
  type ProbeDependencies,
} from "./sportsmonks-production-probe";

export const HISTORICAL_SEASON_ID = 26_027;
export const HISTORICAL_TEAM_IDS = [
  306, 2_846, 6_856, 9_369, 9_535, 16_845, 16_847, 16_849, 16_850, 16_851, 16_853, 16_858, 16_937,
  227_263, 270_260, 274_759,
] as const;

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const DETAIL_NAME_PATTERN = /^[A-Z0-9_]{1,80}$/;

type JsonRecord = Record<string, unknown>;

interface SquadTotals {
  memberships: number;
  uniquePlayers: number;
  namedPlayers: number;
  playersWithDateOfBirth: number;
  playersWithNationality: number;
  membershipsWithJerseyNumber: number;
  duplicateMemberships: number;
}

interface StandingTotals {
  rows: number;
  uniqueTeams: number;
  rankedRows: number;
  detailRecords: number;
  unknownParticipants: number;
  detailDeveloperNames: string[];
}

export interface HistoricalContentProbeEvidence {
  readonly schemaVersion: 1;
  readonly provider: "sportsmonks";
  readonly mode: "read_only_historical_content_coverage";
  readonly expectedCommit: string;
  readonly observedAt: string;
  readonly seasonId: number;
  readonly teamScope: {
    readonly expected: number;
    readonly withSquad: number;
    readonly empty: number;
  };
  readonly squads: SquadTotals;
  readonly standings: StandingTotals;
  readonly requestCount: number;
  readonly verdict: "pass";
}

function record(value: unknown, code: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SportsMonksProbeError(code);
  }
  return value as JsonRecord;
}

function array(value: unknown, code: string): unknown[] {
  if (!Array.isArray(value)) throw new SportsMonksProbeError(code);
  return value;
}

function positiveInteger(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new SportsMonksProbeError(code);
  }
  return value;
}

function optionalPositiveInteger(value: unknown, code: string): number | null {
  if (value === null || value === undefined) return null;
  return positiveInteger(value, code);
}

function nonNegativeNumber(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new SportsMonksProbeError(code);
  }
  return value;
}

function hasUsableName(player: JsonRecord): boolean {
  return ["display_name", "name", "common_name", "firstname", "lastname"].some(
    (key) => typeof player[key] === "string" && player[key].trim().length > 0,
  );
}

function requireCommit(value: string | undefined): string {
  if (!value || !COMMIT_PATTERN.test(value)) {
    throw new SportsMonksProbeError("invalid_expected_commit");
  }
  return value;
}

function parseSquad(
  value: unknown,
  expectedTeamId: number,
  playerProfiles: Map<number, JsonRecord>,
  membershipKeys: Set<string>,
): {
  memberships: number;
  withJerseyNumber: number;
  duplicates: number;
} {
  const response = record(value, "invalid_squad_response");
  const rows = array(response.data, "invalid_squad_data");
  let withJerseyNumber = 0;
  let duplicates = 0;

  for (const candidate of rows) {
    const row = record(candidate, "invalid_squad_row");
    positiveInteger(row.id, "invalid_squad_id");
    const playerId = positiveInteger(row.player_id, "invalid_squad_player_id");
    const teamId = positiveInteger(row.team_id, "invalid_squad_team_id");
    const seasonId = positiveInteger(row.season_id, "invalid_squad_season_id");
    const positionId = positiveInteger(row.position_id, "invalid_squad_position_id");
    if (teamId !== expectedTeamId || seasonId !== HISTORICAL_SEASON_ID) {
      throw new SportsMonksProbeError("squad_scope_mismatch");
    }

    const player = record(row.player, "missing_squad_player_include");
    if (positiveInteger(player.id, "invalid_player_id") !== playerId || !hasUsableName(player)) {
      throw new SportsMonksProbeError("invalid_squad_player_include");
    }
    const position = record(row.position, "missing_squad_position_include");
    if (positiveInteger(position.id, "invalid_position_id") !== positionId) {
      throw new SportsMonksProbeError("invalid_squad_position_include");
    }

    const jersey = optionalPositiveInteger(row.jersey_number, "invalid_jersey_number");
    if (jersey !== null) {
      if (jersey > 99) throw new SportsMonksProbeError("invalid_jersey_number");
      withJerseyNumber += 1;
    }

    const membershipKey = `${playerId}:${teamId}`;
    if (membershipKeys.has(membershipKey)) duplicates += 1;
    membershipKeys.add(membershipKey);
    if (!playerProfiles.has(playerId)) playerProfiles.set(playerId, player);
  }

  return { memberships: rows.length, withJerseyNumber, duplicates };
}

function parseStandings(value: unknown): StandingTotals {
  const response = record(value, "invalid_standings_response");
  const rows = array(response.data, "invalid_standings_data");
  const expectedTeams = new Set<number>(HISTORICAL_TEAM_IDS);
  const uniqueTeams = new Set<number>();
  const detailDeveloperNames = new Set<string>();
  let rankedRows = 0;
  let detailRecords = 0;
  let unknownParticipants = 0;

  for (const candidate of rows) {
    const row = record(candidate, "invalid_standing_row");
    positiveInteger(row.id, "invalid_standing_id");
    const participantId = positiveInteger(row.participant_id, "invalid_standing_participant_id");
    if (positiveInteger(row.season_id, "invalid_standing_season_id") !== HISTORICAL_SEASON_ID) {
      throw new SportsMonksProbeError("standing_scope_mismatch");
    }
    const position = positiveInteger(row.position, "invalid_standing_position");
    if (position > 1_000) throw new SportsMonksProbeError("invalid_standing_position");
    nonNegativeNumber(row.points, "invalid_standing_points");
    rankedRows += 1;
    uniqueTeams.add(participantId);
    if (!expectedTeams.has(participantId)) unknownParticipants += 1;

    const participant = record(row.participant, "missing_standing_participant_include");
    if (positiveInteger(participant.id, "invalid_standing_participant_include") !== participantId) {
      throw new SportsMonksProbeError("invalid_standing_participant_include");
    }

    for (const detailCandidate of array(row.details, "missing_standing_details_include")) {
      const detail = record(detailCandidate, "invalid_standing_detail");
      positiveInteger(detail.id, "invalid_standing_detail_id");
      const developerName = detail.developer_name;
      if (typeof developerName !== "string" || !DETAIL_NAME_PATTERN.test(developerName)) {
        throw new SportsMonksProbeError("invalid_standing_detail_name");
      }
      if (!["number", "string"].includes(typeof detail.value)) {
        throw new SportsMonksProbeError("invalid_standing_detail_value");
      }
      detailDeveloperNames.add(developerName);
      detailRecords += 1;
    }
  }

  return {
    rows: rows.length,
    uniqueTeams: uniqueTeams.size,
    rankedRows,
    detailRecords,
    unknownParticipants,
    detailDeveloperNames: [...detailDeveloperNames].sort(),
  };
}

export async function runSportsMonksHistoricalContentProbe(
  values: Readonly<Record<string, string | undefined>>,
  dependencies: ProbeDependencies = {},
): Promise<HistoricalContentProbeEvidence> {
  const token = requireSportsMonksToken(values.SPORTSMONKS_API_TOKEN);
  const expectedCommit = requireCommit(values.EXPECTED_COMMIT);
  const observedAt = (dependencies.now ?? (() => new Date()))();
  const playerProfiles = new Map<number, JsonRecord>();
  const membershipKeys = new Set<string>();
  let memberships = 0;
  let withSquad = 0;
  let membershipsWithJerseyNumber = 0;
  let duplicateMemberships = 0;

  for (const teamId of HISTORICAL_TEAM_IDS) {
    const response = await requestSportsMonksJson(
      `${SPORTSMONKS_BASE_PATH}/squads/seasons/${HISTORICAL_SEASON_ID}/teams/${teamId}`,
      { include: "player;position" },
      token,
      dependencies,
    );
    const parsed = parseSquad(response, teamId, playerProfiles, membershipKeys);
    memberships += parsed.memberships;
    membershipsWithJerseyNumber += parsed.withJerseyNumber;
    duplicateMemberships += parsed.duplicates;
    if (parsed.memberships > 0) withSquad += 1;
  }

  const standings = parseStandings(
    await requestSportsMonksJson(
      `${SPORTSMONKS_BASE_PATH}/standings/seasons/${HISTORICAL_SEASON_ID}`,
      { include: "participant;details" },
      token,
      dependencies,
    ),
  );

  let namedPlayers = 0;
  let playersWithDateOfBirth = 0;
  let playersWithNationality = 0;
  for (const player of playerProfiles.values()) {
    if (hasUsableName(player)) namedPlayers += 1;
    if (typeof player.date_of_birth === "string" && player.date_of_birth.length > 0) {
      playersWithDateOfBirth += 1;
    }
    if (
      optionalPositiveInteger(
        player.nationality_id ?? player.country_id,
        "invalid_player_nationality_id",
      ) !== null
    ) {
      playersWithNationality += 1;
    }
  }

  const evidence: HistoricalContentProbeEvidence = {
    schemaVersion: 1,
    provider: "sportsmonks",
    mode: "read_only_historical_content_coverage",
    expectedCommit,
    observedAt: observedAt.toISOString(),
    seasonId: HISTORICAL_SEASON_ID,
    teamScope: {
      expected: HISTORICAL_TEAM_IDS.length,
      withSquad,
      empty: HISTORICAL_TEAM_IDS.length - withSquad,
    },
    squads: {
      memberships,
      uniquePlayers: playerProfiles.size,
      namedPlayers,
      playersWithDateOfBirth,
      playersWithNationality,
      membershipsWithJerseyNumber,
      duplicateMemberships,
    },
    standings,
    requestCount: HISTORICAL_TEAM_IDS.length + 1,
    verdict: "pass",
  };

  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (serialized.includes(token)) throw new SportsMonksProbeError("credential_in_evidence");
  return evidence;
}

async function main(): Promise<void> {
  const evidenceDirectory = process.env.GATE3A_EVIDENCE_DIR?.trim();
  if (!evidenceDirectory) throw new SportsMonksProbeError("missing_evidence_directory");
  const evidence = await runSportsMonksHistoricalContentProbe(process.env);
  const outputPath = resolve(evidenceDirectory, "sportsmonks-historical-content-probe.json");
  await Bun.write(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600);
  console.log("SPORTSMONKS_HISTORICAL_CONTENT_PROBE_PASS");
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const code = error instanceof SportsMonksProbeError ? error.code : "unexpected_probe_failure";
    console.error(`SPORTSMONKS_HISTORICAL_CONTENT_PROBE_FAIL code=${code}`);
    process.exitCode = 1;
  });
}
