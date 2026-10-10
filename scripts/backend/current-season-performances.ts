import { collectAdaptiveEvidence } from "./adaptive-performance-evidence";
import {
  loadOwnerDecisions,
  ownerDecisionCoverage,
  unnamedStarterNames,
  type OwnerDecision,
} from "./current-fixture-owner-decisions";
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  MAX_ANONYMOUS_STARTER_ROWS,
  normalizeHistoricalFixture,
  HistoricalPerformanceRuntimeError,
  type HistoricalPlayerPerformanceRow,
} from "../../supabase/functions/_shared/sportsmonks-historical-player-performance";
import {
  requestSportsMonksJson,
  requireSportsMonksToken,
  SportsMonksProbeError,
} from "./sportsmonks-production-probe";

type Row = Record<string, unknown>;
export const CURRENT_PERFORMANCE_TYPES = [
  52, 57, 79, 83, 84, 85, 88, 112, 113, 118, 119, 324,
] as const;
/**
 * What the one provider request of this path asks for, in every mode: a page,
 * the one-fixture canary, the read-only diagnostic and every orchestrator pass.
 * `scores` carries the final score that goals conceded follow (below); a
 * request without it gets a payload without scores, and every fixture then
 * stops at `current_final_score_missing`.
 */
const CURRENT_PERFORMANCE_INCLUDE = "lineups.details;state;participants;scores;events";
// SportsMonks sends a statistic only when it is not zero: on 2026-09-24's
// first match (fixture 19874708) only the 3 scorers carried goals and only the
// players who came on carried minutes, and last season's accepted fixtures
// average about 2 statistic rows per player out of 13. So an absent statistic
// counts as zero (owner delegated the decision, 2026-09-25), with checks that
// absence cannot hide: every starter carries minutes played, and a substitute
// without minutes never scored, assisted, missed a penalty, put through an own
// goal, made a save or saved a penalty (none did in last season's 238
// matches; a late substitute can carry goals conceded without minutes, as 23
// did).
//
// Goals conceded, which decide clean sheets, follow the final score instead:
// SportsMonks' own figure is not reliable (last season 40 of the 327
// goalkeepers who played a whole match for a side that conceded carried
// fewer). A starter with 90 minutes conceded what the side did; anyone else
// uses a reconciled goal timeline when every conceded goal preceded both the
// first team departure and their official minutes. Otherwise an explicit
// provider figure is required for a shortened starter's defensive eligibility.
// Same-minute goals/departures are deliberately not ordered by guesswork.
/** Counted as zero when absent (an explicit null on 57 or 113 stays null and is not counted). */
const COUNTED_TYPES = [52, 57, 79, 83, 84, 85, 88, 112, 113, 119, 324] as const;
const MINUTES = 119;
/**
 * Goals, saves, assists, penalties missed and saved, own goals: never without
 * minutes played (the scorer awards saves without looking at minutes).
 */
const ON_PITCH_TYPES = [52, 57, 79, 112, 113, 324] as const;
/**
 * Statistic types whose value above zero shows a player was on the pitch or
 * scored: goals 52, saves 57, assists 79, red 83, yellow 84, second yellow 85,
 * goals conceded 88, penalties missed 112 and saved 113, rating 118, own goals
 * 324. Diagnostics only: nothing here changes what is ingested.
 */
const PARTICIPATION_SCORING_TYPES = [52, 57, 79, 83, 84, 85, 88, 112, 113, 118, 324] as const;
/** An explicit null on these goalkeeper statistics is "unknown", which is never zero. */
const PARTICIPATION_UNKNOWN_TYPES = [57, 113] as const;
/**
 * One named lineup player's provider facts, by provider ids and type ids only
 * (no names, no raw payload). Read-only evidence for the diagnose run: it is
 * never sent to the database.
 */
export type LineupParticipation = {
  externalPlayerId: string;
  externalTeamId: string;
  role: "starter" | "substitute" | "unknown";
  /**
   * The provider's `position_id` on the lineup row, as sent; null when it sent
   * none. SportsMonks position types: 24 goalkeeper, 25 defender, 26
   * midfielder, 27 attacker. Evidence only: nothing reads it to create a
   * player, and a missing one stays missing.
   */
  positionId: number | null;
  /** Official minutes (type 119); null when the provider sent none. */
  officialMinutes: number | null;
  /** Scoring-relevant statistic types carrying a value above zero. */
  scoringStatisticTypeIds: number[];
  /** Goalkeeper statistic types the provider sent as an explicit null. */
  unknownStatisticTypeIds: number[];
  /** Statistic types the provider sent with an explicit zero. */
  zeroStatisticTypeIds: number[];
  /** Types of the provider's own match events that name this player. */
  eventTypeIds: number[];
};
/** SportsMonks stops counting at 90: a starter with 90 minutes was on from kick-off to the 90th. */
const WHOLE_MATCH_MINUTES = 90;
const SEASON = 28647;
/** Provider event type ids that put a goal on the board: goal, own goal, penalty. */
const GOAL_EVENT_TYPES = [14, 15, 16];
/** SportsMonks lineup `position_id` of an attacker (24 goalkeeper, 25 defender, 26 midfielder). */
const ATTACKER_POSITION = 27;
/**
 * Who scored, from the provider's own goal events, when they add up to the
 * final score of both sides: a goal (14) or penalty (16) event per goal, each
 * naming a lineup player of the side it counts for. Null when they do not, or
 * when there is an own goal (15) anywhere, which events alone cannot settle.
 */
function goalsFromMatchEvents(
  fixture: Row,
  rows: ReadonlyArray<{ externalPlayerId: string; externalTeamId: string; ownGoals: number }>,
  goalsFor: Map<number, number>,
): Map<string, number> | null {
  if (!Array.isArray(fixture.events)) return null;
  if (rows.some((player) => player.ownGoals > 0)) return null;
  const scorers = new Map<string, number>();
  const perSide = new Map<number, number>();
  for (const raw of fixture.events) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const event = raw as Row;
    if (event.type_id === 15) return null;
    if (event.type_id !== 14 && event.type_id !== 16) continue;
    const side = event.participant_id as number;
    if (
      !Number.isSafeInteger(side) ||
      !goalsFor.has(side) ||
      !Number.isSafeInteger(event.player_id)
    )
      return null;
    const scorer = String(event.player_id);
    if (
      !rows.some(
        (player) => player.externalPlayerId === scorer && player.externalTeamId === String(side),
      )
    )
      return null;
    scorers.set(scorer, (scorers.get(scorer) ?? 0) + 1);
    perSide.set(side, (perSide.get(side) ?? 0) + 1);
  }
  for (const [side, goals] of goalsFor) if ((perSide.get(side) ?? 0) !== goals) return null;
  return scorers;
}
/** Numbers only: id, type, side, scorer id (when the provider gave one) and minute. */
function goalEventSummary(fixture: Row): Row[] {
  if (!Array.isArray(fixture.events)) return [];
  const num = (value: unknown) => (Number.isSafeInteger(value) ? (value as number) : null);
  return fixture.events
    .filter(
      (raw): raw is Row =>
        !!raw &&
        typeof raw === "object" &&
        GOAL_EVENT_TYPES.includes((raw as Row).type_id as number),
    )
    .map((event) => ({
      eventId: num(event.id),
      typeId: num(event.type_id),
      participantId: num(event.participant_id),
      playerId: num(event.player_id),
      minute: num(event.minute),
      extraMinute: num(event.extra_minute),
    }))
    .slice(0, 30);
}
/** How many lineup rows the provider left without a player id, per club (starters apart). */
function unidentifiedByTeam(lineups: Row[]): Row[] {
  const counts = new Map<string, { starters: number; others: number }>();
  for (const lineup of lineups) {
    if (lineup.player_id !== null && lineup.player_id !== undefined) continue;
    const key = String(lineup.team_id);
    const entry = counts.get(key) ?? { starters: 0, others: 0 };
    if (lineup.type_id === 11) entry.starters += 1;
    else entry.others += 1;
    counts.set(key, entry);
  }
  return [...counts].map(([teamExternalId, entry]) => ({ teamExternalId, ...entry }));
}
/** Proves only the narrow case where all conceded goals precede any departure.
 * Own goals, VAR, extra time and malformed/incomplete timelines need review;
 * this is not a general reconstruction of on-pitch intervals.
 */
function starterConcessionBoundary(
  fixture: Row,
  fixtureId: number,
  goalsFor: Map<number, number>,
): Map<number, { lastGoal: number; firstDeparture: number }> {
  const result = new Map<number, { lastGoal: number; firstDeparture: number }>();
  if ((fixture.state as Row)?.developer_name !== "FT" || !Array.isArray(fixture.events))
    return result;
  const events: Row[] = [];
  const ids = new Set<number>();
  for (const raw of fixture.events) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
    const event = raw as Row;
    if (
      !Number.isSafeInteger(event.id) ||
      (event.id as number) <= 0 ||
      ids.has(event.id as number) ||
      event.fixture_id !== fixtureId ||
      !Number.isSafeInteger(event.type_id) ||
      ![14, 16, 17, 18, 19, 20, 21, 1675].includes(event.type_id as number) ||
      !goalsFor.has(event.participant_id as number) ||
      !Number.isInteger(event.minute) ||
      (event.minute as number) < 0 ||
      (event.minute as number) > 90 ||
      (event.extra_minute != null &&
        (!Number.isInteger(event.extra_minute) || (event.extra_minute as number) < 0))
    )
      return result;
    ids.add(event.id as number);
    events.push(event);
  }
  const goals = events.filter((event) => event.type_id === 14 || event.type_id === 16);
  for (const [team, count] of goalsFor) {
    if (goals.filter((event) => event.participant_id === team).length !== count) return result;
  }
  for (const team of goalsFor.keys()) {
    const conceded = goals.filter((event) => event.participant_id !== team);
    const departures = events.filter(
      (event) => event.participant_id === team && [18, 20, 21].includes(event.type_id as number),
    );
    // Require an observed departure as well as official minutes. A missing
    // substitution list cannot certify a shortened starter's participation.
    if (
      conceded.length &&
      departures.length &&
      conceded.every((event) => event.extra_minute == null || event.extra_minute === 0)
    )
      result.set(team, {
        lastGoal: Math.max(...conceded.map((event) => event.minute as number)),
        firstDeparture: Math.min(...departures.map((event) => event.minute as number)),
      });
  }
  return result;
}
interface PerformanceRow extends Omit<HistoricalPlayerPerformanceRow, "saves" | "penaltiesSaved"> {
  readonly saves: number | null;
  readonly penaltiesSaved: number | null;
}
interface RpcClient {
  schema(name: "api"): {
    rpc(
      name: string,
      args: Row,
    ): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
  };
}
export class CurrentPerformanceError extends Error {
  constructor(
    readonly code: string,
    readonly diagnostic?: Row,
  ) {
    super(code);
  }
}
function fail(code: string, diagnostic?: Row): never {
  throw new CurrentPerformanceError(code, diagnostic);
}

/**
 * What a rejected provider value was, never the value itself. A field path and
 * a type are enough to repair a contract or a mapping; the value could be
 * anything the provider sent, so it stays out of errors and evidence.
 */
export function providerValueType(value: unknown): string {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "non_finite_number";
    if (!Number.isInteger(value)) return "fractional_number";
    if (value < 1) return "non_positive_number";
    return Number.isSafeInteger(value) ? "number" : "unsafe_integer";
  }
  if (typeof value === "string") return /^[1-9]\d{0,14}$/.test(value) ? "numeric_string" : "string";
  return typeof value;
}
function row(value: unknown, field: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("invalid_provider_object", { field, valueType: providerValueType(value) });
  return value as Row;
}
function id(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    fail("invalid_provider_id", { field, valueType: providerValueType(value) });
  return value;
}
function safeFailure(error: unknown): Row {
  if (error instanceof CurrentPerformanceError)
    return { code: error.code, ...(error.diagnostic ? { diagnostic: error.diagnostic } : {}) };
  // The shared normalizer's diagnostics are counts and failure names only.
  if (error instanceof HistoricalPerformanceRuntimeError)
    return {
      code: error.code,
      ...(error.diagnostic ? { diagnostic: { ...error.diagnostic } } : {}),
    };
  if (error instanceof SportsMonksProbeError) return { code: error.code };
  return { code: "current_performance_ingestion_failed" };
}

/**
 * A lineup row the provider could not tie to a player: SportsMonks lists
 * players it has no record of with no `player_id` (BG-0011 measured this in
 * 64 of 240 fixtures of season 26027). The row is never credited to anyone,
 * and it is always reported, whether the fixture is accepted or not.
 */
export type UnidentifiedLineupRow = {
  field: string;
  valueType: string;
  role: "starter" | "substitute" | "unknown";
  teamExternalId: string | null;
  minutes: number | null;
};

function isUnidentified(lineup: Row) {
  return lineup.player_id === null || lineup.player_id === undefined;
}

function unidentifiedLineupRow(lineup: Row, path: string): UnidentifiedLineupRow {
  // Official minutes (type 119), when the provider sent them, tell the owner
  // whether this row could have scored; the row itself is never ingested.
  const minutesDetail = Array.isArray(lineup.details)
    ? (lineup.details.find((detail) => (detail as Row | null)?.type_id === 119) as Row | undefined)
    : undefined;
  const minuteValue = (minutesDetail?.data as Row | null | undefined)?.value;
  return {
    field: `${path}.player_id`,
    valueType: providerValueType(lineup.player_id),
    role: lineup.type_id === 11 ? "starter" : lineup.type_id === 12 ? "substitute" : "unknown",
    teamExternalId:
      typeof lineup.team_id === "number" &&
      Number.isSafeInteger(lineup.team_id) &&
      lineup.team_id > 0
        ? String(lineup.team_id)
        : null,
    minutes:
      typeof minuteValue === "number" && Number.isSafeInteger(minuteValue) && minuteValue >= 0
        ? minuteValue
        : null,
  };
}

/** A provider player the owner identified as one unnamed starter of a club. */
export type UnnamedStarterName = { externalPlayerId: string; externalTeamId: string };

/**
 * Applies the approved `nameUnnamedStarter` owner decisions of one fixture to
 * its provider payload, before anything is built from it: the club's one
 * unnamed starter becomes that provider player, exactly as if SportsMonks had
 * sent the id (on the lineup row and on its statistics that carry none), so
 * his statistics are scored like any named row's. Unnamed substitutes are left
 * as they are. Never a guess: when the club has no unnamed starter or more
 * than one, or the player is already in the lineup, the fixture stops here and
 * nothing is written for it. Returns a new payload; the one given is not changed.
 */
export function nameUnnamedStarters(
  payload: unknown,
  expectedFixtureId: number,
  names: readonly UnnamedStarterName[],
): { payload: unknown; named: UnnamedStarterName[] } {
  if (!names.length) return { payload, named: [] };
  const fixture = row(row(payload, "$").data, "data");
  if (!Array.isArray(fixture.lineups)) fail("current_lineups_incomplete");
  const lineups = fixture.lineups.map((raw, index) => row(raw, `data.lineups[${index}]`));
  for (const name of names) {
    const teamId = Number(name.externalTeamId);
    const playerId = Number(name.externalPlayerId);
    const starters = [...lineups.keys()].filter(
      (index) =>
        isUnidentified(lineups[index]!) &&
        lineups[index]!.type_id === 11 &&
        lineups[index]!.team_id === teamId,
    );
    const alreadyInLineup = lineups.some((lineup) => lineup.player_id === playerId);
    if (starters.length !== 1 || alreadyInLineup)
      fail("owner_decision_unnamed_starter_mismatch", {
        fixtureExternalId: String(expectedFixtureId),
        externalTeamId: name.externalTeamId,
        externalPlayerId: name.externalPlayerId,
        unnamedStarters: starters.length,
        alreadyInLineup,
      });
    const index = starters[0]!;
    const lineup = lineups[index]!;
    lineups[index] = {
      ...lineup,
      player_id: playerId,
      details: Array.isArray(lineup.details)
        ? lineup.details.map((detail) =>
            detail &&
            typeof detail === "object" &&
            !Array.isArray(detail) &&
            isUnidentified(detail as Row)
              ? { ...(detail as Row), player_id: playerId }
              : detail,
          )
        : lineup.details,
    };
  }
  return {
    payload: { ...(payload as Row), data: { ...fixture, lineups } },
    named: names.map((name) => ({
      externalPlayerId: name.externalPlayerId,
      externalTeamId: name.externalTeamId,
    })),
  };
}

export async function normalizeCurrentFinishedFixture(payload: unknown, expectedFixtureId: number) {
  const fixture = row(row(payload, "$").data, "data");
  if (
    id(fixture.id, "data.id") !== expectedFixtureId ||
    id(fixture.season_id, "data.season_id") !== SEASON ||
    id(fixture.league_id, "data.league_id") !== 860
  )
    fail("fixture_scope_mismatch");
  const state = row(fixture.state, "data.state");
  if (
    id(state.id, "data.state.id") !== id(fixture.state_id, "data.state_id") ||
    !["FT", "AET", "FT_PEN"].includes(String(state.developer_name))
  )
    fail("finished_fixture_required");
  if (
    fixture.placeholder === true ||
    !Array.isArray(fixture.participants) ||
    fixture.participants.length !== 2
  )
    fail("fixture_participants_incomplete");
  const participants = fixture.participants.map((team, index) =>
    row(team, `data.participants[${index}]`),
  );
  const teamIds = new Set(
    participants.map((team, index) => id(team.id, `data.participants[${index}].id`)),
  );
  const locations = participants.map(
    (team, index) => row(team.meta, `data.participants[${index}].meta`).location,
  );
  if (
    teamIds.size !== 2 ||
    new Set(locations).size !== 2 ||
    locations.some((location) => !["home", "away"].includes(String(location)))
  )
    fail("fixture_participants_incomplete");
  // Each side's final score, read as the fixtures sync reads it for the
  // database: the one CURRENT score of each location. No list at all is what
  // a request without `scores` in its include gets, so it is named by field.
  if (!Array.isArray(fixture.scores))
    fail("current_final_score_missing", {
      fixtureExternalId: String(expectedFixtureId),
      field: "data.scores",
      valueType: providerValueType(fixture.scores),
    });
  const scores = fixture.scores.map((score, index) => row(score, `data.scores[${index}]`));
  const goalsFor = new Map<number, number>();
  for (const [index, team] of participants.entries()) {
    const location = String(locations[index]);
    const current = scores.filter(
      (score, scoreIndex) =>
        String(score.description).toUpperCase() === "CURRENT" &&
        String(row(score.score, `data.scores[${scoreIndex}].score`).participant).toLowerCase() ===
          location,
    );
    // Each `score` kept here was checked to be an object just above.
    const goals = current.length === 1 ? (current[0]!.score as Row).goals : undefined;
    if (typeof goals !== "number" || !Number.isSafeInteger(goals) || goals < 0)
      fail("current_final_score_missing", { fixtureExternalId: String(expectedFixtureId) });
    goalsFor.set(id(team.id, `data.participants[${index}].id`), goals);
  }
  const totalGoals = [...goalsFor.values()].reduce((sum, goals) => sum + goals, 0);
  if (
    !Array.isArray(fixture.lineups) ||
    fixture.lineups.length < 22 ||
    fixture.lineups.length > 100
  )
    fail("current_lineups_incomplete");
  const lineups = fixture.lineups.map((raw, index) => row(raw, `data.lineups[${index}]`));
  // SportsMonks sometimes lists a player it has not identified: a lineup row
  // with no player_id. It is the one identity the provider legitimately leaves
  // empty; every other id below is always present in a real payload, so its
  // absence is a defect. Owner decision 2026-09-25: this season follows last
  // season's rule (BG-0011 option B). Up to 4 of the 22 starters may be
  // unnamed; unnamed rows are skipped, never credited to anyone, and every
  // named player is scored as usual. More than 4 and the fixture waits.
  const unidentified = lineups.flatMap((lineup, index) =>
    isUnidentified(lineup) ? [unidentifiedLineupRow(lineup, `data.lineups[${index}]`)] : [],
  );
  const unidentifiedStarters = lineups.filter(
    (lineup) => isUnidentified(lineup) && lineup.type_id === 11,
  );
  if (unidentifiedStarters.length > MAX_ANONYMOUS_STARTER_ROWS)
    fail("current_lineup_unidentified_starters_exceeded", {
      fixtureExternalId: String(expectedFixtureId),
      unidentifiedStarters: unidentifiedStarters.length,
      unidentifiedOthers: unidentified.length - unidentifiedStarters.length,
      rows: unidentified,
    });
  const optionalValues = new Map<string, { saves: number | null; penaltiesSaved: number | null }>();
  const explicitConceded = new Set<string>();
  const lineupIds = new Set<number>();
  const normalizationLineups: Row[] = [];
  let detailRows = 0;
  let absentAsZero = 0;
  let startersWithoutMinutes = 0;
  let benchOnPitchWithoutMinutes = 0;
  // Which starters came without minutes, and which statistics they did carry:
  // provider ids and type ids only, so the gap can be traced to one row.
  const startersWithoutMinutesRows: Row[] = [];
  const participation: LineupParticipation[] = [];
  for (const [index, lineup] of lineups.entries()) {
    const path = `data.lineups[${index}]`;
    if (isUnidentified(lineup)) {
      // Passed on as a bare row so the shared normalizer counts it (as
      // excluded, and as an unnamed starter when type_id is 11); it carries
      // no statistics to anyone.
      normalizationLineups.push({
        type_id: lineup.type_id,
        team_id: lineup.team_id,
        player_id: null,
      });
      continue;
    }
    const lineupId = id(lineup.id, `${path}.id`);
    const playerId = id(lineup.player_id, `${path}.player_id`);
    const teamId = id(lineup.team_id, `${path}.team_id`);
    if (
      id(lineup.fixture_id, `${path}.fixture_id`) !== expectedFixtureId ||
      !teamIds.has(teamId) ||
      lineupIds.has(lineupId)
    )
      fail("lineup_identity_mismatch", { field: path });
    lineupIds.add(lineupId);
    // A substitute who never came on may come with no statistics at all.
    const details = lineup.details === undefined || lineup.details === null ? [] : lineup.details;
    // Present but not a list breaks the contract: named by field, never by value.
    if (!Array.isArray(details))
      fail("current_statistics_incomplete", {
        fixtureExternalId: String(expectedFixtureId),
        field: `${path}.details`,
        valueType: providerValueType(details),
      });
    if (details.some((detail) => detail && typeof detail === "object" && detail.type_id === 88))
      explicitConceded.add(String(playerId));
    const types = new Set<number>();
    const values = new Map<number, number>();
    const normalizationDetails: Row[] = [];
    for (const [detailIndex, rawDetail] of details.entries()) {
      detailRows += 1;
      const detailPath = `${path}.details[${detailIndex}]`;
      const detail = row(rawDetail, detailPath);
      const typeId = id(detail.type_id, `${detailPath}.type_id`);
      if (
        id(detail.fixture_id, `${detailPath}.fixture_id`) !== expectedFixtureId ||
        id(detail.lineup_id, `${detailPath}.lineup_id`) !== lineupId ||
        id(detail.player_id, `${detailPath}.player_id`) !== playerId ||
        id(detail.team_id, `${detailPath}.team_id`) !== teamId
      )
        fail("detail_identity_mismatch", { field: detailPath });
      if (types.has(typeId)) fail("duplicate_provider_detail", { field: detailPath, typeId });
      types.add(typeId);
      const value = row(detail.data, `${detailPath}.data`).value;
      if (value === null && [57, 113, 118].includes(typeId)) continue;
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        (typeId !== 118 && !Number.isSafeInteger(value))
      )
        fail("invalid_provider_detail", {
          field: `${detailPath}.data.value`,
          typeId,
          valueType: providerValueType(value),
        });
      values.set(typeId, value);
      normalizationDetails.push(detail);
    }
    // Minutes played decide, whether SportsMonks left them out or sent 0.
    if (!((values.get(MINUTES) ?? 0) > 0)) {
      if (lineup.type_id === 11) {
        startersWithoutMinutes += 1;
        startersWithoutMinutesRows.push({
          externalPlayerId: String(playerId),
          teamExternalId: String(teamId),
          detailTypeIds: [...types].sort((a, b) => a - b),
        });
      } else if (ON_PITCH_TYPES.some((typeId) => (values.get(typeId) ?? 0) > 0))
        benchOnPitchWithoutMinutes += 1;
    }
    participation.push({
      externalPlayerId: String(playerId),
      externalTeamId: String(teamId),
      role: lineup.type_id === 11 ? "starter" : lineup.type_id === 12 ? "substitute" : "unknown",
      positionId:
        typeof lineup.position_id === "number" &&
        Number.isSafeInteger(lineup.position_id) &&
        lineup.position_id > 0
          ? lineup.position_id
          : null,
      officialMinutes: values.has(MINUTES) ? values.get(MINUTES)! : null,
      scoringStatisticTypeIds: PARTICIPATION_SCORING_TYPES.filter(
        (typeId) => (values.get(typeId) ?? 0) > 0,
      ),
      unknownStatisticTypeIds: PARTICIPATION_UNKNOWN_TYPES.filter(
        (typeId) => types.has(typeId) && !values.has(typeId),
      ),
      zeroStatisticTypeIds: [...types]
        .filter((typeId) => values.get(typeId) === 0)
        .sort((a, b) => a - b),
      eventTypeIds: [],
    });
    absentAsZero += COUNTED_TYPES.filter((typeId) => !types.has(typeId)).length;
    // Absent is zero; an explicit null stays unknown (and the database refuses
    // an unknown goalkeeper statistic).
    optionalValues.set(String(playerId), {
      saves: types.has(57) ? (values.get(57) ?? null) : 0,
      penaltiesSaved: types.has(113) ? (values.get(113) ?? null) : 0,
    });
    normalizationLineups.push({ ...lineup, details: normalizationDetails });
  }
  if (startersWithoutMinutes)
    fail("current_starter_minutes_missing", {
      fixtureExternalId: String(expectedFixtureId),
      starterRows: startersWithoutMinutes,
      players: startersWithoutMinutesRows.slice(0, 22),
    });
  if (benchOnPitchWithoutMinutes)
    fail("current_statistics_inconsistent", {
      fixtureExternalId: String(expectedFixtureId),
      substituteRowsWithoutMinutes: benchOnPitchWithoutMinutes,
    });
  // The provider's own match events that name a player (a goal, a card, a
  // substitution), by type id only.
  if (Array.isArray(fixture.events)) {
    for (const raw of fixture.events) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const event = raw as Row;
      if (!Number.isSafeInteger(event.type_id)) continue;
      for (const named of [event.player_id, event.related_player_id]) {
        const entry = participation.find(
          (candidate) => candidate.externalPlayerId === String(named),
        );
        if (entry && !entry.eventTypeIds.includes(event.type_id as number))
          entry.eventTypeIds.push(event.type_id as number);
      }
    }
  }
  const normalized = await normalizeHistoricalFixture(
    { data: { ...fixture, lineups: normalizationLineups } },
    expectedFixtureId,
    SEASON,
  );
  // Only the unnamed rows may be left out, and the shared normalizer must
  // have seen exactly the unnamed starters counted above.
  if (
    normalized.coverage.excludedIncompleteRows !== unidentified.length ||
    normalized.coverage.anonymousStarterRows !== unidentifiedStarters.length ||
    normalized.coverage.invalidDetailRows !== 0
  )
    fail("current_lineups_incomplete");
  // Each club fields 11 starters: its named ones plus its unnamed ones. An
  // unnamed starter whose club is not given could belong to either side.
  const unplaced = unidentifiedStarters.filter(
    (lineup) => !teamIds.has(lineup.team_id as number),
  ).length;
  for (const teamId of teamIds) {
    const unnamed = unidentifiedStarters.filter((lineup) => lineup.team_id === teamId).length;
    const named = normalized.rows.filter(
      (player) => player.externalTeamId === String(teamId) && player.started,
    ).length;
    if (named > 11 - unnamed || named < 11 - unnamed - unplaced)
      fail("current_starters_incomplete", {
        fixtureExternalId: String(expectedFixtureId),
        teamExternalId: String(teamId),
        namedStarters: named,
        unnamedStarters: unnamed,
        unplacedUnnamedStarters: unplaced,
      });
  }
  const boundaries = starterConcessionBoundary(fixture, expectedFixtureId, goalsFor);
  const providerPosition = new Map(
    participation.map((entry) => [entry.externalPlayerId, entry.positionId]),
  );
  let goalsConcededFromTimeline = 0;
  let goalsConcededFromFinalScore = 0;
  // Owner decision 2026-10-03: a forward scores nothing for a clean sheet or
  // goals conceded, so when his cannot be proved he takes the side's total
  // (no clean sheet) instead of holding the fixture. The database checks he
  // is a forward (20261004120000).
  const defensiveUnknownForwards: string[] = [];
  let rows: PerformanceRow[] = normalized.rows.map((player) => {
    // Type88 is goals conceded while the player was on the pitch, when
    // SportsMonks has it; the final score bounds it and decides it for a
    // starter with 90 minutes. Type194 is a team/season aggregate and is
    // deliberately not used as player eligibility.
    const conceded = totalGoals - goalsFor.get(Number(player.externalTeamId))!;
    const boundary = boundaries.get(Number(player.externalTeamId));
    const timelineProvesConceded =
      player.started &&
      boundary !== undefined &&
      boundary.lastGoal < Math.min(boundary.firstDeparture, player.minutes);
    const concededUnknown =
      player.started &&
      player.minutes >= 60 &&
      player.minutes < 90 &&
      conceded > 0 &&
      !explicitConceded.has(player.externalPlayerId) &&
      !timelineProvesConceded;
    if (concededUnknown && providerPosition.get(player.externalPlayerId) === ATTACKER_POSITION) {
      defensiveUnknownForwards.push(player.externalPlayerId);
      return {
        ...player,
        ...optionalValues.get(player.externalPlayerId)!,
        goalsConceded: conceded,
        cleanSheets: 0,
      };
    }
    if (concededUnknown)
      fail("current_defensive_statistics_incomplete", {
        fixtureExternalId: String(expectedFixtureId),
        playerExternalId: player.externalPlayerId,
        // Why neither proof was available, as numbers only: the player's
        // official minutes, the goals his side conceded, whether the provider
        // gave goals conceded for him, and the timeline's two boundaries
        // (null when the events could not be used at all).
        teamExternalId: player.externalTeamId,
        minutes: player.minutes,
        goalsConcededByTeam: conceded,
        explicitGoalsConceded: false,
        timeline: boundary
          ? {
              lastConcededGoalMinute: boundary.lastGoal,
              firstDepartureMinute: boundary.firstDeparture,
            }
          : null,
      });
    if (timelineProvesConceded && player.minutes < 90) goalsConcededFromTimeline += 1;
    const goalsConceded =
      (player.started && player.minutes >= WHOLE_MATCH_MINUTES) || timelineProvesConceded
        ? conceded
        : Math.min(player.goalsConceded, conceded);
    if (goalsConceded !== player.goalsConceded) goalsConcededFromFinalScore += 1;
    return {
      ...player,
      ...optionalValues.get(player.externalPlayerId)!,
      goalsConceded,
      cleanSheets: player.minutes >= 60 && goalsConceded === 0 ? 1 : 0,
    };
  });
  // A scorer's goal (or an opponent's own goal) must account for every goal
  // in the final result. Do not certify a fixture with an unattributed goal:
  // an otherwise green coverage row would let the gameweek award wrong points.
  // The database's scoring snapshot checks this independently, including for
  // fixtures imported before this validation was deployed.
  const attributedTo = (teamId: number) => {
    const opponentId = [...teamIds].find((candidate) => candidate !== teamId)!;
    return rows.reduce(
      (sum, player) =>
        sum +
        (player.externalTeamId === String(teamId) ? player.goals : 0) +
        (player.externalTeamId === String(opponentId) ? player.ownGoals : 0),
      0,
    );
  };
  // Owner decision 2026-10-03: when the per-player goal statistics disagree
  // with the final score but the provider's own goal events add up to it,
  // the events say who scored (19874706 credits one goal too many, 19874709
  // one too few).
  let goalsFromEvents = 0;
  const fromEvents = [...teamIds].some((teamId) => attributedTo(teamId) !== goalsFor.get(teamId))
    ? goalsFromMatchEvents(fixture, rows, goalsFor)
    : null;
  if (fromEvents)
    rows = rows.map((player) => {
      const goals = fromEvents.get(player.externalPlayerId) ?? 0;
      if (goals === player.goals) return player;
      goalsFromEvents += 1;
      return { ...player, goals };
    });
  for (const teamId of teamIds) {
    const opponentId = [...teamIds].find((candidate) => candidate !== teamId)!;
    const attributed = rows.reduce(
      (sum, player) =>
        sum +
        (player.externalTeamId === String(teamId) ? player.goals : 0) +
        (player.externalTeamId === String(opponentId) ? player.ownGoals : 0),
      0,
    );
    if (attributed !== goalsFor.get(teamId))
      fail("current_goal_totals_mismatch", {
        fixtureExternalId: String(expectedFixtureId),
        teamExternalId: String(teamId),
        finalGoals: goalsFor.get(teamId)!,
        attributedGoals: attributed,
        // Where the goals were credited and what the provider's own event list
        // says, by provider id and minute only: the gap is then one named
        // goal, not a count. The totals are never adjusted to match.
        credited: rows
          .filter((player) => player.goals > 0 || player.ownGoals > 0)
          .map((player) => ({
            externalPlayerId: player.externalPlayerId,
            externalTeamId: player.externalTeamId,
            goals: player.goals,
            ownGoals: player.ownGoals,
          }))
          .slice(0, 30),
        goalEvents: goalEventSummary(fixture),
        unidentifiedRows: unidentifiedByTeam(lineups),
      });
  }
  return {
    fixtureExternalId: String(expectedFixtureId),
    rows,
    // Sent to the database, whose source version is a digest of rows and
    // coverage: nothing descriptive goes in here.
    coverage: {
      ...normalized.coverage,
      detailRows,
      scoringStatisticsComplete: true,
      // None is missing once an absent statistic counts as zero; how many did
      // is kept for the record.
      missingStatisticRows: 0,
      absentStatisticsCountedAsZero: absentAsZero,
      goalsConcededFromFinalScore,
      ...(goalsConcededFromTimeline > 0 ? { goalsConcededFromTimeline } : {}),
      // Rows whose goals the match events corrected, and forwards whose goals
      // conceded are the side's total: both part of the source version.
      ...(goalsFromEvents > 0 ? { goalsFromMatchEvents: goalsFromEvents } : {}),
      ...(defensiveUnknownForwards.length ? { defensiveUnknownForwards } : {}),
      cleanSheetSource: "official_minutes_and_on_pitch_goals_conceded",
      goalkeeperStatistics: "explicit_value_or_null_canonical_position_checked_in_database",
    },
    /** Evidence only: which rows were left out, and where they sit in the payload. */
    unnamedRows: unidentified,
    /** Diagnose evidence only: each named lineup player's provider facts. Never sent to the database. */
    participation,
  };
}

/**
 * `ingest` publishes validated facts. `diagnose` is the read-only first step of
 * a recovery: it lists the finished fixtures, reads and validates the provider
 * payloads exactly as ingestion would, and writes nothing.
 */
export type CurrentPerformanceMode = "ingest" | "diagnose";
const CONFIRMATIONS: Record<string, CurrentPerformanceMode> = {
  INGEST_CURRENT_FINISHED_PERFORMANCES: "ingest",
  DIAGNOSE_CURRENT_FINISHED_PERFORMANCES: "diagnose",
};

export function currentPerformanceGuard(env: Record<string, string | undefined>): {
  mode: CurrentPerformanceMode;
  token: string;
  url: string;
  secret: string;
  expectedCommit: string;
} {
  const expectedCommit = env.EXPECTED_COMMIT ?? "";
  const mode = CONFIRMATIONS[env.CONFIRMATION ?? ""];
  if (
    !/^[0-9a-f]{40}$/.test(expectedCommit) ||
    expectedCommit !== env.GITHUB_SHA ||
    env.GITHUB_REPOSITORY !== "mrdata007/botolago-foundation" ||
    env.GITHUB_REF !== "refs/heads/main" ||
    env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    env.GITHUB_ACTOR !== "mrdata007" ||
    env.GITHUB_RUN_ATTEMPT !== "1" ||
    !mode ||
    env.SUPABASE_PRODUCTION_PROJECT_REF !== "tkewgajrljbwgwedqsxn" ||
    env.SUPABASE_PRODUCTION_PROJECT_NAME !== "BotolaGO Production V2" ||
    env.SUPABASE_PRODUCTION_URL?.replace(/\/$/, "") !==
      "https://tkewgajrljbwgwedqsxn.supabase.co" ||
    !env.SUPABASE_SECRET_KEY
  )
    fail("current_performance_dispatch_guard_failed");
  return {
    mode,
    expectedCommit,
    token: requireSportsMonksToken(env.SPORTSMONKS_API_TOKEN),
    url: env.SUPABASE_PRODUCTION_URL,
    secret: env.SUPABASE_SECRET_KEY,
  };
}

async function rpc(client: RpcClient, name: string, args: Row): Promise<unknown> {
  const result = await client.schema("api").rpc(name, args);
  if (result.error)
    fail("current_performance_rpc_failed", {
      rpcName: name,
      ...(result.error.code && /^[A-Z0-9]{5}$/.test(result.error.code)
        ? { sqlState: result.error.code }
        : {}),
      // The database's own refusal codes (CURRENT_GOALS_CONCEDED_MISMATCH,
      // PLAYER_MAPPING_NOT_FOUND, PLAYER_MEMBERSHIP_NOT_FOUND, ...) say why and
      // name the repair; nothing else is kept.
      ...(result.error.message && /^[A-Z][A-Z_]{2,39}$/.test(result.error.message)
        ? { reason: result.error.message }
        : {}),
    });
  return result.data;
}

/** A finished fixture a pass could not certify, where it stopped, and why. */
export type IncompleteFixture = {
  fixtureExternalId: string;
  /**
   * The only time the fixture listing gives: it has no final whistle
   * (`finalized_at`), and no word on whether the fixture is already certified.
   */
  kickoffAt: string | null;
  stage: "provider" | "validation" | "database";
  code: string;
  diagnostic?: Row;
  /** Present and false when a provider outage earlier in the pass meant it was not fetched. */
  attempted?: false;
};

type ListedFixture = Pick<IncompleteFixture, "fixtureExternalId" | "kickoffAt">;

/**
 * Failures of the provider connection rather than of one fixture. After the
 * first, the rest of the pass reports the same code instead of spending three
 * attempts (and up to 30 s of Retry-After each) on every fixture.
 * `requestSportsMonksJson` throws `provider_http_<status>` once its retries on
 * a 429 or 5xx are spent; any other status (a 404 for one fixture) is that
 * fixture's problem.
 */
export function isProviderOutage(code: string): boolean {
  return (
    [
      "provider_network_failure",
      "provider_access_denied",
      "provider_retry_after_too_long",
      "provider_origin_guard_failed",
      "invalid_provider_path",
    ].includes(code) || /^provider_http_(429|5\d\d)$/.test(code)
  );
}

function isoTime(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function failure(error: unknown): { code: string; diagnostic?: Row } {
  const safe = safeFailure(error);
  return {
    code: String(safe.code),
    ...(safe.diagnostic ? { diagnostic: safe.diagnostic as Row } : {}),
  };
}

export type CurrentPerformanceBatchOptions = {
  mode?: CurrentPerformanceMode;
  /**
   * A provider outage an earlier page of the same pass already met: this page
   * is listed and reported with it, and the provider is not asked again.
   */
  providerOutage?: string | null;
  /**
   * A one-fixture canary. The page starts at this fixture, which must be the
   * first listed; the rest of the page is neither fetched nor written.
   */
  onlyFixtureExternalId?: string | null;
  /** The reviewed owner decisions (current-fixture-owner-decisions.json); tests supply their own. */
  ownerDecisions?: OwnerDecision[];
};

export async function runCurrentPerformanceBatch(
  client: RpcClient,
  token: string,
  afterFixtureExternalId: string | null = null,
  request: typeof requestSportsMonksJson = requestSportsMonksJson,
  options: CurrentPerformanceBatchOptions = {},
) {
  const diagnose = options.mode === "diagnose";
  const only = options.onlyFixtureExternalId ?? null;
  if (afterFixtureExternalId !== null && !/^[1-9]\d{0,14}$/.test(afterFixtureExternalId))
    fail("invalid_fixture_cursor");
  if (only !== null && (afterFixtureExternalId !== null || !/^[1-9]\d{0,14}$/.test(only)))
    fail("invalid_canary_fixture");
  // Provider ids below 2^53 (15 digits at most), so the arithmetic is exact.
  const cursor =
    only !== null ? (only === "1" ? null : String(Number(only) - 1)) : afterFixtureExternalId;
  const batch = row(
    await rpc(client, "football_current_performance_fixture_batch", {
      p_provider_name: "sportsmonks",
      p_season_external_id: String(SEASON),
      p_after_fixture_external_id: cursor,
      p_limit: 5,
    }),
    "batch",
  );
  if (
    batch.seasonExternalId !== String(SEASON) ||
    !Array.isArray(batch.items) ||
    batch.items.length > 5 ||
    typeof batch.hasMore !== "boolean" ||
    (batch.hasMore &&
      (typeof batch.nextCursor !== "string" || !/^[1-9]\d{0,14}$/.test(batch.nextCursor))) ||
    (!batch.hasMore && batch.nextCursor !== null)
  )
    fail("invalid_current_fixture_batch");
  if (batch.items.length === 0) {
    if (batch.hasMore) fail("invalid_current_fixture_batch");
    if (only !== null) fail("canary_fixture_not_listed", { fixtureExternalId: only });
    return {
      verdict: "no_finished_fixtures",
      ...(diagnose ? { writesAttempted: false } : {}),
      fixturesListed: 0,
      fixturesProcessed: 0,
      incomplete: [] as IncompleteFixture[],
      providerOutage: options.providerOutage ?? null,
      hasMore: false,
      nextCursor: null,
    };
  }
  // The page itself is a database contract: a malformed one stops the batch
  // before any provider request.
  let listed: ListedFixture[] = [];
  let previous = cursor === null ? 0 : Number(cursor);
  for (const [index, raw] of batch.items.entries()) {
    const item = row(raw, `batch.items[${index}]`);
    if (
      typeof item.externalFixtureId !== "string" ||
      !/^[1-9]\d{0,14}$/.test(item.externalFixtureId) ||
      Number(item.externalFixtureId) <= previous
    )
      fail("invalid_current_fixture_batch");
    previous = Number(item.externalFixtureId);
    listed.push({ fixtureExternalId: item.externalFixtureId, kickoffAt: isoTime(item.kickoffAt) });
  }
  if (batch.hasMore && batch.nextCursor !== String(previous)) fail("invalid_current_fixture_batch");
  // Only a finished current fixture whose gameweek is not final is listed; a
  // canary that is not first in its own page is not one of them.
  if (only !== null) {
    if (listed[0]!.fixtureExternalId !== only)
      fail("canary_fixture_not_listed", { fixtureExternalId: only });
    listed = listed.slice(0, 1);
  }

  // From here each fixture stands alone. The database writes one fixture per
  // call, in its own transaction, keyed by a digest of the facts (a repeat is
  // a no-op), so a fixture that cannot be certified no longer holds back the
  // ones that can; it is reported with its reason instead.
  const incomplete: IncompleteFixture[] = [];
  const normalized = [];
  let providerOutage = options.providerOutage ?? null;
  // Read before any payload: an approved `nameUnnamedStarter` decision changes
  // what is built from the payload, in diagnose as in ingest.
  const ownerDecisions = options.ownerDecisions ?? loadOwnerDecisions();
  for (const fixture of listed) {
    if (providerOutage) {
      incomplete.push({ ...fixture, stage: "provider", code: providerOutage, attempted: false });
      continue;
    }
    let payload: unknown;
    try {
      payload = await request(
        `/v3/football/fixtures/${fixture.fixtureExternalId}`,
        {
          include: CURRENT_PERFORMANCE_INCLUDE,
          filters: `lineupDetailTypes:${CURRENT_PERFORMANCE_TYPES.join(",")}`,
        },
        token,
      );
    } catch (error) {
      const reason = failure(error);
      if (isProviderOutage(reason.code)) providerOutage = reason.code;
      incomplete.push({ ...fixture, stage: "provider", ...reason });
      continue;
    }
    try {
      const naming = nameUnnamedStarters(
        payload,
        Number(fixture.fixtureExternalId),
        unnamedStarterNames(ownerDecisions, fixture.fixtureExternalId),
      );
      const normalizedFixture = await normalizeCurrentFinishedFixture(
        naming.payload,
        Number(fixture.fixtureExternalId),
      );
      normalized.push({
        ...fixture,
        adaptiveFieldEvidence: collectAdaptiveEvidence(
          naming.payload,
          new Date().toISOString(),
          normalizedFixture.rows,
        ),
        ...normalizedFixture,
        // Which unnamed starter the owner named: part of the provider facts,
        // so of the source version the database digests.
        coverage: {
          ...normalizedFixture.coverage,
          ...(naming.named.length ? { namedUnnamedStarters: naming.named } : {}),
        },
      });
    } catch (error) {
      incomplete.push({ ...fixture, stage: "validation", ...failure(error) });
    }
  }
  if (!diagnose && batch.adaptive === true) {
    for (const gap of [...incomplete]) {
      const status = row(
        await rpc(client, "service_record_adaptive_gap", {
          p_fixture_external_id: gap.fixtureExternalId,
          p_reason: gap.code,
        }),
        "adaptiveGap",
      );
      if (status.certified === true) incomplete.splice(incomplete.indexOf(gap), 1);
    }
  }
  const page = {
    providerOutage,
    // A canary answers for its fixture only; the page cursor is not its to hand on.
    hasMore: only === null ? batch.hasMore : false,
    nextCursor: only === null ? batch.nextCursor : null,
    ...(only !== null ? { canaryFixtureExternalId: only } : {}),
  };

  if (diagnose) {
    return {
      verdict: incomplete.length ? "incomplete" : "pass",
      writesAttempted: false,
      fixturesListed: listed.length,
      fixturesProcessed: 0,
      // Provider ids only (no names), so the mapping and membership each one
      // needs can be checked read-only before anything is ingested.
      fixtures: normalized.map((fixture) => ({
        fixtureExternalId: fixture.fixtureExternalId,
        kickoffAt: fixture.kickoffAt,
        players: fixture.rows.length,
        coverage: fixture.coverage,
        ...(fixture.unnamedRows.length ? { unnamedRows: fixture.unnamedRows } : {}),
        lineup: fixture.rows.map((player) => ({
          externalPlayerId: player.externalPlayerId,
          externalTeamId: player.externalTeamId,
          started: player.started,
        })),
        // Provider facts by id and type id only (no names): role, official minutes,
        // which scoring-relevant statistics carry a value, which are unknown, which
        // are an explicit zero, and which match events name the player.
        participation: fixture.participation,
      })),
      incomplete,
      ...page,
    };
  }

  const fixtures: Row[] = [];
  const observedAt = new Date().toISOString();
  for (const fixture of normalized) {
    try {
      const result = row(
        await rpc(client, "ingest_current_player_fixture_performance", {
          p_provider_name: "sportsmonks",
          p_season_external_id: String(SEASON),
          p_fixture_external_id: fixture.fixtureExternalId,
          p_rows: fixture.rows,
          // Owner decision 2026-10-03: a lineup player the catalogue cannot
          // place is left out when no Fantasy team holds him; the database
          // decides and refuses whatever could change someone's points. It is
          // asked for on every fixture: `batch.adaptive` is season-wide, and
          // the database decides per fixture whether adaptive scoring applies.
          p_coverage: {
            ...fixture.coverage,
            leaveOutUnplacedUnheld: true,
            ...ownerDecisionCoverage(ownerDecisions, fixture.fixtureExternalId),
            ...(batch.adaptive === true
              ? { adaptiveFieldEvidence: fixture.adaptiveFieldEvidence }
              : {}),
          },
          p_observed_at: observedAt,
        }),
        "result",
      );
      const leftOut = result.leftOut ?? 0;
      if (
        typeof leftOut !== "number" ||
        !Number.isSafeInteger(leftOut) ||
        leftOut < 0 ||
        result.active !== fixture.rows.length - leftOut ||
        result.reconciled !== true ||
        (result.scoringStatisticsComplete !== true && result.adaptive !== true) ||
        typeof result.sourceVersion !== "string" ||
        !/^sportsmonks-current-fixture:[0-9a-f]{64}$/.test(result.sourceVersion)
      )
        fail("current_performance_reconciliation_failed");
      if (result.adaptive === true && result.simpleReady !== true)
        incomplete.push({
          fixtureExternalId: fixture.fixtureExternalId,
          kickoffAt: fixture.kickoffAt,
          stage: "validation",
          code: "adaptive_core_pending",
        });
      fixtures.push({
        fixtureExternalId: fixture.fixtureExternalId,
        players: result.active,
        ...(leftOut > 0 ? { leftOut } : {}),
        ...(typeof result.placedAtFixtureClub === "number" && result.placedAtFixtureClub > 0
          ? { placedAtFixtureClub: result.placedAtFixtureClub }
          : {}),
        sourceVersion: result.sourceVersion,
        coverage: fixture.coverage,
        ...(fixture.unnamedRows.length ? { unnamedRows: fixture.unnamedRows } : {}),
      });
    } catch (error) {
      incomplete.push({
        fixtureExternalId: fixture.fixtureExternalId,
        kickoffAt: fixture.kickoffAt,
        stage: "database",
        ...failure(error),
      });
    }
  }
  return {
    verdict: incomplete.length ? "incomplete" : "pass",
    fixturesListed: listed.length,
    fixturesProcessed: fixtures.length,
    fixtures,
    incomplete,
    ...page,
  };
}

/**
 * The manual run is red unless every listed fixture was certified (or, in
 * diagnose mode, would be): a finished fixture left without statistics is the
 * incident, and the evidence names it with its field path or database code.
 */
export function manualRunExitCode(evidence: { verdict?: unknown }): 0 | 1 {
  return evidence.verdict === "pass" || evidence.verdict === "no_finished_fixtures" ? 0 : 1;
}

if (import.meta.main) {
  const config = currentPerformanceGuard(process.env);
  const evidenceDir = process.env.CURRENT_PERFORMANCE_EVIDENCE_DIR;
  if (!evidenceDir) fail("current_performance_evidence_directory_missing");
  await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
  let evidence: Row;
  try {
    const client = createClient(config.url, config.secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    evidence = {
      mode:
        config.mode === "diagnose"
          ? "manual_finished_fixture_diagnostic"
          : "manual_finished_fixture_ingestion",
      expectedCommit: config.expectedCommit,
      ...(await runCurrentPerformanceBatch(
        client,
        config.token,
        process.env.AFTER_FIXTURE_EXTERNAL_ID || null,
        requestSportsMonksJson,
        {
          mode: config.mode,
          onlyFixtureExternalId: process.env.ONLY_FIXTURE_EXTERNAL_ID || null,
        },
      )),
    };
  } catch (error) {
    evidence = { verdict: "fail", expectedCommit: config.expectedCommit, ...safeFailure(error) };
  }
  process.exitCode = manualRunExitCode(evidence);
  await writeFile(
    resolve(evidenceDir, "current-season-performances.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.log(`CURRENT_FINISHED_PERFORMANCE_EVIDENCE_WRITTEN verdict=${String(evidence.verdict)}`);
}
